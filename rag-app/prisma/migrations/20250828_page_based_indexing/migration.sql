-- Ensure pgvector extension is installed
CREATE EXTENSION IF NOT EXISTS vector;

-- Create page_embeddings table for page-specific content
CREATE TABLE IF NOT EXISTS page_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT fk_page_embeddings_page 
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  CONSTRAINT fk_page_embeddings_workspace 
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Create block_embeddings table for individual block content
CREATE TABLE IF NOT EXISTS block_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id VARCHAR(255) NOT NULL, -- Block IDs are strings in the system
  page_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  block_type VARCHAR(50) NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT fk_block_embeddings_page 
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  CONSTRAINT fk_block_embeddings_workspace 
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Create database_row_embeddings for database content (without FK to database_blocks for now)
CREATE TABLE IF NOT EXISTS database_row_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL,
  row_id UUID NOT NULL,
  page_id UUID,
  workspace_id UUID NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign key only to workspace for now
  CONSTRAINT fk_db_row_embeddings_workspace 
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_page_embeddings_page ON page_embeddings(page_id);
CREATE INDEX idx_page_embeddings_workspace ON page_embeddings(workspace_id);
CREATE INDEX idx_page_embeddings_embedding ON page_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_page_embeddings_metadata ON page_embeddings USING GIN (metadata);

CREATE INDEX idx_block_embeddings_block ON block_embeddings(block_id);
CREATE INDEX idx_block_embeddings_page ON block_embeddings(page_id);
CREATE INDEX idx_block_embeddings_workspace ON block_embeddings(workspace_id);
CREATE INDEX idx_block_embeddings_type ON block_embeddings(block_type);
CREATE INDEX idx_block_embeddings_embedding ON block_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_block_embeddings_metadata ON block_embeddings USING GIN (metadata);

CREATE INDEX idx_db_row_embeddings_database ON database_row_embeddings(database_id);
CREATE INDEX idx_db_row_embeddings_row ON database_row_embeddings(row_id);
CREATE INDEX idx_db_row_embeddings_workspace ON database_row_embeddings(workspace_id);
CREATE INDEX idx_db_row_embeddings_embedding ON database_row_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create a unified search view (all entity_ids cast to TEXT for consistency)
CREATE OR REPLACE VIEW unified_embeddings AS
SELECT 
  'page' as source_type,
  id,
  page_id::TEXT as entity_id,
  page_id,
  workspace_id,
  chunk_text,
  chunk_index,
  embedding,
  metadata,
  created_at
FROM page_embeddings

UNION ALL

SELECT 
  'block' as source_type,
  id,
  block_id::TEXT as entity_id,
  page_id,
  workspace_id,
  chunk_text,
  chunk_index,
  embedding,
  metadata,
  created_at
FROM block_embeddings

UNION ALL

SELECT 
  'database_row' as source_type,
  id,
  row_id::TEXT as entity_id,
  page_id,
  workspace_id,
  chunk_text,
  0 as chunk_index,
  embedding,
  metadata,
  created_at
FROM database_row_embeddings

UNION ALL

-- Keep backward compatibility with existing embeddings
SELECT 
  'document' as source_type,
  id,
  entity_id::TEXT as entity_id,
  (metadata->>'pageId')::UUID as page_id,
  (metadata->>'workspaceId')::UUID as workspace_id,
  chunk_text,
  chunk_index,
  embedding,
  metadata,
  created_at
FROM embeddings
WHERE entity_type = 'page' OR metadata->>'pageId' IS NOT NULL;

-- Function to clean up old embeddings for a page
CREATE OR REPLACE FUNCTION cleanup_page_embeddings(p_page_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete from all embedding tables
  DELETE FROM page_embeddings WHERE page_id = p_page_id;
  DELETE FROM block_embeddings WHERE page_id = p_page_id;
  DELETE FROM database_row_embeddings WHERE page_id = p_page_id;
  
  -- Also clean up old format
  DELETE FROM embeddings 
  WHERE entity_id = p_page_id 
     OR (metadata->>'pageId')::text = p_page_id::text;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to search embeddings with hybrid approach
CREATE OR REPLACE FUNCTION search_embeddings(
  p_query_embedding vector(1536),
  p_workspace_id UUID,
  p_page_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.05
)
RETURNS TABLE(
  source_type TEXT,
  entity_id TEXT,
  page_id UUID,
  chunk_text TEXT,
  similarity FLOAT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ue.source_type,
    ue.entity_id::TEXT,
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
$$ LANGUAGE plpgsql;