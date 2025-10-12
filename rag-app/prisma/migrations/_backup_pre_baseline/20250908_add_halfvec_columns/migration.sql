-- Migration: Add halfvec columns for 57% storage reduction
-- This migration adds halfvec columns alongside existing vector columns
-- to enable gradual migration without downtime

-- Ensure pgvector extension is enabled with halfvec support
CREATE EXTENSION IF NOT EXISTS vector;

-- Add halfvec columns to page_embeddings
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'page_embeddings' AND column_name = 'embedding_halfvec'
  ) THEN
    ALTER TABLE page_embeddings ADD COLUMN embedding_halfvec halfvec(1536);
  END IF;
END $$;

-- Add halfvec columns to block_embeddings
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'block_embeddings' AND column_name = 'embedding_halfvec'
  ) THEN
    ALTER TABLE block_embeddings ADD COLUMN embedding_halfvec halfvec(1536);
  END IF;
END $$;

-- Add halfvec columns to database_row_embeddings
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'database_row_embeddings' AND column_name = 'embedding_halfvec'
  ) THEN
    ALTER TABLE database_row_embeddings ADD COLUMN embedding_halfvec halfvec(1536);
  END IF;
END $$;

-- Add halfvec columns to embeddings (for documents)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'embeddings' AND column_name = 'embedding_halfvec'
  ) THEN
    -- First ensure the vector column exists (it may be commented out in schema)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'embeddings' AND column_name = 'embedding'
    ) THEN
      ALTER TABLE embeddings ADD COLUMN embedding vector(1536);
    END IF;
    
    -- Now add the halfvec column
    ALTER TABLE embeddings ADD COLUMN embedding_halfvec halfvec(1536);
  END IF;
END $$;

-- Create function to convert existing embeddings to halfvec
-- This will be used by the migration script
CREATE OR REPLACE FUNCTION convert_to_halfvec(
  table_name text,
  batch_size integer DEFAULT 1000
)
RETURNS TABLE(
  converted_count integer,
  error_count integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  total_converted integer := 0;
  total_errors integer := 0;
  batch_converted integer;
BEGIN
  -- Dynamic SQL to handle different table names
  EXECUTE format('
    WITH batch AS (
      SELECT id 
      FROM %I
      WHERE embedding IS NOT NULL 
        AND embedding_halfvec IS NULL
      LIMIT %s
    )
    UPDATE %I t
    SET embedding_halfvec = t.embedding::halfvec(1536)
    FROM batch
    WHERE t.id = batch.id
    RETURNING 1
  ', table_name, batch_size, table_name)
  INTO batch_converted;
  
  total_converted := COALESCE(batch_converted, 0);
  
  RETURN QUERY SELECT total_converted, total_errors;
EXCEPTION
  WHEN OTHERS THEN
    total_errors := 1;
    RETURN QUERY SELECT total_converted, total_errors;
END;
$$;

-- Create indexes for halfvec columns (initially empty, will be populated after data migration)
-- Using HNSW indexes which are more efficient than IVFFlat for halfvec
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_page_embeddings_halfvec_hnsw 
  ON page_embeddings USING hnsw (embedding_halfvec halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding_halfvec IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_block_embeddings_halfvec_hnsw 
  ON block_embeddings USING hnsw (embedding_halfvec halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding_halfvec IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_database_row_embeddings_halfvec_hnsw 
  ON database_row_embeddings USING hnsw (embedding_halfvec halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding_halfvec IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_embeddings_halfvec_hnsw 
  ON embeddings USING hnsw (embedding_halfvec halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding_halfvec IS NOT NULL;

-- Add comment to track migration status
COMMENT ON COLUMN page_embeddings.embedding_halfvec IS 'Halfvec storage for 57% reduction - migration in progress';
COMMENT ON COLUMN block_embeddings.embedding_halfvec IS 'Halfvec storage for 57% reduction - migration in progress';
COMMENT ON COLUMN database_row_embeddings.embedding_halfvec IS 'Halfvec storage for 57% reduction - migration in progress';
COMMENT ON COLUMN embeddings.embedding_halfvec IS 'Halfvec storage for 57% reduction - migration in progress';