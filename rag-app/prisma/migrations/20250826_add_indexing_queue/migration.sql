-- Create indexing_queue table
CREATE TABLE IF NOT EXISTS indexing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL, -- 'page', 'block', 'database', 'row'
  entity_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  operation VARCHAR(20) NOT NULL, -- 'insert', 'update', 'delete'
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  priority INTEGER DEFAULT 5, -- 1-10, higher = more important
  metadata JSONB DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,
  worker_id VARCHAR(100), -- Track which worker is processing
  
  -- Indexes for efficient querying
  CONSTRAINT indexing_queue_entity_type_check CHECK (entity_type IN ('page', 'block', 'database', 'row')),
  CONSTRAINT indexing_queue_operation_check CHECK (operation IN ('insert', 'update', 'delete')),
  CONSTRAINT indexing_queue_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Create indexes for efficient queue processing
CREATE INDEX idx_indexing_queue_status ON indexing_queue(status) WHERE status = 'pending';
CREATE INDEX idx_indexing_queue_priority ON indexing_queue(priority DESC, created_at ASC) WHERE status = 'pending';
CREATE INDEX idx_indexing_queue_entity ON indexing_queue(entity_type, entity_id);
CREATE INDEX idx_indexing_queue_workspace ON indexing_queue(workspace_id);
CREATE INDEX idx_indexing_queue_created_at ON indexing_queue(created_at);

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_indexing_queue_updated_at 
  BEFORE UPDATE ON indexing_queue 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to queue indexing tasks
CREATE OR REPLACE FUNCTION queue_indexing_task(
  p_entity_type VARCHAR(50),
  p_entity_id UUID,
  p_workspace_id UUID,
  p_operation VARCHAR(20),
  p_priority INTEGER DEFAULT 5,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_task_id UUID;
BEGIN
  -- Check if a similar pending task already exists (deduplication)
  SELECT id INTO v_task_id
  FROM indexing_queue
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND operation = p_operation
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_task_id IS NOT NULL THEN
    -- Update priority if new task has higher priority
    UPDATE indexing_queue
    SET priority = GREATEST(priority, p_priority),
        metadata = metadata || p_metadata,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_task_id;
    
    RETURN v_task_id;
  ELSE
    -- Insert new task
    INSERT INTO indexing_queue (
      entity_type, 
      entity_id, 
      workspace_id, 
      operation, 
      priority, 
      metadata
    ) VALUES (
      p_entity_type,
      p_entity_id,
      p_workspace_id,
      p_operation,
      p_priority,
      p_metadata
    ) RETURNING id INTO v_task_id;
    
    -- Send notification for real-time processing
    PERFORM pg_notify('indexing_task_created', json_build_object(
      'task_id', v_task_id,
      'entity_type', p_entity_type,
      'entity_id', p_entity_id,
      'operation', p_operation,
      'priority', p_priority
    )::text);
    
    RETURN v_task_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function for page changes
CREATE OR REPLACE FUNCTION trigger_page_indexing()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id UUID;
  v_operation VARCHAR(20);
  v_priority INTEGER;
  v_metadata JSONB;
BEGIN
  -- Determine operation type
  IF TG_OP = 'DELETE' THEN
    v_operation := 'delete';
    v_workspace_id := OLD.workspace_id;
    v_priority := 8; -- Higher priority for deletions
    v_metadata := jsonb_build_object(
      'title', OLD.title,
      'deleted_at', CURRENT_TIMESTAMP
    );
    
    -- Queue deletion task
    PERFORM queue_indexing_task(
      'page',
      OLD.id,
      v_workspace_id,
      v_operation,
      v_priority,
      v_metadata
    );
    
    RETURN OLD;
  ELSE
    -- For INSERT or UPDATE
    v_workspace_id := NEW.workspace_id;
    
    IF TG_OP = 'INSERT' THEN
      v_operation := 'insert';
      v_priority := 6; -- Medium priority for new content
    ELSE
      v_operation := 'update';
      -- Check if content actually changed
      IF OLD.content IS DISTINCT FROM NEW.content OR 
         OLD.blocks IS DISTINCT FROM NEW.blocks OR
         OLD.title IS DISTINCT FROM NEW.title THEN
        v_priority := 7; -- Higher priority for actual changes
      ELSE
        -- No content changes, skip indexing
        RETURN NEW;
      END IF;
    END IF;
    
    v_metadata := jsonb_build_object(
      'title', NEW.title,
      'has_blocks', NEW.blocks IS NOT NULL,
      'has_content', NEW.content IS NOT NULL,
      'updated_at', NEW.updated_at
    );
    
    -- Queue indexing task
    PERFORM queue_indexing_task(
      'page',
      NEW.id,
      v_workspace_id,
      v_operation,
      v_priority,
      v_metadata
    );
    
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on pages table
DROP TRIGGER IF EXISTS pages_indexing_trigger ON pages;
CREATE TRIGGER pages_indexing_trigger
  AFTER INSERT OR UPDATE OR DELETE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_page_indexing();

-- Create function to process queue tasks (for RPC call)
CREATE OR REPLACE FUNCTION process_indexing_queue(
  p_batch_size INTEGER DEFAULT 10,
  p_worker_id VARCHAR(100) DEFAULT NULL
) RETURNS TABLE (
  task_id UUID,
  entity_type VARCHAR(50),
  entity_id UUID,
  workspace_id UUID,
  operation VARCHAR(20),
  priority INTEGER,
  metadata JSONB
) AS $$
BEGIN
  -- Mark tasks as processing and return them
  RETURN QUERY
  UPDATE indexing_queue
  SET status = 'processing',
      worker_id = p_worker_id,
      updated_at = CURRENT_TIMESTAMP
  FROM (
    SELECT id
    FROM indexing_queue
    WHERE status = 'pending'
      AND retry_count < 3
    ORDER BY priority DESC, created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ) AS selected
  WHERE indexing_queue.id = selected.id
  RETURNING 
    indexing_queue.id AS task_id,
    indexing_queue.entity_type,
    indexing_queue.entity_id,
    indexing_queue.workspace_id,
    indexing_queue.operation,
    indexing_queue.priority,
    indexing_queue.metadata;
END;
$$ LANGUAGE plpgsql;

-- Create function to mark task as completed
CREATE OR REPLACE FUNCTION complete_indexing_task(
  p_task_id UUID,
  p_success BOOLEAN DEFAULT TRUE,
  p_error_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  UPDATE indexing_queue
  SET status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
      processed_at = CURRENT_TIMESTAMP,
      error_message = p_error_message,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to retry failed tasks
CREATE OR REPLACE FUNCTION retry_failed_indexing_tasks()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE indexing_queue
  SET status = 'pending',
      retry_count = retry_count + 1,
      worker_id = NULL,
      error_message = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE status = 'failed'
    AND retry_count < 3
    AND created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Create cleanup function to remove old completed tasks
CREATE OR REPLACE FUNCTION cleanup_indexing_queue()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM indexing_queue
  WHERE status = 'completed'
    AND processed_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;