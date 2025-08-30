-- Fix the hybrid search function type mismatch
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(1536),
  query_text TEXT,
  workspace_uuid UUID,
  match_count INT DEFAULT 20,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity DOUBLE PRECISION,
  rank DOUBLE PRECISION,
  passage_id TEXT,
  source_block_id UUID,
  metadata JSONB,
  combined_score DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_search AS (
    SELECT 
      d.id,
      d.content,
      d.passage_id,
      d.source_block_id,
      d.metadata,
      (1 - (d.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
      AND d.embedding IS NOT NULL
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count
  ),
  fts_search AS (
    SELECT 
      d.id,
      ts_rank(d.content_tsv, plainto_tsquery('english', query_text))::DOUBLE PRECISION AS rank
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
      AND d.content_tsv @@ plainto_tsquery('english', query_text)
    LIMIT match_count
  )
  SELECT 
    COALESCE(v.id, d.id) AS id,
    COALESCE(v.content, d.content) AS content,
    COALESCE(v.similarity, 0::DOUBLE PRECISION) AS similarity,
    COALESCE(f.rank, 0::DOUBLE PRECISION) AS rank,
    COALESCE(v.passage_id, d.passage_id) AS passage_id,
    COALESCE(v.source_block_id, d.source_block_id) AS source_block_id,
    COALESCE(v.metadata, d.metadata) AS metadata,
    -- Combined score: 70% vector similarity, 30% text rank
    (COALESCE(v.similarity, 0::DOUBLE PRECISION) * 0.7 + COALESCE(f.rank, 0::DOUBLE PRECISION) * 0.3) AS combined_score
  FROM vector_search v
  FULL OUTER JOIN fts_search f ON v.id = f.id
  LEFT JOIN documents d ON (f.id = d.id AND v.id IS NULL)
  WHERE COALESCE(v.similarity, 0::DOUBLE PRECISION) >= similarity_threshold 
     OR COALESCE(f.rank, 0::DOUBLE PRECISION) > 0
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;