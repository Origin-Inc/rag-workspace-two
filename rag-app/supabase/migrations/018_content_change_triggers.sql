-- Task 19.2: PostgreSQL triggers for automatic content change tracking
-- These triggers automatically queue content for indexing when changes occur

-- Function to queue content changes for indexing
CREATE OR REPLACE FUNCTION queue_content_for_indexing()
RETURNS TRIGGER AS $$
DECLARE
  v_entity_type TEXT;
  v_entity_id UUID;
  v_workspace_id UUID;
  v_operation TEXT;
  v_priority INTEGER DEFAULT 0;
  v_metadata JSONB DEFAULT '{}';
BEGIN
  -- Determine operation type
  IF TG_OP = 'DELETE' THEN
    v_operation := 'delete';
    v_entity_id := OLD.id;
    v_workspace_id := COALESCE(OLD.workspace_id, OLD.workspace_id);
  ELSIF TG_OP = 'INSERT' THEN
    v_operation := 'insert';
    v_entity_id := NEW.id;
    v_workspace_id := COALESCE(NEW.workspace_id, NEW.workspace_id);
  ELSE -- UPDATE
    v_operation := 'update';
    v_entity_id := NEW.id;
    v_workspace_id := COALESCE(NEW.workspace_id, NEW.workspace_id);
  END IF;
  
  -- Determine entity type based on table name
  v_entity_type := CASE TG_TABLE_NAME
    WHEN 'pages' THEN 'page'
    WHEN 'blocks' THEN 'block'
    WHEN 'documents' THEN 'document'
    WHEN 'db_blocks' THEN 'database'
    WHEN 'db_block_rows' THEN 'row'
    ELSE TG_TABLE_NAME
  END;
  
  -- Set priority based on entity type
  v_priority := CASE v_entity_type
    WHEN 'page' THEN 10
    WHEN 'block' THEN 5
    WHEN 'database' THEN 8
    WHEN 'document' THEN 3
    WHEN 'row' THEN 2
    ELSE 0
  END;
  
  -- Add metadata based on operation and entity type
  IF TG_OP = 'UPDATE' THEN
    -- Track which columns changed for optimization
    v_metadata := jsonb_build_object(
      'changed_columns', (
        SELECT jsonb_agg(column_name)
        FROM (
          SELECT unnest(akeys(hstore(NEW) - hstore(OLD))) AS column_name
        ) AS changed
      ),
      'table_name', TG_TABLE_NAME,
      'operation_timestamp', NOW()
    );
  ELSE
    v_metadata := jsonb_build_object(
      'table_name', TG_TABLE_NAME,
      'operation_timestamp', NOW()
    );
  END IF;
  
  -- Special handling for specific entity types
  IF v_entity_type = 'block' THEN
    -- Add page_id to metadata for blocks
    IF TG_OP != 'DELETE' THEN
      v_metadata := v_metadata || jsonb_build_object('page_id', NEW.page_id);
      -- Also queue the parent page for re-indexing with lower priority
      PERFORM enqueue_indexing_task(
        'page',
        NEW.page_id,
        v_workspace_id,
        'update',
        v_priority - 2,
        jsonb_build_object('triggered_by', 'block_change', 'block_id', v_entity_id)
      );
    END IF;
  ELSIF v_entity_type = 'row' THEN
    -- For database rows, queue the parent database block
    IF TG_OP != 'DELETE' THEN
      v_metadata := v_metadata || jsonb_build_object('db_block_id', NEW.db_block_id);
      -- Queue database for re-indexing
      PERFORM enqueue_indexing_task(
        'database',
        NEW.db_block_id,
        v_workspace_id,
        'update',
        v_priority + 3,
        jsonb_build_object('triggered_by', 'row_change', 'row_id', v_entity_id)
      );
    ELSE
      -- For deletes, we need to extract db_block_id from OLD
      IF OLD.db_block_id IS NOT NULL THEN
        PERFORM enqueue_indexing_task(
          'database',
          OLD.db_block_id,
          v_workspace_id,
          'update',
          v_priority + 3,
          jsonb_build_object('triggered_by', 'row_delete', 'row_id', v_entity_id)
        );
      END IF;
    END IF;
    -- Don't queue individual row changes
    RETURN NULL;
  END IF;
  
  -- Queue the indexing task
  PERFORM enqueue_indexing_task(
    v_entity_type,
    v_entity_id,
    v_workspace_id,
    v_operation,
    v_priority,
    v_metadata
  );
  
  -- Notify via pg_notify for real-time processing
  PERFORM pg_notify(
    'indexing_queue_update',
    json_build_object(
      'entity_type', v_entity_type,
      'entity_id', v_entity_id,
      'workspace_id', v_workspace_id,
      'operation', v_operation
    )::text
  );
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS index_pages_changes ON pages;
DROP TRIGGER IF EXISTS index_blocks_changes ON blocks;
DROP TRIGGER IF EXISTS index_documents_changes ON documents;
DROP TRIGGER IF EXISTS index_db_blocks_changes ON db_blocks;
DROP TRIGGER IF EXISTS index_db_block_rows_changes ON db_block_rows;

-- Create trigger for pages table
CREATE TRIGGER index_pages_changes
AFTER INSERT OR UPDATE OR DELETE ON pages
FOR EACH ROW EXECUTE FUNCTION queue_content_for_indexing();

-- Create trigger for blocks table
CREATE TRIGGER index_blocks_changes
AFTER INSERT OR UPDATE OR DELETE ON blocks
FOR EACH ROW EXECUTE FUNCTION queue_content_for_indexing();

-- Create trigger for documents table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
    CREATE TRIGGER index_documents_changes
    AFTER INSERT OR UPDATE OR DELETE ON documents
    FOR EACH ROW EXECUTE FUNCTION queue_content_for_indexing();
  END IF;
END $$;

-- Create trigger for db_blocks table
CREATE TRIGGER index_db_blocks_changes
AFTER INSERT OR UPDATE OR DELETE ON db_blocks
FOR EACH ROW EXECUTE FUNCTION queue_content_for_indexing();

-- Create trigger for db_block_rows table
CREATE TRIGGER index_db_block_rows_changes
AFTER INSERT OR UPDATE OR DELETE ON db_block_rows
FOR EACH ROW EXECUTE FUNCTION queue_content_for_indexing();

-- Function to handle bulk content changes (for batch operations)
-- Note: This function is designed for STATEMENT level triggers
CREATE OR REPLACE FUNCTION queue_bulk_content_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_tasks JSONB := '[]'::JSONB;
BEGIN
  -- For statement-level triggers, we can't iterate over individual rows
  -- Instead, we'll create a simplified batch task
  v_tasks := jsonb_build_object(
    'entity_type', TG_ARGV[0],
    'operation', LOWER(TG_OP),
    'priority', COALESCE(TG_ARGV[1]::INTEGER, 0),
    'batch', true,
    'table_name', TG_TABLE_NAME
  );
  
  -- Notify about batch changes
  PERFORM pg_notify(
    'indexing_batch_update',
    v_tasks::text
  );
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to temporarily disable indexing triggers (for maintenance)
CREATE OR REPLACE FUNCTION disable_indexing_triggers()
RETURNS VOID AS $$
BEGIN
  ALTER TABLE pages DISABLE TRIGGER index_pages_changes;
  ALTER TABLE blocks DISABLE TRIGGER index_blocks_changes;
  ALTER TABLE db_blocks DISABLE TRIGGER index_db_blocks_changes;
  ALTER TABLE db_block_rows DISABLE TRIGGER index_db_block_rows_changes;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
    ALTER TABLE documents DISABLE TRIGGER index_documents_changes;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to re-enable indexing triggers
CREATE OR REPLACE FUNCTION enable_indexing_triggers()
RETURNS VOID AS $$
BEGIN
  ALTER TABLE pages ENABLE TRIGGER index_pages_changes;
  ALTER TABLE blocks ENABLE TRIGGER index_blocks_changes;
  ALTER TABLE db_blocks ENABLE TRIGGER index_db_blocks_changes;
  ALTER TABLE db_block_rows ENABLE TRIGGER index_db_block_rows_changes;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
    ALTER TABLE documents ENABLE TRIGGER index_documents_changes;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to manually queue all content for re-indexing
CREATE OR REPLACE FUNCTION queue_all_content_for_reindexing(
  p_workspace_id UUID DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_batch_size INTEGER := 1000;
  v_offset INTEGER := 0;
  v_tasks JSONB;
BEGIN
  -- Disable triggers temporarily to avoid duplicate queuing
  PERFORM disable_indexing_triggers();
  
  -- Queue pages
  IF p_entity_type IS NULL OR p_entity_type = 'page' THEN
    LOOP
      v_tasks := '[]'::JSONB;
      
      SELECT jsonb_agg(
        jsonb_build_object(
          'entity_type', 'page',
          'entity_id', id,
          'workspace_id', workspace_id,
          'operation', 'update',
          'priority', -1
        )
      ) INTO v_tasks
      FROM (
        SELECT id, workspace_id
        FROM pages
        WHERE (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
        ORDER BY id
        LIMIT v_batch_size
        OFFSET v_offset
      ) AS batch;
      
      EXIT WHEN v_tasks IS NULL OR jsonb_array_length(v_tasks) = 0;
      
      PERFORM batch_enqueue_indexing_tasks(v_tasks);
      v_count := v_count + jsonb_array_length(v_tasks);
      v_offset := v_offset + v_batch_size;
    END LOOP;
  END IF;
  
  -- Queue blocks
  IF p_entity_type IS NULL OR p_entity_type = 'block' THEN
    v_offset := 0;
    LOOP
      v_tasks := '[]'::JSONB;
      
      SELECT jsonb_agg(
        jsonb_build_object(
          'entity_type', 'block',
          'entity_id', b.id,
          'workspace_id', p.workspace_id,
          'operation', 'update',
          'priority', -2
        )
      ) INTO v_tasks
      FROM (
        SELECT b.id, b.page_id
        FROM blocks b
        JOIN pages p ON p.id = b.page_id
        WHERE (p_workspace_id IS NULL OR p.workspace_id = p_workspace_id)
        ORDER BY b.id
        LIMIT v_batch_size
        OFFSET v_offset
      ) AS b
      JOIN pages p ON p.id = b.page_id;
      
      EXIT WHEN v_tasks IS NULL OR jsonb_array_length(v_tasks) = 0;
      
      PERFORM batch_enqueue_indexing_tasks(v_tasks);
      v_count := v_count + jsonb_array_length(v_tasks);
      v_offset := v_offset + v_batch_size;
    END LOOP;
  END IF;
  
  -- Re-enable triggers
  PERFORM enable_indexing_triggers();
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Create indexes to support trigger operations
CREATE INDEX IF NOT EXISTS idx_blocks_page_id ON blocks(page_id);
CREATE INDEX IF NOT EXISTS idx_db_block_rows_db_block_id ON db_block_rows(db_block_id);
CREATE INDEX IF NOT EXISTS idx_pages_workspace_id ON pages(workspace_id);

-- Add comment explaining the trigger system
COMMENT ON FUNCTION queue_content_for_indexing IS 
'Automatically queues content changes for indexing. Called by triggers on content tables.
Handles different entity types and priorities, and notifies via pg_notify for real-time processing.';