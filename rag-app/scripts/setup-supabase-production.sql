-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Add vector columns to embedding tables if they don't exist
DO $$ 
BEGIN
    -- Check and add embedding column to embeddings table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'embeddings' 
        AND column_name = 'embedding'
    ) THEN
        ALTER TABLE public.embeddings ADD COLUMN embedding vector(1536);
    END IF;

    -- Check and add embedding column to page_embeddings table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'page_embeddings' 
        AND column_name = 'embedding'
    ) THEN
        ALTER TABLE public.page_embeddings ADD COLUMN embedding vector(1536);
    END IF;

    -- Check and add embedding column to block_embeddings table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'block_embeddings' 
        AND column_name = 'embedding'
    ) THEN
        ALTER TABLE public.block_embeddings ADD COLUMN embedding vector(1536);
    END IF;

    -- Check and add embedding column to database_row_embeddings table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'database_row_embeddings' 
        AND column_name = 'embedding'
    ) THEN
        ALTER TABLE public.database_row_embeddings ADD COLUMN embedding vector(1536);
    END IF;
END $$;

-- Create vector similarity search indexes
CREATE INDEX IF NOT EXISTS embeddings_embedding_idx ON public.embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS page_embeddings_embedding_idx ON public.page_embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS block_embeddings_embedding_idx ON public.block_embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS database_row_embeddings_embedding_idx ON public.database_row_embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

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
            be.content as content,
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

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_pages_workspace_parent ON public.pages(workspace_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_blocks_page_position ON public.blocks(page_id, position);
CREATE INDEX IF NOT EXISTS idx_documents_workspace_status ON public.documents(workspace_id, indexing_status);
CREATE INDEX IF NOT EXISTS idx_database_rows_block_position ON public.database_rows(block_id, position);

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_workspaces_composite ON public.user_workspaces(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_pages_slug_workspace ON public.pages(slug, workspace_id);
CREATE INDEX IF NOT EXISTS idx_blocks_type_page ON public.blocks(type, page_id);

-- Add GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_blocks_content_gin ON public.blocks USING gin(content);
CREATE INDEX IF NOT EXISTS idx_database_columns_config_gin ON public.database_columns USING gin(config);
CREATE INDEX IF NOT EXISTS idx_workspaces_settings_gin ON public.workspaces USING gin(settings);

-- Create text search indexes
CREATE INDEX IF NOT EXISTS idx_pages_title_trgm ON public.pages USING gist(title gist_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_blocks_search_trgm ON public.blocks USING gin(to_tsvector('english', content::text));

-- Insert default roles if they don't exist
INSERT INTO public.roles (name, display_name, description, is_system)
VALUES 
    ('owner', 'Owner', 'Full access to workspace', true),
    ('admin', 'Admin', 'Administrative access', true),
    ('editor', 'Editor', 'Can edit content', true),
    ('viewer', 'Viewer', 'Read-only access', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions if they don't exist
INSERT INTO public.permissions (resource, action, description)
VALUES
    ('workspace', 'manage', 'Manage workspace settings'),
    ('workspace', 'delete', 'Delete workspace'),
    ('users', 'invite', 'Invite users to workspace'),
    ('users', 'remove', 'Remove users from workspace'),
    ('users', 'manage_roles', 'Manage user roles'),
    ('pages', 'create', 'Create pages'),
    ('pages', 'edit', 'Edit pages'),
    ('pages', 'delete', 'Delete pages'),
    ('pages', 'view', 'View pages'),
    ('blocks', 'create', 'Create blocks'),
    ('blocks', 'edit', 'Edit blocks'),
    ('blocks', 'delete', 'Delete blocks'),
    ('documents', 'upload', 'Upload documents'),
    ('documents', 'delete', 'Delete documents'),
    ('documents', 'view', 'View documents'),
    ('rag', 'query', 'Execute RAG queries'),
    ('rag', 'manage', 'Manage RAG settings')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant permissions to roles
DO $$
DECLARE
    owner_role_id uuid;
    admin_role_id uuid;
    editor_role_id uuid;
    viewer_role_id uuid;
    perm_id uuid;
BEGIN
    -- Get role IDs
    SELECT id INTO owner_role_id FROM public.roles WHERE name = 'owner';
    SELECT id INTO admin_role_id FROM public.roles WHERE name = 'admin';
    SELECT id INTO editor_role_id FROM public.roles WHERE name = 'editor';
    SELECT id INTO viewer_role_id FROM public.roles WHERE name = 'viewer';
    
    -- Grant all permissions to owner
    FOR perm_id IN (SELECT id FROM public.permissions)
    LOOP
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (owner_role_id, perm_id)
        ON CONFLICT DO NOTHING;
    END LOOP;
    
    -- Grant admin permissions
    FOR perm_id IN (
        SELECT id FROM public.permissions 
        WHERE NOT (resource = 'workspace' AND action IN ('delete'))
    )
    LOOP
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (admin_role_id, perm_id)
        ON CONFLICT DO NOTHING;
    END LOOP;
    
    -- Grant editor permissions
    FOR perm_id IN (
        SELECT id FROM public.permissions 
        WHERE resource IN ('pages', 'blocks', 'documents', 'rag')
        AND action NOT IN ('delete', 'manage')
    )
    LOOP
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (editor_role_id, perm_id)
        ON CONFLICT DO NOTHING;
    END LOOP;
    
    -- Grant viewer permissions
    FOR perm_id IN (
        SELECT id FROM public.permissions 
        WHERE action IN ('view', 'query')
    )
    LOOP
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (viewer_role_id, perm_id)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;

-- Ensure updated_at triggers exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at column
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('
            CREATE TRIGGER update_%I_updated_at 
            BEFORE UPDATE ON public.%I 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column()',
            t, t
        );
    EXCEPTION
        WHEN duplicate_object THEN
            NULL; -- Trigger already exists
    END LOOP;
END $$;

-- Verify setup
DO $$
BEGIN
    -- Check if vector extension is installed
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE WARNING 'Vector extension is not installed. Please enable it in Supabase dashboard.';
    END IF;
    
    -- Check if tables have vector columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND column_name = 'embedding'
    ) THEN
        RAISE WARNING 'No embedding columns found. Schema may need updating.';
    END IF;
    
    RAISE NOTICE 'Supabase production setup completed successfully!';
END $$;