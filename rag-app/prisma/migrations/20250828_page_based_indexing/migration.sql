-- Create tables for page-based embeddings with hierarchy support
CREATE TABLE IF NOT EXISTS page_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  -- embedding vector(1536), -- Commented out as pgvector not available yet
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT fk_page_embeddings_page 
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  CONSTRAINT fk_page_embeddings_workspace 
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Create table for block-level embeddings
CREATE TABLE IF NOT EXISTS block_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  block_id UUID NOT NULL,
  page_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  -- embedding vector(1536), -- Commented out as pgvector not available yet
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign keys
  CONSTRAINT fk_block_embeddings_page 
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  CONSTRAINT fk_block_embeddings_workspace 
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Create table for database row embeddings
CREATE TABLE IF NOT EXISTS database_row_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  row_id UUID NOT NULL,
  page_id UUID, -- Optional, may not be page-associated
  workspace_id UUID NOT NULL,
  chunk_text TEXT NOT NULL,
  -- embedding vector(1536), -- Commented out as pgvector not available yet
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key only to workspace for now
  CONSTRAINT fk_db_row_embeddings_workspace 
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_page_embeddings_page_id ON page_embeddings(page_id);
CREATE INDEX IF NOT EXISTS idx_page_embeddings_workspace_id ON page_embeddings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_page_embeddings_chunk_index ON page_embeddings(page_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_block_embeddings_page_id ON block_embeddings(page_id);
CREATE INDEX IF NOT EXISTS idx_block_embeddings_block_id ON block_embeddings(block_id);
CREATE INDEX IF NOT EXISTS idx_block_embeddings_workspace_id ON block_embeddings(workspace_id);

CREATE INDEX IF NOT EXISTS idx_db_row_embeddings_row_id ON database_row_embeddings(row_id);
CREATE INDEX IF NOT EXISTS idx_db_row_embeddings_workspace_id ON database_row_embeddings(workspace_id);

-- Note: Unified embeddings view and search functions will be added 
-- when pgvector extension is properly configured

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
  
  -- Also clean up old format if exists
  DELETE FROM embeddings 
  WHERE (metadata->>'pageId')::text = p_page_id::text;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;