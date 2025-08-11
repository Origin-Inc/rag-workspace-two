-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table if it doesn't exist
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  passage_id TEXT UNIQUE,
  source_block_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS documents_source_block_idx ON documents(source_block_id);
CREATE INDEX IF NOT EXISTS documents_passage_id_idx ON documents(passage_id);
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents USING hnsw (embedding vector_cosine_ops);

-- Create the hybrid_search function
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

-- Create workspace summaries table
CREATE TABLE IF NOT EXISTS workspace_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  summary_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_pages TEXT[],
  important_items TEXT[],
  citations JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(workspace_id, summary_type)
);

-- Create summarize_workspace function
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

-- Add RLS policies
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_summaries ENABLE ROW LEVEL SECURITY;

-- Create policies for documents
CREATE POLICY "Users can view documents in their workspaces"
  ON documents FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert documents in their workspaces"
  ON documents FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update documents in their workspaces"
  ON documents FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete documents in their workspaces"
  ON documents FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

-- Create policies for workspace summaries
CREATE POLICY "Users can view summaries in their workspaces"
  ON workspace_summaries FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage summaries in their workspaces"
  ON workspace_summaries FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

-- Insert some test content for testing
INSERT INTO documents (workspace_id, content, passage_id, metadata)
VALUES 
  ('550e8400-e29b-41d4-a716-446655440000', 'This is a test document about databases and RAG systems', 'test-1', '{"type": "test"}'),
  ('550e8400-e29b-41d4-a716-446655440000', 'This page contains information about tasks and project management', 'test-2', '{"type": "test"}'),
  ('550e8400-e29b-41d4-a716-446655440000', 'Summary of important workspace features including AI and collaboration', 'test-3', '{"type": "test"}')
ON CONFLICT (passage_id) DO NOTHING;