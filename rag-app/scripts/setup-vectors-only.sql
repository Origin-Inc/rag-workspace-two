-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Add vector columns to embedding tables if they don't exist
DO $$ 
BEGIN
    -- Check and add embedding column to embeddings table
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'embeddings'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'embeddings' 
        AND column_name = 'embedding'
    ) THEN
        ALTER TABLE public.embeddings ADD COLUMN embedding vector(1536);
        RAISE NOTICE 'Added embedding column to embeddings table';
    END IF;

    -- Check and add embedding column to page_embeddings table
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'page_embeddings'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'page_embeddings' 
        AND column_name = 'embedding'
    ) THEN
        ALTER TABLE public.page_embeddings ADD COLUMN embedding vector(1536);
        RAISE NOTICE 'Added embedding column to page_embeddings table';
    END IF;

    -- Check and add embedding column to block_embeddings table
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'block_embeddings'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'block_embeddings' 
        AND column_name = 'embedding'
    ) THEN
        ALTER TABLE public.block_embeddings ADD COLUMN embedding vector(1536);
        RAISE NOTICE 'Added embedding column to block_embeddings table';
    END IF;

    -- Check and add embedding column to database_row_embeddings table
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'database_row_embeddings'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'database_row_embeddings' 
        AND column_name = 'embedding'
    ) THEN
        ALTER TABLE public.database_row_embeddings ADD COLUMN embedding vector(1536);
        RAISE NOTICE 'Added embedding column to database_row_embeddings table';
    END IF;
END $$;

-- Create vector similarity search indexes (only if tables exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'embeddings') THEN
        CREATE INDEX IF NOT EXISTS embeddings_embedding_idx ON public.embeddings 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'page_embeddings') THEN
        CREATE INDEX IF NOT EXISTS page_embeddings_embedding_idx ON public.page_embeddings 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'block_embeddings') THEN
        CREATE INDEX IF NOT EXISTS block_embeddings_embedding_idx ON public.block_embeddings 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'database_row_embeddings') THEN
        CREATE INDEX IF NOT EXISTS database_row_embeddings_embedding_idx ON public.database_row_embeddings 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating vector indexes: %', SQLERRM;
END $$;

-- Create the search_embeddings function
CREATE OR REPLACE FUNCTION search_embeddings(
    query_embedding vector,
    workspace_uuid uuid,
    page_uuid uuid DEFAULT NULL,
    result_limit integer DEFAULT 10,
    similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE(
    id uuid,
    content text,
    metadata jsonb,
    similarity float,
    source_type text,
    source_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH all_embeddings AS (
        -- Page embeddings
        SELECT 
            pe.id,
            pe.chunk_text as content,
            pe.metadata,
            1 - (pe.embedding <=> query_embedding) as similarity,
            'page'::text as source_type,
            pe.page_id as source_id
        FROM page_embeddings pe
        WHERE pe.workspace_id = workspace_uuid
            AND (page_uuid IS NULL OR pe.page_id = page_uuid)
            AND pe.embedding IS NOT NULL
        
        UNION ALL
        
        -- Block embeddings  
        SELECT 
            be.id,
            be.chunk_text as content,
            be.metadata,
            1 - (be.embedding <=> query_embedding) as similarity,
            'block'::text as source_type,
            be.block_id as source_id
        FROM block_embeddings be
        WHERE be.workspace_id = workspace_uuid
            AND (page_uuid IS NULL OR be.page_id = page_uuid)
            AND be.embedding IS NOT NULL
        
        UNION ALL
        
        -- Database row embeddings
        SELECT 
            dre.id,
            dre.content as content,
            dre.metadata,
            1 - (dre.embedding <=> query_embedding) as similarity,
            'database_row'::text as source_type,
            dre.row_id as source_id
        FROM database_row_embeddings dre
        WHERE dre.workspace_id = workspace_uuid
            AND dre.embedding IS NOT NULL
    )
    SELECT 
        all_embeddings.id,
        all_embeddings.content,
        all_embeddings.metadata,
        all_embeddings.similarity,
        all_embeddings.source_type,
        all_embeddings.source_id
    FROM all_embeddings
    WHERE all_embeddings.similarity >= similarity_threshold
    ORDER BY all_embeddings.similarity DESC
    LIMIT result_limit;
END;
$$;

-- Create performance indexes (check column existence first)
DO $$
BEGIN
    -- Index for pages table
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'pages' 
        AND column_name = 'workspace_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'pages' 
        AND column_name = 'parent_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_pages_workspace_parent ON public.pages(workspace_id, parent_id);
    END IF;

    -- Index for documents table
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'documents' 
        AND column_name = 'workspace_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_documents_workspace_status ON public.documents(workspace_id, indexing_status);
    END IF;

    -- Index for database_rows table
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'database_rows'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_database_rows_block_position ON public.database_rows(block_id, position);
    END IF;

    -- Index for database_blocks table  
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'database_blocks' 
        AND column_name = 'workspace_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_database_blocks_workspace ON public.database_blocks(workspace_id);
    END IF;

    -- Composite indexes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_workspaces') THEN
        CREATE INDEX IF NOT EXISTS idx_user_workspaces_composite ON public.user_workspaces(user_id, workspace_id);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'pages' 
        AND column_name = 'slug' AND column_name = 'workspace_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_pages_slug_workspace ON public.pages(slug, workspace_id);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating indexes: %', SQLERRM;
END $$;

-- Verify setup
DO $$
BEGIN
    -- Check if vector extension is installed
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE WARNING 'Vector extension is not installed. Please enable it in Supabase dashboard.';
    ELSE
        RAISE NOTICE 'Vector extension is installed successfully.';
    END IF;
    
    -- Check if search_embeddings function exists
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'search_embeddings'
    ) THEN
        RAISE NOTICE 'search_embeddings function created successfully.';
    END IF;
    
    RAISE NOTICE 'Vector setup completed!';
END $$;