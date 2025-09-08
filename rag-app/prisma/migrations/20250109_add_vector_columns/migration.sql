-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector columns to embeddings table
ALTER TABLE embeddings 
ADD COLUMN IF NOT EXISTS embedding vector(1536),
ADD COLUMN IF NOT EXISTS embedding_halfvec halfvec(1536);

-- Add vector columns to page_embeddings table
ALTER TABLE page_embeddings 
ADD COLUMN IF NOT EXISTS embedding vector(1536),
ADD COLUMN IF NOT EXISTS embedding_halfvec halfvec(1536);

-- Add vector columns to block_embeddings table
ALTER TABLE block_embeddings 
ADD COLUMN IF NOT EXISTS embedding vector(1536),
ADD COLUMN IF NOT EXISTS embedding_halfvec halfvec(1536);

-- Add vector columns to database_row_embeddings table
ALTER TABLE database_row_embeddings 
ADD COLUMN IF NOT EXISTS embedding vector(1536),
ADD COLUMN IF NOT EXISTS embedding_halfvec halfvec(1536);

-- Create HNSW indexes for fast similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_embedding_hnsw 
ON embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_page_embeddings_embedding_hnsw 
ON page_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_block_embeddings_embedding_hnsw 
ON block_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_database_row_embeddings_embedding_hnsw 
ON database_row_embeddings USING hnsw (embedding vector_cosine_ops);

-- Create indexes for halfvec columns
CREATE INDEX IF NOT EXISTS idx_embeddings_halfvec_hnsw 
ON embeddings USING hnsw (embedding_halfvec halfvec_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_page_embeddings_halfvec_hnsw 
ON page_embeddings USING hnsw (embedding_halfvec halfvec_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_block_embeddings_halfvec_hnsw 
ON block_embeddings USING hnsw (embedding_halfvec halfvec_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_database_row_embeddings_halfvec_hnsw 
ON database_row_embeddings USING hnsw (embedding_halfvec halfvec_cosine_ops);