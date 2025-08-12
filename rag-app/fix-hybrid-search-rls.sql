-- Fix the hybrid_search function to work with RLS
-- Add SECURITY DEFINER to run with the privileges of the function owner (postgres)

DROP FUNCTION IF EXISTS hybrid_search;

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
SECURITY DEFINER -- This makes the function run with elevated privileges
SET search_path = public
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
      AND d.embedding IS NOT NULL
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

-- Grant execute permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION hybrid_search TO authenticated, anon;

-- Also update the summarize_workspace function with SECURITY DEFINER
DROP FUNCTION IF EXISTS summarize_workspace;

CREATE OR REPLACE FUNCTION summarize_workspace(
  workspace_uuid UUID,
  summary_type TEXT DEFAULT 'comprehensive'
)
RETURNS TABLE (
  summary TEXT,
  key_pages TEXT[],
  important_items TEXT[],
  citations JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER -- This makes the function run with elevated privileges
SET search_path = public
AS $$
DECLARE
  v_summary TEXT;
  v_key_pages TEXT[];
  v_important_items TEXT[];
  v_citations JSONB;
BEGIN
  -- Check for existing summary
  SELECT 
    ws.summary,
    ws.key_pages,
    ws.important_items,
    ws.citations
  INTO 
    v_summary,
    v_key_pages,
    v_important_items,
    v_citations
  FROM workspace_summaries ws
  WHERE ws.workspace_id = workspace_uuid
    AND ws.summary_type = summary_type
    AND ws.updated_at > NOW() - INTERVAL '1 hour';
    
  IF v_summary IS NOT NULL THEN
    RETURN QUERY SELECT v_summary, v_key_pages, v_important_items, v_citations;
    RETURN;
  END IF;
  
  -- Generate new summary from documents
  SELECT 
    string_agg(DISTINCT d.content, E'\n\n' ORDER BY d.content) AS summary,
    array_agg(DISTINCT (d.metadata->>'page_name')) FILTER (WHERE d.metadata->>'page_name' IS NOT NULL) AS key_pages,
    array[]::TEXT[] AS important_items,
    jsonb_agg(DISTINCT jsonb_build_object(
      'passage_id', d.passage_id,
      'block_id', d.source_block_id
    )) AS citations
  INTO
    v_summary,
    v_key_pages,
    v_important_items,
    v_citations
  FROM (
    SELECT * FROM documents
    WHERE workspace_id = workspace_uuid
    LIMIT 50
  ) d;
  
  -- Store the summary
  INSERT INTO workspace_summaries (
    workspace_id,
    summary_type,
    summary,
    key_pages,
    important_items,
    citations
  ) VALUES (
    workspace_uuid,
    summary_type,
    COALESCE(v_summary, 'No content found in workspace'),
    COALESCE(v_key_pages, ARRAY[]::TEXT[]),
    COALESCE(v_important_items, ARRAY[]::TEXT[]),
    COALESCE(v_citations, '[]'::JSONB)
  )
  ON CONFLICT (workspace_id, summary_type)
  DO UPDATE SET
    summary = EXCLUDED.summary,
    key_pages = EXCLUDED.key_pages,
    important_items = EXCLUDED.important_items,
    citations = EXCLUDED.citations,
    updated_at = NOW();
  
  RETURN QUERY SELECT 
    COALESCE(v_summary, 'No content found in workspace'),
    COALESCE(v_key_pages, ARRAY[]::TEXT[]),
    COALESCE(v_important_items, ARRAY[]::TEXT[]),
    COALESCE(v_citations, '[]'::JSONB);
END;
$$;

-- Grant execute permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION summarize_workspace TO authenticated, anon;