-- Fix RAG Search System Completely
-- This fixes the unified_embeddings view and search_embeddings function

-- Drop existing view and function
DROP VIEW IF EXISTS unified_embeddings CASCADE;
DROP FUNCTION IF EXISTS search_embeddings CASCADE;

-- Create corrected unified_embeddings view with all required columns
CREATE OR REPLACE VIEW unified_embeddings AS
SELECT 
  pe.id::text AS id,
  pe.page_id::text AS entity_id,
  'page'::text AS source_type,  -- This is what the function expects
  'page'::text AS entity_type,
  pe.workspace_id,  -- Keep as UUID
  pe.page_id,       -- Add page_id column
  pe.chunk_text,
  pe.chunk_index,
  pe.embedding,
  pe.metadata,
  pe.created_at,
  pe.updated_at
FROM page_embeddings pe
WHERE pe.embedding IS NOT NULL

UNION ALL

SELECT 
  be.id::text AS id,
  be.block_id::text AS entity_id,
  'block'::text AS source_type,  -- This is what the function expects
  'block'::text AS entity_type,
  be.workspace_id,  -- Keep as UUID
  be.page_id,       -- Add page_id column from block_embeddings
  be.chunk_text,
  be.chunk_index,
  be.embedding,
  be.metadata,
  be.created_at,
  be.updated_at
FROM block_embeddings be
WHERE be.embedding IS NOT NULL

UNION ALL

SELECT 
  dre.id::text AS id,
  dre.row_id::text AS entity_id,
  'database_row'::text AS source_type,  -- This is what the function expects
  'database_row'::text AS entity_type,
  dre.workspace_id,  -- Keep as UUID
  NULL::uuid AS page_id,  -- database rows don't have page_id
  dre.chunk_text,
  0 AS chunk_index,
  dre.embedding,
  dre.metadata,
  dre.created_at,
  dre.updated_at
FROM database_row_embeddings dre
WHERE dre.embedding IS NOT NULL;

-- Create corrected search_embeddings function
CREATE OR REPLACE FUNCTION search_embeddings(
  p_query_embedding vector,
  p_workspace_id uuid,
  p_page_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_threshold double precision DEFAULT 0.05
)
RETURNS TABLE(
  source_type text,
  entity_id text,
  page_id uuid,
  chunk_text text,
  similarity double precision,
  metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Add extensive logging
  RAISE NOTICE 'search_embeddings called with workspace_id: %, page_id: %, limit: %, threshold: %', 
    p_workspace_id, p_page_id, p_limit, p_threshold;
  
  RETURN QUERY
  SELECT 
    ue.source_type,
    ue.entity_id,
    ue.page_id,
    ue.chunk_text,
    1 - (ue.embedding <=> p_query_embedding) as similarity,
    ue.metadata
  FROM unified_embeddings ue
  WHERE 
    ue.workspace_id = p_workspace_id
    AND (p_page_id IS NULL OR ue.page_id = p_page_id)
    AND ue.embedding IS NOT NULL
    AND 1 - (ue.embedding <=> p_query_embedding) > p_threshold
  ORDER BY ue.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- Grant permissions
GRANT SELECT ON unified_embeddings TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_embeddings TO postgres, anon, authenticated, service_role;

-- Add debugging: Check if we have any embeddings
DO $$
DECLARE
  page_count integer;
  block_count integer;
  db_row_count integer;
BEGIN
  SELECT COUNT(*) INTO page_count FROM page_embeddings WHERE embedding IS NOT NULL;
  SELECT COUNT(*) INTO block_count FROM block_embeddings WHERE embedding IS NOT NULL;
  SELECT COUNT(*) INTO db_row_count FROM database_row_embeddings WHERE embedding IS NOT NULL;
  
  RAISE NOTICE 'Embeddings count - Pages: %, Blocks: %, DB Rows: %', 
    page_count, block_count, db_row_count;
END $$;