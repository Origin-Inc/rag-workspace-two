-- Fix search_embeddings function to return correct columns and properly filter by page_id

-- Drop the old function first
DROP FUNCTION IF EXISTS search_embeddings(vector, uuid, uuid, integer, float);

-- Create the corrected search_embeddings function
CREATE OR REPLACE FUNCTION search_embeddings(
  query_embedding vector,
  workspace_uuid uuid,
  page_uuid uuid DEFAULT NULL,
  result_limit integer DEFAULT 10,
  similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE(
  id text,
  content text,
  metadata jsonb,
  similarity float,
  source_type text,
  source_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ue.id::text AS id,
    ue.chunk_text AS content,
    ue.metadata,
    CASE 
      WHEN ue.embedding IS NULL THEN 0.0
      ELSE 1 - (ue.embedding <=> query_embedding)
    END AS similarity,
    ue.source_type,
    ue.page_id AS source_id  -- Return page_id as source_id for all types
  FROM unified_embeddings ue
  WHERE ue.workspace_id = workspace_uuid
    AND (page_uuid IS NULL OR ue.page_id = page_uuid)  -- Critical: filter by page_id when provided
    AND (
      -- If no embedding, skip similarity check
      ue.embedding IS NULL 
      OR (1 - (ue.embedding <=> query_embedding)) >= similarity_threshold
    )
  ORDER BY 
    CASE 
      WHEN ue.embedding IS NULL THEN 1  -- Put non-embedded results last
      ELSE 0 
    END,
    CASE 
      WHEN ue.embedding IS NOT NULL THEN ue.embedding <=> query_embedding
      ELSE NULL
    END
  LIMIT result_limit;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION search_embeddings IS 'Search for similar embeddings within a workspace, optionally scoped to a specific page. Returns unified results from all embedding tables.';