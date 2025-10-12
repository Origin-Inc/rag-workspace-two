-- Enable pgvector extension for vector similarity search
-- This must be installed before any tables that use the vector type
CREATE EXTENSION IF NOT EXISTS vector;