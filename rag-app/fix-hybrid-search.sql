-- Check if the function exists and create it if it doesn't
CREATE OR REPLACE FUNCTION hybrid_search(
  workspace_uuid UUID,
  query_text TEXT,
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT,
  rank FLOAT,
  passage_id TEXT,
  source_block_id UUID,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic_search AS (
    SELECT 
      d.id,
      d.content,
      1 - (d.embedding <=> query_embedding) AS similarity
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
      AND 1 - (d.embedding <=> query_embedding) > similarity_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword_search AS (
    SELECT 
      d.id,
      d.content,
      ts_rank_cd(to_tsvector('english', d.content), plainto_tsquery('english', query_text)) AS rank
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
      AND to_tsvector('english', d.content) @@ plainto_tsquery('english', query_text)
    ORDER BY rank DESC
    LIMIT match_count * 2
  ),
  combined_results AS (
    SELECT DISTINCT ON (id)
      COALESCE(ss.id, ks.id) AS id,
      COALESCE(ss.content, ks.content) AS content,
      COALESCE(ss.similarity, 0.0) AS similarity,
      COALESCE(ks.rank, 0.0) AS rank,
      (COALESCE(ss.similarity, 0.0) * 0.5 + 
       CASE WHEN ks.rank IS NOT NULL THEN 0.5 ELSE 0.0 END) AS combined_score
    FROM semantic_search ss
    FULL OUTER JOIN keyword_search ks ON ss.id = ks.id
  )
  SELECT 
    d.id,
    d.content,
    cr.similarity,
    cr.rank,
    d.passage_id,
    d.source_block_id,
    d.metadata
  FROM combined_results cr
  JOIN documents d ON d.id = cr.id
  ORDER BY cr.combined_score DESC
  LIMIT match_count;
END;
$$;