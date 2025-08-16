-- Fix for missing process_indexing_queue function
-- This creates the function if it doesn't exist

-- Drop existing function if it exists with different signature
DROP FUNCTION IF EXISTS process_indexing_queue(INTEGER);
DROP FUNCTION IF EXISTS process_indexing_queue(INT);

-- Create function to process indexing queue (called by worker)
CREATE OR REPLACE FUNCTION process_indexing_queue(
  p_batch_size INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
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
  WHERE indexing_queue.id IN (
    SELECT iq.id
    FROM indexing_queue iq
    WHERE iq.status = 'pending'
      AND iq.retry_count < 3
    ORDER BY iq.priority DESC, iq.created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    indexing_queue.id, 
    indexing_queue.resource_type, 
    indexing_queue.resource_id, 
    indexing_queue.workspace_id, 
    indexing_queue.action;
END;
$$;

-- Also ensure complete_indexing_task exists
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
    SET status = 'failed',
        processed_at = NOW(),
        error_message = p_error_message,
        retry_count = retry_count + 1
    WHERE id = p_task_id;
  END IF;
END;
$$;

-- Also ensure cleanup_indexing_queue exists
CREATE OR REPLACE FUNCTION cleanup_indexing_queue()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete completed tasks older than 7 days
  DELETE FROM indexing_queue
  WHERE status = 'completed'
    AND processed_at < NOW() - INTERVAL '7 days';
  
  -- Reset stuck processing tasks
  UPDATE indexing_queue
  SET status = 'pending',
      retry_count = retry_count + 1
  WHERE status = 'processing'
    AND processed_at < NOW() - INTERVAL '1 hour';
END;
$$;