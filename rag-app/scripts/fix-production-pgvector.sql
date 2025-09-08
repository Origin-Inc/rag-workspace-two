-- Script to fix pgvector extension in production database
-- Run this script on the Supabase production database

-- Check if pgvector extension exists
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Enable pgvector extension
-- Note: Supabase may require this to be run as superuser or through Supabase dashboard
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify the extension is enabled
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Check if vector type exists
SELECT typname FROM pg_type WHERE typname = 'vector';

-- If the above shows the vector type exists, run these to add the columns:

-- Add vector columns to embeddings table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'embeddings' 
                   AND column_name = 'embedding') THEN
        ALTER TABLE embeddings ADD COLUMN embedding vector(1536);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'embeddings' 
                   AND column_name = 'embedding_halfvec') THEN
        ALTER TABLE embeddings ADD COLUMN embedding_halfvec halfvec(1536);
    END IF;
END $$;

-- Add vector columns to page_embeddings table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'page_embeddings' 
                   AND column_name = 'embedding') THEN
        ALTER TABLE page_embeddings ADD COLUMN embedding vector(1536);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'page_embeddings' 
                   AND column_name = 'embedding_halfvec') THEN
        ALTER TABLE page_embeddings ADD COLUMN embedding_halfvec halfvec(1536);
    END IF;
END $$;

-- Add vector columns to block_embeddings table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'block_embeddings' 
                   AND column_name = 'embedding') THEN
        ALTER TABLE block_embeddings ADD COLUMN embedding vector(1536);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'block_embeddings' 
                   AND column_name = 'embedding_halfvec') THEN
        ALTER TABLE block_embeddings ADD COLUMN embedding_halfvec halfvec(1536);
    END IF;
END $$;

-- Add vector columns to database_row_embeddings table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'database_row_embeddings' 
                   AND column_name = 'embedding') THEN
        ALTER TABLE database_row_embeddings ADD COLUMN embedding vector(1536);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'database_row_embeddings' 
                   AND column_name = 'embedding_halfvec') THEN
        ALTER TABLE database_row_embeddings ADD COLUMN embedding_halfvec halfvec(1536);
    END IF;
END $$;

-- Create indexes only if they don't exist
CREATE INDEX IF NOT EXISTS idx_embeddings_embedding_hnsw 
ON embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_page_embeddings_embedding_hnsw 
ON page_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_block_embeddings_embedding_hnsw 
ON block_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_database_row_embeddings_embedding_hnsw 
ON database_row_embeddings USING hnsw (embedding vector_cosine_ops);

-- Verify the setup
SELECT 
    table_name,
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_name IN ('embeddings', 'page_embeddings', 'block_embeddings', 'database_row_embeddings')
    AND column_name IN ('embedding', 'embedding_halfvec')
ORDER BY table_name, column_name;