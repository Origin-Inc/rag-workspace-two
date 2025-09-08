-- Final migration: Swap vector columns to make halfvec primary
-- This should only be run after all data has been migrated to halfvec

-- Step 1: Verify migration is complete
DO $$
DECLARE
  unmigrated_count integer;
BEGIN
  -- Check for any rows that have vector but not halfvec
  SELECT COUNT(*) INTO unmigrated_count
  FROM (
    SELECT 1 FROM page_embeddings WHERE embedding IS NOT NULL AND embedding_halfvec IS NULL
    UNION ALL
    SELECT 1 FROM block_embeddings WHERE embedding IS NOT NULL AND embedding_halfvec IS NULL
    UNION ALL
    SELECT 1 FROM database_row_embeddings WHERE embedding IS NOT NULL AND embedding_halfvec IS NULL
    UNION ALL
    SELECT 1 FROM embeddings WHERE embedding IS NOT NULL AND embedding_halfvec IS NULL
  ) unmigrated;
  
  IF unmigrated_count > 0 THEN
    RAISE EXCEPTION 'Cannot swap columns: % rows still need migration to halfvec', unmigrated_count;
  END IF;
END $$;

-- Step 2: Rename columns atomically within a transaction
BEGIN;

-- Page embeddings
ALTER TABLE page_embeddings 
  RENAME COLUMN embedding TO embedding_vector_backup;
ALTER TABLE page_embeddings 
  RENAME COLUMN embedding_halfvec TO embedding;

-- Block embeddings  
ALTER TABLE block_embeddings 
  RENAME COLUMN embedding TO embedding_vector_backup;
ALTER TABLE block_embeddings 
  RENAME COLUMN embedding_halfvec TO embedding;

-- Database row embeddings
ALTER TABLE database_row_embeddings 
  RENAME COLUMN embedding TO embedding_vector_backup;
ALTER TABLE database_row_embeddings 
  RENAME COLUMN embedding_halfvec TO embedding;

-- Document embeddings
ALTER TABLE embeddings 
  RENAME COLUMN embedding TO embedding_vector_backup;
ALTER TABLE embeddings 
  RENAME COLUMN embedding_halfvec TO embedding;

COMMIT;

-- Step 3: Update the unified_embeddings view to use the new column names
CREATE OR REPLACE VIEW unified_embeddings AS
  SELECT 
    'page'::text AS source_type,
    id::text AS entity_id,
    page_id,
    workspace_id,
    chunk_text,
    chunk_index,
    embedding, -- Now points to halfvec column
    metadata,
    created_at,
    updated_at,
    'page'::text AS entity_type,
    id::text AS id
  FROM page_embeddings
  WHERE embedding IS NOT NULL
  
  UNION ALL
  
  SELECT 
    'block'::text AS source_type,
    id::text AS entity_id,
    page_id,
    workspace_id,
    chunk_text,
    chunk_index,
    embedding,
    metadata,
    created_at,
    updated_at,
    'block'::text AS entity_type,
    id::text AS id
  FROM block_embeddings
  WHERE embedding IS NOT NULL
  
  UNION ALL
  
  SELECT 
    'database_row'::text AS source_type,
    id::text AS entity_id,
    page_id,
    workspace_id,
    chunk_text,
    NULL::integer AS chunk_index,
    embedding,
    metadata,
    created_at,
    updated_at,
    'database_row'::text AS entity_type,
    id::text AS id
  FROM database_row_embeddings
  WHERE embedding IS NOT NULL;

-- Step 4: Update search function to work with halfvec as default
CREATE OR REPLACE FUNCTION search_embeddings(
  query_embedding halfvec, -- Changed from vector to halfvec
  workspace_uuid uuid,
  page_uuid uuid DEFAULT NULL,
  result_limit integer DEFAULT 10,
  similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE(
  source_type text,
  entity_id uuid,
  page_id uuid,
  chunk_text text,
  similarity float,
  metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ue.source_type,
    ue.entity_id::uuid,
    ue.page_id,
    ue.chunk_text,
    CASE 
      WHEN ue.embedding IS NULL THEN 0.0
      ELSE 1 - (ue.embedding <=> query_embedding)
    END AS similarity,
    ue.metadata
  FROM unified_embeddings ue
  WHERE ue.workspace_id = workspace_uuid
    AND (page_uuid IS NULL OR ue.page_id = page_uuid)
    AND (
      ue.embedding IS NULL 
      OR (1 - (ue.embedding <=> query_embedding)) >= similarity_threshold
    )
  ORDER BY 
    CASE 
      WHEN ue.embedding IS NULL THEN 1
      ELSE 0 
    END,
    CASE 
      WHEN ue.embedding IS NOT NULL THEN ue.embedding <=> query_embedding
      ELSE NULL
    END
  LIMIT result_limit;
END;
$$;

-- Step 5: Update column comments to reflect new status
COMMENT ON COLUMN page_embeddings.embedding IS 'Halfvec storage (57% size reduction) - primary embedding column';
COMMENT ON COLUMN page_embeddings.embedding_vector_backup IS 'Original vector backup - retained for 30-day rollback window';

COMMENT ON COLUMN block_embeddings.embedding IS 'Halfvec storage (57% size reduction) - primary embedding column';
COMMENT ON COLUMN block_embeddings.embedding_vector_backup IS 'Original vector backup - retained for 30-day rollback window';

COMMENT ON COLUMN database_row_embeddings.embedding IS 'Halfvec storage (57% size reduction) - primary embedding column';
COMMENT ON COLUMN database_row_embeddings.embedding_vector_backup IS 'Original vector backup - retained for 30-day rollback window';

COMMENT ON COLUMN embeddings.embedding IS 'Halfvec storage (57% size reduction) - primary embedding column';
COMMENT ON COLUMN embeddings.embedding_vector_backup IS 'Original vector backup - retained for 30-day rollback window';

-- Step 6: Create rollback function for emergency use
CREATE OR REPLACE FUNCTION rollback_to_vector()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Swap columns back
  ALTER TABLE page_embeddings 
    RENAME COLUMN embedding TO embedding_halfvec;
  ALTER TABLE page_embeddings 
    RENAME COLUMN embedding_vector_backup TO embedding;
  
  ALTER TABLE block_embeddings 
    RENAME COLUMN embedding TO embedding_halfvec;
  ALTER TABLE block_embeddings 
    RENAME COLUMN embedding_vector_backup TO embedding;
  
  ALTER TABLE database_row_embeddings 
    RENAME COLUMN embedding TO embedding_halfvec;
  ALTER TABLE database_row_embeddings 
    RENAME COLUMN embedding_vector_backup TO embedding;
  
  ALTER TABLE embeddings 
    RENAME COLUMN embedding TO embedding_halfvec;
  ALTER TABLE embeddings 
    RENAME COLUMN embedding_vector_backup TO embedding;
  
  RAISE NOTICE 'Rolled back to vector columns successfully';
END;
$$;

-- Step 7: Log migration completion
INSERT INTO migration_log (migration_name, status, details, created_at)
VALUES (
  'halfvec_column_swap',
  'completed',
  jsonb_build_object(
    'swapped_at', NOW(),
    'backup_columns_retained', true,
    'rollback_function_created', true
  ),
  NOW()
) ON CONFLICT DO NOTHING;