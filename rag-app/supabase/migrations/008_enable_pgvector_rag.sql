-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table for RAG system
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  metadata JSONB DEFAULT '{}',
  storage_path TEXT,
  source_block_id UUID, -- Reference to source block/page
  passage_id TEXT UNIQUE, -- Unique identifier for citation
  chunk_index INTEGER, -- Position of chunk in original document
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS documents_source_block_idx ON documents(source_block_id);
CREATE INDEX IF NOT EXISTS documents_passage_idx ON documents(passage_id);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC);

-- Create HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create GIN index for JSONB metadata searching
CREATE INDEX IF NOT EXISTS documents_metadata_gin ON documents USING gin (metadata);

-- Create full-text search index
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_tsv tsvector 
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS documents_content_fts ON documents USING gin (content_tsv);

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies based on workspace membership
CREATE POLICY "Users can view documents in their workspace"
  ON documents FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert documents in their workspace"
  ON documents FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update documents in their workspace"
  ON documents FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete documents in their workspace"
  ON documents FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

-- Create document_chunks table for chunking strategy
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_char INTEGER NOT NULL,
  end_char INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_chunks_document_idx ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS document_chunks_index_idx ON document_chunks(chunk_index);

-- Create embeddings_queue table for async processing
CREATE TABLE IF NOT EXISTS embeddings_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS embeddings_queue_status_idx ON embeddings_queue(status);
CREATE INDEX IF NOT EXISTS embeddings_queue_created_idx ON embeddings_queue(created_at);

-- Create workspace_summaries table
CREATE TABLE IF NOT EXISTS workspace_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  summary_type TEXT DEFAULT 'comprehensive',
  summary TEXT NOT NULL,
  key_pages JSONB DEFAULT '[]',
  important_items JSONB DEFAULT '[]',
  citations JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS workspace_summaries_workspace_idx ON workspace_summaries(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_summaries_expires_idx ON workspace_summaries(expires_at);

-- Function to calculate text importance score
CREATE OR REPLACE FUNCTION calculate_importance_score(text_content TEXT)
RETURNS FLOAT
LANGUAGE plpgsql
AS $$
DECLARE
  score FLOAT := 0.5; -- Base score
BEGIN
  -- Headers get higher scores
  IF text_content ~ '^#' THEN
    score := score + 0.3;
  END IF;
  
  -- Lists and structured content
  IF text_content ~ '^\s*[-*•]' OR text_content ~ '^\s*\d+\.' THEN
    score := score + 0.1;
  END IF;
  
  -- Keywords that indicate importance
  IF text_content ~* 'important|critical|key|essential|must|required' THEN
    score := score + 0.2;
  END IF;
  
  -- Longer content tends to be more important
  IF LENGTH(text_content) > 500 THEN
    score := score + 0.1;
  END IF;
  
  RETURN LEAST(score, 1.0); -- Cap at 1.0
END;
$$;

-- Hybrid search function combining vector and full-text search
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
  similarity FLOAT,
  rank FLOAT,
  passage_id TEXT,
  source_block_id UUID,
  metadata JSONB,
  combined_score FLOAT
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
      1 - (d.embedding <=> query_embedding) AS similarity
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
      AND d.embedding IS NOT NULL
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count
  ),
  fts_search AS (
    SELECT 
      d.id,
      ts_rank(d.content_tsv, plainto_tsquery('english', query_text)) AS rank
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
      AND d.content_tsv @@ plainto_tsquery('english', query_text)
    LIMIT match_count
  )
  SELECT 
    COALESCE(v.id, d.id) AS id,
    COALESCE(v.content, d.content) AS content,
    COALESCE(v.similarity, 0) AS similarity,
    COALESCE(f.rank, 0) AS rank,
    COALESCE(v.passage_id, d.passage_id) AS passage_id,
    COALESCE(v.source_block_id, d.source_block_id) AS source_block_id,
    COALESCE(v.metadata, d.metadata) AS metadata,
    -- Combined score: 70% vector similarity, 30% text rank
    (COALESCE(v.similarity, 0) * 0.7 + COALESCE(f.rank, 0) * 0.3) AS combined_score
  FROM vector_search v
  FULL OUTER JOIN fts_search f ON v.id = f.id
  LEFT JOIN documents d ON (f.id = d.id AND v.id IS NULL)
  WHERE COALESCE(v.similarity, 0) >= similarity_threshold 
     OR COALESCE(f.rank, 0) > 0
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- Workspace summarization function
CREATE OR REPLACE FUNCTION summarize_workspace(
  workspace_uuid UUID,
  summary_type TEXT DEFAULT 'comprehensive'
)
RETURNS TABLE (
  summary TEXT,
  key_pages JSONB,
  important_items JSONB,
  citations JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  cached_summary RECORD;
BEGIN
  -- Check for cached summary
  SELECT * INTO cached_summary
  FROM workspace_summaries
  WHERE workspace_id = workspace_uuid
    AND summary_type = summarize_workspace.summary_type
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF FOUND THEN
    RETURN QUERY
    SELECT 
      cached_summary.summary,
      cached_summary.key_pages,
      cached_summary.important_items,
      cached_summary.citations;
    RETURN;
  END IF;
  
  -- Generate new summary
  RETURN QUERY
  WITH relevant_docs AS (
    SELECT 
      d.content,
      d.metadata,
      d.passage_id,
      d.source_block_id,
      calculate_importance_score(d.content) AS importance
    FROM documents d
    WHERE d.workspace_id = workspace_uuid
    ORDER BY 
      importance DESC,
      d.created_at DESC
    LIMIT 50
  ),
  aggregated_data AS (
    SELECT 
      string_agg(content, E'\n\n' ORDER BY importance DESC) AS all_content,
      jsonb_agg(DISTINCT metadata->>'page_name' ORDER BY metadata->>'page_name') AS pages,
      jsonb_agg(
        json_build_object(
          'passage_id', passage_id,
          'block_id', source_block_id,
          'importance', importance
        ) ORDER BY importance DESC
      ) AS all_citations
    FROM relevant_docs
  )
  SELECT 
    LEFT(all_content, 5000) AS summary, -- Truncate for now, will be processed by AI
    pages AS key_pages,
    '[]'::jsonb AS important_items, -- Will be extracted by AI
    all_citations AS citations
  FROM aggregated_data;
END;
$$;

-- Function to clean expired summaries
CREATE OR REPLACE FUNCTION clean_expired_summaries()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM workspace_summaries
  WHERE expires_at < NOW();
END;
$$;

-- Create a trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_documents_updated_at 
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();