-- Fix RAG Infrastructure - Add vector columns and create unified view
-- This migration assumes pgvector is already enabled

-- First, add the embedding columns to existing tables if they don't exist
DO $$ 
BEGIN
  -- Add embedding column to page_embeddings if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'page_embeddings' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE page_embeddings ADD COLUMN embedding vector(1536);
  END IF;

  -- Add embedding column to block_embeddings if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'block_embeddings' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE block_embeddings ADD COLUMN embedding vector(1536);
  END IF;

  -- Add embedding column to database_row_embeddings if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'database_row_embeddings' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE database_row_embeddings ADD COLUMN embedding vector(1536);
  END IF;
END $$;

-- Create unified view for all embeddings
CREATE OR REPLACE VIEW unified_embeddings AS
  SELECT 
    'page' AS source_type,
    id AS entity_id,
    page_id,
    workspace_id,
    chunk_text,
    chunk_index,
    embedding,
    metadata,
    created_at,
    updated_at
  FROM page_embeddings
  
  UNION ALL
  
  SELECT 
    'block' AS source_type,
    id AS entity_id,
    page_id,
    workspace_id,
    chunk_text,
    chunk_index,
    embedding,
    metadata,
    created_at,
    updated_at
  FROM block_embeddings
  
  UNION ALL
  
  SELECT 
    'database_row' AS source_type,
    id AS entity_id,
    page_id,
    workspace_id,
    chunk_text,
    0 AS chunk_index, -- Database rows don't have chunk indexes
    embedding,
    metadata,
    created_at,
    updated_at
  FROM database_row_embeddings;

-- Create the search_embeddings function
CREATE OR REPLACE FUNCTION search_embeddings(
  query_embedding vector,
  workspace_uuid uuid,
  page_uuid uuid DEFAULT NULL,
  result_limit integer DEFAULT 10,
  similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE(
  source_type text,
  entity_id uuid,
  page_id uuid,
  chunk_text text,
  similarity float,
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
    CASE 
      WHEN ue.embedding IS NULL THEN 0.0
      ELSE 1 - (ue.embedding <=> query_embedding)
    END AS similarity,
    ue.metadata
  FROM unified_embeddings ue
  WHERE ue.workspace_id = workspace_uuid
    AND (page_uuid IS NULL OR ue.page_id = page_uuid)
    AND (
      -- If no embedding, skip similarity check
      ue.embedding IS NULL 
      OR (1 - (ue.embedding <=> query_embedding)) >= similarity_threshold
    )
  ORDER BY 
    CASE 
      WHEN ue.embedding IS NULL THEN 1  -- Put non-embedded results last
      ELSE 0 
    END,
    CASE 
      WHEN ue.embedding IS NOT NULL THEN ue.embedding <=> query_embedding
      ELSE NULL
    END
  LIMIT result_limit;
END;
$$;

-- Create indexes for vector similarity search
CREATE INDEX IF NOT EXISTS idx_page_embeddings_vector 
  ON page_embeddings USING ivfflat (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_block_embeddings_vector 
  ON block_embeddings USING ivfflat (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_database_row_embeddings_vector 
  ON database_row_embeddings USING ivfflat (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Also add GIN indexes for JSONB metadata searches
CREATE INDEX IF NOT EXISTS idx_page_embeddings_metadata 
  ON page_embeddings USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_block_embeddings_metadata 
  ON block_embeddings USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_database_row_embeddings_metadata 
  ON database_row_embeddings USING gin (metadata);