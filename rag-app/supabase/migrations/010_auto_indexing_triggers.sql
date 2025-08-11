-- Create a queue table for indexing tasks
CREATE TABLE IF NOT EXISTS indexing_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('block', 'database', 'page', 'row')),
  resource_id UUID NOT NULL,
  workspace_id UUID,
  action TEXT NOT NULL CHECK (action IN ('index', 'update', 'delete')),
  priority INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS indexing_queue_status_idx ON indexing_queue(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS indexing_queue_resource_idx ON indexing_queue(resource_type, resource_id);

-- Function to queue indexing tasks
CREATE OR REPLACE FUNCTION queue_indexing_task(
  p_resource_type TEXT,
  p_resource_id UUID,
  p_workspace_id UUID,
  p_action TEXT,
  p_priority INTEGER DEFAULT 5
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_task_id UUID;
BEGIN
  -- Check if a similar pending task already exists
  SELECT id INTO v_task_id
  FROM indexing_queue
  WHERE resource_type = p_resource_type
    AND resource_id = p_resource_id
    AND action = p_action
    AND status = 'pending';
  
  IF v_task_id IS NOT NULL THEN
    -- Update priority if higher
    UPDATE indexing_queue
    SET priority = GREATEST(priority, p_priority)
    WHERE id = v_task_id;
    
    RETURN v_task_id;
  END IF;
  
  -- Insert new task
  INSERT INTO indexing_queue (
    resource_type,
    resource_id,
    workspace_id,
    action,
    priority
  ) VALUES (
    p_resource_type,
    p_resource_id,
    p_workspace_id,
    p_action,
    p_priority
  ) RETURNING id INTO v_task_id;
  
  RETURN v_task_id;
END;
$$;

-- Trigger function for block changes
CREATE OR REPLACE FUNCTION trigger_block_indexing()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  -- Get workspace_id from page
  IF NEW.page_id IS NOT NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM pages
    WHERE id = NEW.page_id;
  END IF;
  
  IF TG_OP = 'INSERT' THEN
    PERFORM queue_indexing_task('block', NEW.id, v_workspace_id, 'index');
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only reindex if content changed
    IF OLD.content IS DISTINCT FROM NEW.content OR 
       OLD.properties IS DISTINCT FROM NEW.properties THEN
      PERFORM queue_indexing_task('block', NEW.id, v_workspace_id, 'update');
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM queue_indexing_task('block', OLD.id, v_workspace_id, 'delete');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for database block changes
CREATE OR REPLACE FUNCTION trigger_database_indexing()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM queue_indexing_task('database', NEW.id, NEW.workspace_id, 'index');
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only reindex if significant changes
    IF OLD.name IS DISTINCT FROM NEW.name OR 
       OLD.description IS DISTINCT FROM NEW.description OR
       OLD.schema IS DISTINCT FROM NEW.schema THEN
      PERFORM queue_indexing_task('database', NEW.id, NEW.workspace_id, 'update');
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM queue_indexing_task('database', OLD.id, OLD.workspace_id, 'delete');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for database row changes
CREATE OR REPLACE FUNCTION trigger_database_row_indexing()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id UUID;
  v_last_index_time TIMESTAMP;
  v_should_index BOOLEAN := FALSE;
BEGIN
  -- Get workspace_id from database block
  SELECT workspace_id INTO v_workspace_id
  FROM db_blocks
  WHERE id = COALESCE(NEW.db_block_id, OLD.db_block_id);
  
  -- Check last index time for this database (batch updates)
  SELECT MAX(created_at) INTO v_last_index_time
  FROM indexing_queue
  WHERE resource_type = 'database'
    AND resource_id = COALESCE(NEW.db_block_id, OLD.db_block_id)
    AND status IN ('pending', 'processing')
    AND created_at > NOW() - INTERVAL '1 minute';
  
  -- Only queue if no recent indexing task exists
  IF v_last_index_time IS NULL THEN
    v_should_index := TRUE;
  END IF;
  
  IF v_should_index THEN
    -- Queue database reindex with lower priority
    PERFORM queue_indexing_task(
      'database', 
      COALESCE(NEW.db_block_id, OLD.db_block_id), 
      v_workspace_id, 
      'update',
      3 -- Lower priority for row updates
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic indexing
DROP TRIGGER IF EXISTS blocks_indexing_trigger ON blocks;
CREATE TRIGGER blocks_indexing_trigger
  AFTER INSERT OR UPDATE OR DELETE ON blocks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_block_indexing();

DROP TRIGGER IF EXISTS db_blocks_indexing_trigger ON db_blocks;
CREATE TRIGGER db_blocks_indexing_trigger
  AFTER INSERT OR UPDATE OR DELETE ON db_blocks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_database_indexing();

DROP TRIGGER IF EXISTS db_rows_indexing_trigger ON db_block_rows;
CREATE TRIGGER db_rows_indexing_trigger
  AFTER INSERT OR UPDATE OR DELETE ON db_block_rows
  FOR EACH ROW
  EXECUTE FUNCTION trigger_database_row_indexing();

-- Function to process indexing queue (called by a worker)
CREATE OR REPLACE FUNCTION process_indexing_queue(
  p_batch_size INTEGER DEFAULT 10
)
RETURNS TABLE (
  task_id UUID,
  resource_type TEXT,
  resource_id UUID,
  workspace_id UUID,
  action TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE indexing_queue
  SET status = 'processing',
      processed_at = NOW()
  WHERE id IN (
    SELECT id
    FROM indexing_queue
    WHERE status = 'pending'
      AND retry_count < 3
    ORDER BY priority DESC, created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, indexing_queue.resource_type, indexing_queue.resource_id, 
            indexing_queue.workspace_id, indexing_queue.action;
END;
$$;

-- Function to mark task as completed
CREATE OR REPLACE FUNCTION complete_indexing_task(
  p_task_id UUID,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_success THEN
    UPDATE indexing_queue
    SET status = 'completed',
        processed_at = NOW()
    WHERE id = p_task_id;
  ELSE
    UPDATE indexing_queue
    SET status = CASE 
          WHEN retry_count >= 2 THEN 'failed'
          ELSE 'pending'
        END,
        retry_count = retry_count + 1,
        error_message = p_error_message
    WHERE id = p_task_id;
  END IF;
END;
$$;

-- Clean up old completed tasks
CREATE OR REPLACE FUNCTION cleanup_indexing_queue()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM indexing_queue
  WHERE status = 'completed'
    AND processed_at < NOW() - INTERVAL '7 days';
    
  DELETE FROM indexing_queue
  WHERE status = 'failed'
    AND processed_at < NOW() - INTERVAL '30 days';
END;
$$;