-- Production fix for indexing queue conflicts
-- This replaces the enqueue_indexing_task function with one that handles duplicates

CREATE OR REPLACE FUNCTION enqueue_indexing_task(
  p_resource_type TEXT,
  p_resource_id UUID,
  p_workspace_id UUID,
  p_operation TEXT,
  p_priority INTEGER DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
  -- Use UPSERT to handle duplicate entries
  -- If a pending task already exists, just update its metadata and timestamp
  INSERT INTO indexing_queue (
    resource_type,
    resource_id,
    workspace_id,
    operation,
    status,
    priority,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    p_resource_type,
    p_resource_id,
    p_workspace_id,
    p_operation,
    'pending',
    p_priority,
    p_metadata,
    NOW(),
    NOW()
  )
  ON CONFLICT (resource_type, resource_id, operation, status) 
  DO UPDATE SET
    metadata = EXCLUDED.metadata || indexing_queue.metadata,
    priority = GREATEST(EXCLUDED.priority, indexing_queue.priority),
    updated_at = NOW();
    
  -- Log for debugging (optional, can be removed in production)
  RAISE NOTICE 'Indexing task queued/updated: % % %', p_resource_type, p_resource_id, p_operation;
  
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the transaction
  RAISE WARNING 'Failed to queue indexing task: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Optional: Clear the existing queue to start fresh
TRUNCATE TABLE indexing_queue;