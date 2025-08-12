-- Fix type mismatch in hybrid_search function
-- Change FLOAT to DOUBLE PRECISION for PostgreSQL compatibility

DROP FUNCTION IF EXISTS hybrid_search;

CREATE OR REPLACE FUNCTION hybrid_search(
  workspace_uuid UUID,
  query_text TEXT,
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  similarity_threshold DOUBLE PRECISION DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity DOUBLE PRECISION,  -- Changed from FLOAT to DOUBLE PRECISION
  rank DOUBLE PRECISION,         -- Changed from FLOAT to DOUBLE PRECISION
  passage_id TEXT,
  source_block_id UUID,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH semantic_search AS (
    SELECT 
      d.id,
      d.content,
      (1 - (d.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
      AND d.embedding IS NOT NULL
      AND query_embedding IS NOT NULL  -- Add null check
      AND 1 - (d.embedding <=> query_embedding) > similarity_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword_search AS (
    SELECT 
      d.id,
      d.content,
      ts_rank_cd(to_tsvector('english', d.content), plainto_tsquery('english', query_text))::DOUBLE PRECISION AS rank
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
      AND query_text IS NOT NULL
      AND query_text != ''
      AND to_tsvector('english', d.content) @@ plainto_tsquery('english', query_text)
    ORDER BY rank DESC
    LIMIT match_count * 2
  ),
  combined_results AS (
    SELECT DISTINCT ON (id)
      COALESCE(ss.id, ks.id) AS id,
      COALESCE(ss.content, ks.content) AS content,
      COALESCE(ss.similarity, 0.0::DOUBLE PRECISION) AS similarity,
      COALESCE(ks.rank, 0.0::DOUBLE PRECISION) AS rank,
      (COALESCE(ss.similarity, 0.0::DOUBLE PRECISION) * 0.5 + 
       CASE WHEN ks.rank IS NOT NULL THEN 0.5::DOUBLE PRECISION ELSE 0.0::DOUBLE PRECISION END) AS combined_score
    FROM semantic_search ss
    FULL OUTER JOIN keyword_search ks ON ss.id = ks.id
  )
  SELECT 
    d.id,
    d.content,
    cr.similarity::DOUBLE PRECISION,
    cr.rank::DOUBLE PRECISION,
    d.passage_id,
    d.source_block_id,
    d.metadata
  FROM combined_results cr
  JOIN documents d ON d.id = cr.id
  ORDER BY cr.combined_score DESC
  LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION hybrid_search TO authenticated, anon, service_role;

-- Test the function with a simple query
-- This should return documents without needing embeddings
SELECT * FROM hybrid_search(
  '550e8400-e29b-41d4-a716-446655440000'::UUID,
  'database',
  NULL,
  5,
  0.0
);