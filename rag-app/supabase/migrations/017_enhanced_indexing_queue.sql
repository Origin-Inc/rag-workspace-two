-- Enhanced Indexing Queue Schema for Real-time RAG Pipeline
-- Task 19.1: Create comprehensive indexing queue database schema

-- Drop existing table if it exists to rebuild with proper structure
DROP TABLE IF EXISTS indexing_queue CASCADE;

-- Create the main indexing queue table with all necessary fields
CREATE TABLE indexing_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Entity identification
  entity_type TEXT NOT NULL CHECK (entity_type IN ('page', 'block', 'document', 'database', 'row')),
  entity_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  
  -- Operation details
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  
  -- Processing control
  priority INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  
  -- Metadata for processing
  metadata JSONB DEFAULT '{}',
  
  -- Error tracking
  error_message TEXT,
  error_details JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Performance tracking
  processing_time_ms INTEGER,
  
  -- Batch processing support
  batch_id UUID,
  batch_position INTEGER,
  
  -- Deduplication support
  content_hash TEXT,
  
  -- Indexing for performance
  CONSTRAINT unique_pending_entity UNIQUE (entity_type, entity_id, operation, status) 
    DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for efficient querying
CREATE INDEX idx_indexing_queue_status ON indexing_queue(status) WHERE status = 'pending';
CREATE INDEX idx_indexing_queue_priority ON indexing_queue(priority DESC, created_at ASC) WHERE status = 'pending';
CREATE INDEX idx_indexing_queue_workspace ON indexing_queue(workspace_id);
CREATE INDEX idx_indexing_queue_entity ON indexing_queue(entity_type, entity_id);
CREATE INDEX idx_indexing_queue_batch ON indexing_queue(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_indexing_queue_scheduled ON indexing_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_indexing_queue_created ON indexing_queue(created_at);

-- Create a table for tracking indexing statistics
CREATE TABLE IF NOT EXISTS indexing_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  
  -- Counters
  total_indexed BIGINT DEFAULT 0,
  total_failed BIGINT DEFAULT 0,
  total_retried BIGINT DEFAULT 0,
  
  -- Performance metrics
  avg_processing_time_ms NUMERIC(10, 2),
  p95_processing_time_ms NUMERIC(10, 2),
  p99_processing_time_ms NUMERIC(10, 2),
  
  -- Time windows
  hour_bucket TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(workspace_id, entity_type, hour_bucket)
);

-- Create index for stats queries
CREATE INDEX idx_indexing_stats_workspace_hour ON indexing_stats(workspace_id, hour_bucket DESC);

-- Function to enqueue indexing task with deduplication
CREATE OR REPLACE FUNCTION enqueue_indexing_task(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_workspace_id UUID,
  p_operation TEXT,
  p_priority INTEGER DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'
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
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND operation = p_operation
    AND status = 'pending';
  
  IF v_task_id IS NOT NULL THEN
    -- Update priority if new one is higher
    UPDATE indexing_queue
    SET priority = GREATEST(priority, p_priority),
        metadata = metadata || p_metadata
    WHERE id = v_task_id;
    
    RETURN v_task_id;
  END IF;
  
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
  
  RETURN v_task_id;
END;
$$;

-- Function to batch enqueue multiple tasks
CREATE OR REPLACE FUNCTION batch_enqueue_indexing_tasks(
  p_tasks JSONB
)
RETURNS TABLE (task_id UUID, entity_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_batch_id UUID := gen_random_uuid();
  v_task JSONB;
  v_position INTEGER := 0;
BEGIN
  FOR v_task IN SELECT * FROM jsonb_array_elements(p_tasks)
  LOOP
    v_position := v_position + 1;
    
    RETURN QUERY
    INSERT INTO indexing_queue (
      entity_type,
      entity_id,
      workspace_id,
      operation,
      priority,
      metadata,
      batch_id,
      batch_position
    ) VALUES (
      v_task->>'entity_type',
      (v_task->>'entity_id')::UUID,
      (v_task->>'workspace_id')::UUID,
      v_task->>'operation',
      COALESCE((v_task->>'priority')::INTEGER, 0),
      COALESCE(v_task->'metadata', '{}'),
      v_batch_id,
      v_position
    ) RETURNING id, indexing_queue.entity_id;
  END LOOP;
END;
$$;

-- Function to get next batch of tasks for processing
CREATE OR REPLACE FUNCTION get_next_indexing_batch(
  p_batch_size INTEGER DEFAULT 100,
  p_worker_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  task_id UUID,
  entity_type TEXT,
  entity_id UUID,
  workspace_id UUID,
  operation TEXT,
  priority INTEGER,
  metadata JSONB,
  retry_count INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE indexing_queue
  SET status = 'processing',
      started_at = NOW(),
      metadata = CASE 
        WHEN p_worker_id IS NOT NULL 
        THEN metadata || jsonb_build_object('worker_id', p_worker_id)
        ELSE metadata
      END
  WHERE id IN (
    SELECT id
    FROM indexing_queue
    WHERE status = 'pending'
      AND scheduled_at <= NOW()
      AND retry_count < max_retries
    ORDER BY priority DESC, created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    id,
    indexing_queue.entity_type,
    indexing_queue.entity_id,
    indexing_queue.workspace_id,
    indexing_queue.operation,
    indexing_queue.priority,
    indexing_queue.metadata,
    indexing_queue.retry_count;
END;
$$;

-- Function to mark task as completed with metrics
CREATE OR REPLACE FUNCTION complete_indexing_task_with_metrics(
  p_task_id UUID,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL,
  p_error_details JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_task RECORD;
  v_processing_time_ms INTEGER;
BEGIN
  -- Get task details
  SELECT * INTO v_task
  FROM indexing_queue
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate processing time
  v_processing_time_ms := EXTRACT(EPOCH FROM (NOW() - v_task.started_at)) * 1000;
  
  IF p_success THEN
    -- Mark as completed
    UPDATE indexing_queue
    SET status = 'completed',
        completed_at = NOW(),
        processing_time_ms = v_processing_time_ms
    WHERE id = p_task_id;
    
    -- Update statistics
    INSERT INTO indexing_stats (
      workspace_id,
      entity_type,
      hour_bucket,
      total_indexed,
      avg_processing_time_ms
    ) VALUES (
      v_task.workspace_id,
      v_task.entity_type,
      date_trunc('hour', NOW()),
      1,
      v_processing_time_ms
    )
    ON CONFLICT (workspace_id, entity_type, hour_bucket)
    DO UPDATE SET
      total_indexed = indexing_stats.total_indexed + 1,
      avg_processing_time_ms = 
        (indexing_stats.avg_processing_time_ms * indexing_stats.total_indexed + v_processing_time_ms) 
        / (indexing_stats.total_indexed + 1),
      updated_at = NOW();
  ELSE
    -- Mark as failed or schedule retry
    IF v_task.retry_count < v_task.max_retries THEN
      -- Schedule retry with exponential backoff
      UPDATE indexing_queue
      SET status = 'pending',
          retry_count = retry_count + 1,
          scheduled_at = NOW() + (INTERVAL '1 minute' * POWER(2, v_task.retry_count)),
          error_message = p_error_message,
          error_details = p_error_details,
          started_at = NULL
      WHERE id = p_task_id;
      
      -- Update retry statistics
      UPDATE indexing_stats
      SET total_retried = total_retried + 1
      WHERE workspace_id = v_task.workspace_id
        AND entity_type = v_task.entity_type
        AND hour_bucket = date_trunc('hour', NOW());
    ELSE
      -- Max retries reached, mark as failed
      UPDATE indexing_queue
      SET status = 'failed',
          completed_at = NOW(),
          processing_time_ms = v_processing_time_ms,
          error_message = p_error_message,
          error_details = p_error_details
      WHERE id = p_task_id;
      
      -- Update failure statistics
      UPDATE indexing_stats
      SET total_failed = total_failed + 1
      WHERE workspace_id = v_task.workspace_id
        AND entity_type = v_task.entity_type
        AND hour_bucket = date_trunc('hour', NOW());
    END IF;
  END IF;
END;
$$;

-- Function to clean up old completed tasks
CREATE OR REPLACE FUNCTION cleanup_old_indexing_tasks(
  p_days_to_keep INTEGER DEFAULT 7
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM indexing_queue
  WHERE status IN ('completed', 'cancelled')
    AND completed_at < NOW() - INTERVAL '1 day' * p_days_to_keep;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

-- Function to reset stuck tasks
CREATE OR REPLACE FUNCTION reset_stuck_indexing_tasks(
  p_stuck_threshold_minutes INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_reset_count INTEGER;
BEGIN
  UPDATE indexing_queue
  SET status = 'pending',
      retry_count = retry_count + 1,
      scheduled_at = NOW() + INTERVAL '1 minute',
      started_at = NULL,
      error_message = 'Task was stuck in processing state'
  WHERE status = 'processing'
    AND started_at < NOW() - INTERVAL '1 minute' * p_stuck_threshold_minutes;
  
  GET DIAGNOSTICS v_reset_count = ROW_COUNT;
  
  RETURN v_reset_count;
END;
$$;

-- Function to get indexing queue statistics
CREATE OR REPLACE FUNCTION get_indexing_queue_stats(
  p_workspace_id UUID DEFAULT NULL
)
RETURNS TABLE (
  status TEXT,
  count BIGINT,
  avg_wait_time_seconds NUMERIC,
  avg_processing_time_ms NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    iq.status,
    COUNT(*)::BIGINT,
    AVG(EXTRACT(EPOCH FROM (NOW() - iq.created_at)))::NUMERIC AS avg_wait_time_seconds,
    AVG(iq.processing_time_ms)::NUMERIC AS avg_processing_time_ms
  FROM indexing_queue iq
  WHERE (p_workspace_id IS NULL OR iq.workspace_id = p_workspace_id)
  GROUP BY iq.status;
END;
$$;

-- Create a view for monitoring active tasks
CREATE OR REPLACE VIEW active_indexing_tasks AS
SELECT 
  id,
  entity_type,
  entity_id,
  workspace_id,
  operation,
  status,
  priority,
  retry_count,
  EXTRACT(EPOCH FROM (NOW() - created_at)) AS age_seconds,
  CASE 
    WHEN status = 'processing' THEN EXTRACT(EPOCH FROM (NOW() - started_at))
    ELSE NULL
  END AS processing_seconds,
  error_message
FROM indexing_queue
WHERE status IN ('pending', 'processing')
ORDER BY priority DESC, created_at ASC;

-- Grant appropriate permissions
GRANT SELECT ON indexing_queue TO authenticated;
GRANT SELECT ON indexing_stats TO authenticated;
GRANT SELECT ON active_indexing_tasks TO authenticated;
GRANT EXECUTE ON FUNCTION enqueue_indexing_task TO authenticated;
GRANT EXECUTE ON FUNCTION get_indexing_queue_stats TO authenticated;