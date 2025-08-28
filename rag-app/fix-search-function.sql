-- Fix the search_embeddings function to not filter by threshold
-- The threshold should be handled by the application layer

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
    -- Remove the threshold filter - let the app decide what's relevant
    -- AND 1 - (ue.embedding <=> p_query_embedding) > p_threshold
  ORDER BY ue.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;