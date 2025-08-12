-- Improve the hybrid_search function to handle "summarize" queries better
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
  similarity DOUBLE PRECISION,
  rank DOUBLE PRECISION,
  passage_id TEXT,
  source_block_id UUID,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_semantic_results BOOLEAN := FALSE;
  has_keyword_results BOOLEAN := FALSE;
BEGIN
  -- Special handling for summarization requests
  -- If query contains "summarize" or similar, return all documents
  IF query_text ILIKE '%summarize%' OR 
     query_text ILIKE '%summary%' OR 
     query_text ILIKE '%overview%' OR
     query_text ILIKE '%describe%' THEN
    RETURN QUERY
    SELECT 
      d.id,
      d.content,
      1.0::DOUBLE PRECISION as similarity,
      1.0::DOUBLE PRECISION as rank,
      d.passage_id,
      d.source_block_id,
      d.metadata
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
    ORDER BY d.created_at DESC
    LIMIT match_count;
    RETURN;
  END IF;

  -- Try semantic search if we have embeddings
  IF query_embedding IS NOT NULL THEN
    CREATE TEMP TABLE temp_semantic_results AS
    SELECT 
      d.id,
      d.content,
      (1 - (d.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
      AND d.embedding IS NOT NULL
      AND 1 - (d.embedding <=> query_embedding) > similarity_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count * 2;
    
    SELECT COUNT(*) > 0 INTO has_semantic_results FROM temp_semantic_results;
  END IF;

  -- Try keyword search
  CREATE TEMP TABLE temp_keyword_results AS
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
  LIMIT match_count * 2;
  
  SELECT COUNT(*) > 0 INTO has_keyword_results FROM temp_keyword_results;

  -- If we have results from either search, combine them
  IF has_semantic_results OR has_keyword_results THEN
    RETURN QUERY
    WITH combined_results AS (
      SELECT DISTINCT ON (id)
        COALESCE(ss.id, ks.id) AS id,
        COALESCE(ss.content, ks.content) AS content,
        COALESCE(ss.similarity, 0.0::DOUBLE PRECISION) AS similarity,
        COALESCE(ks.rank, 0.0::DOUBLE PRECISION) AS rank,
        (COALESCE(ss.similarity, 0.0::DOUBLE PRECISION) * 0.5 + 
         CASE WHEN ks.rank IS NOT NULL THEN 0.5::DOUBLE PRECISION ELSE 0.0::DOUBLE PRECISION END) AS combined_score
      FROM temp_semantic_results ss
      FULL OUTER JOIN temp_keyword_results ks ON ss.id = ks.id
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
  ELSE
    -- No specific matches found, return most recent documents as fallback
    RETURN QUERY
    SELECT 
      d.id,
      d.content,
      0.5::DOUBLE PRECISION as similarity,
      0.5::DOUBLE PRECISION as rank,
      d.passage_id,
      d.source_block_id,
      d.metadata
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
    ORDER BY d.created_at DESC
    LIMIT match_count;
  END IF;

  -- Clean up temp tables
  DROP TABLE IF EXISTS temp_semantic_results;
  DROP TABLE IF EXISTS temp_keyword_results;
END;
$$;

GRANT EXECUTE ON FUNCTION hybrid_search TO authenticated, anon, service_role;