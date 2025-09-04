-- First, let's check what tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check if pages table has workspace_id column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'pages'
ORDER BY ordinal_position;

-- If pages table exists but is missing workspace_id, add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pages' 
        AND column_name = 'workspace_id'
    ) THEN
        -- Add workspace_id column if missing
        ALTER TABLE public.pages 
        ADD COLUMN workspace_id UUID;
        
        -- If there are any existing pages, we need to assign them to a workspace
        -- First, check if there's a default workspace
        IF EXISTS (SELECT 1 FROM public.workspaces LIMIT 1) THEN
            UPDATE public.pages 
            SET workspace_id = (SELECT id FROM public.workspaces LIMIT 1)
            WHERE workspace_id IS NULL;
        END IF;
        
        -- Make workspace_id NOT NULL after setting values
        ALTER TABLE public.pages 
        ALTER COLUMN workspace_id SET NOT NULL;
        
        RAISE NOTICE 'Added workspace_id column to pages table';
    ELSE
        RAISE NOTICE 'workspace_id column already exists in pages table';
    END IF;
END $$;

-- Check if parent_id column exists in pages table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pages' 
        AND column_name = 'parent_id'
    ) THEN
        ALTER TABLE public.pages 
        ADD COLUMN parent_id UUID;
        
        RAISE NOTICE 'Added parent_id column to pages table';
    END IF;
END $$;

-- Add any missing columns to pages table
DO $$
BEGIN
    -- Add content column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pages' 
        AND column_name = 'content'
    ) THEN
        ALTER TABLE public.pages ADD COLUMN content JSONB;
    END IF;
    
    -- Add blocks column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pages' 
        AND column_name = 'blocks'
    ) THEN
        ALTER TABLE public.pages ADD COLUMN blocks JSONB;
    END IF;
    
    -- Add position column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pages' 
        AND column_name = 'position'
    ) THEN
        ALTER TABLE public.pages ADD COLUMN position INTEGER DEFAULT 0;
    END IF;
    
    -- Add is_public column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pages' 
        AND column_name = 'is_public'
    ) THEN
        ALTER TABLE public.pages ADD COLUMN is_public BOOLEAN DEFAULT false;
    END IF;
    
    -- Add is_archived column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pages' 
        AND column_name = 'is_archived'
    ) THEN
        ALTER TABLE public.pages ADD COLUMN is_archived BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Now check the structure again
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'pages'
ORDER BY ordinal_position;