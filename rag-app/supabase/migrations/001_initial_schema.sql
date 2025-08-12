-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For compound indexes

-- Create enum types for better type safety
CREATE TYPE block_type AS ENUM (
  'text',
  'heading',
  'bullet_list',
  'numbered_list',
  'checkbox',
  'code',
  'quote',
  'divider',
  'image',
  'video',
  'file',
  'table',
  'kanban',
  'calendar',
  'embed',
  'link',
  'toggle',
  'callout',
  'synced_block',
  'ai_block'
);

CREATE TYPE page_type AS ENUM (
  'document',
  'database',
  'kanban_board',
  'calendar_view',
  'gallery',
  'timeline',
  'chat'
);

CREATE TYPE workspace_tier AS ENUM (
  'free',
  'pro',
  'team',
  'enterprise'
);

-- Note: We're NOT creating users table here since our custom auth already handles it
-- We'll reference the existing users table from Prisma

-- Workspaces table (extends our existing workspace from Prisma)
CREATE TABLE IF NOT EXISTS workspaces_extended (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id TEXT NOT NULL UNIQUE, -- Links to Prisma workspace
  tier workspace_tier DEFAULT 'free',
  storage_used_bytes BIGINT DEFAULT 0,
  storage_limit_bytes BIGINT DEFAULT 5368709120, -- 5GB default
  ai_credits_used INTEGER DEFAULT 0,
  ai_credits_limit INTEGER DEFAULT 1000,
  custom_domain TEXT,
  brand_logo_url TEXT,
  settings JSONB DEFAULT '{}',
  features JSONB DEFAULT '{"max_members": 5, "max_pages": 100, "version_history_days": 30}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pages table with hierarchical structure
CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id TEXT NOT NULL, -- References Prisma workspace
  parent_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  icon TEXT, -- Emoji or icon identifier
  cover_image TEXT, -- URL to cover image
  type page_type DEFAULT 'document',
  content JSONB DEFAULT '{}', -- Stores rich content structure
  properties JSONB DEFAULT '{}', -- For database pages
  position INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_template BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  last_edited_by TEXT, -- References Prisma user
  last_edited_time TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL, -- References Prisma user
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  path TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN parent_id IS NULL THEN id::text
      ELSE parent_id::text || '/' || id::text
    END
  ) STORED,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content::text, '')), 'B')
  ) STORED
);

-- Blocks table for modular content
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  type block_type NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  properties JSONB DEFAULT '{}', -- Type-specific properties
  position JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "width": 12, "height": 1}',
  metadata JSONB DEFAULT '{}',
  is_synced BOOLEAN DEFAULT FALSE,
  sync_source_id UUID REFERENCES blocks(id) ON DELETE SET NULL,
  version INTEGER DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(content::text, ''))
  ) STORED
);

-- Comments on blocks
CREATE TABLE block_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page permissions for granular access control
CREATE TABLE page_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id TEXT,
  workspace_id TEXT,
  can_view BOOLEAN DEFAULT TRUE,
  can_edit BOOLEAN DEFAULT FALSE,
  can_comment BOOLEAN DEFAULT TRUE,
  can_share BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_id, user_id)
);

-- Activity/History tracking
CREATE TABLE page_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 'viewed', 'edited', 'commented', 'shared', etc.
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Templates library
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  content JSONB NOT NULL,
  use_count INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User workspace membership table
CREATE TABLE user_workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces_extended(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, workspace_id)
);

-- Embeddings for AI/RAG features
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  embedding vector(1536), -- OpenAI ada-002 dimensions
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_hash)
);

-- Create indexes for performance
CREATE INDEX idx_user_workspaces_user_id ON user_workspaces(user_id);
CREATE INDEX idx_user_workspaces_workspace_id ON user_workspaces(workspace_id);
CREATE INDEX idx_pages_workspace ON pages(workspace_id);
CREATE INDEX idx_pages_parent ON pages(parent_id);
CREATE INDEX idx_pages_created_by ON pages(created_by);
CREATE INDEX idx_pages_search ON pages USING GIN(search_vector);
CREATE INDEX idx_pages_updated ON pages(updated_at DESC);
CREATE INDEX idx_pages_path ON pages(path);

CREATE INDEX idx_blocks_page ON blocks(page_id);
CREATE INDEX idx_blocks_parent ON blocks(parent_id);
CREATE INDEX idx_blocks_type ON blocks(type);
CREATE INDEX idx_blocks_search ON blocks USING GIN(search_vector);
CREATE INDEX idx_blocks_updated ON blocks(updated_at DESC);
CREATE INDEX idx_blocks_synced ON blocks(sync_source_id) WHERE is_synced = true;

CREATE INDEX idx_comments_block ON block_comments(block_id);
CREATE INDEX idx_comments_page ON block_comments(page_id);
CREATE INDEX idx_comments_user ON block_comments(user_id);
CREATE INDEX idx_comments_unresolved ON block_comments(block_id) WHERE resolved = false;

CREATE INDEX idx_permissions_page ON page_permissions(page_id);
CREATE INDEX idx_permissions_user ON page_permissions(user_id);
CREATE INDEX idx_permissions_workspace ON page_permissions(workspace_id);

CREATE INDEX idx_activity_page ON page_activity(page_id);
CREATE INDEX idx_activity_user ON page_activity(user_id);
CREATE INDEX idx_activity_created ON page_activity(created_at DESC);

CREATE INDEX idx_embeddings_page ON embeddings(page_id);
CREATE INDEX idx_embeddings_block ON embeddings(block_id);
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat(embedding vector_cosine_ops);

-- Enable Row Level Security
ALTER TABLE workspaces_extended ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Workspaces: Users can only see workspaces they belong to
CREATE POLICY "Users can view their workspaces" ON workspaces_extended
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id::text FROM auth.users 
      WHERE id = auth.uid()
    )
  );

-- Pages: Complex permission system
CREATE POLICY "Users can view pages they have access to" ON pages
  FOR SELECT
  USING (
    -- User owns the workspace
    workspace_id IN (
      SELECT workspace_id::text FROM auth.users 
      WHERE id = auth.uid()
    )
    OR
    -- User has explicit permission
    id IN (
      SELECT page_id FROM page_permissions
      WHERE user_id = auth.uid()::text AND can_view = true
    )
    OR
    -- Page is in a shared workspace
    workspace_id IN (
      SELECT workspace_id FROM page_permissions
      WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can edit pages they have permission for" ON pages
  FOR UPDATE
  USING (
    created_by = auth.uid()::text
    OR
    id IN (
      SELECT page_id FROM page_permissions
      WHERE user_id = auth.uid()::text AND can_edit = true
    )
  );

CREATE POLICY "Users can create pages in their workspaces" ON pages
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id::text FROM auth.users 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own pages" ON pages
  FOR DELETE
  USING (created_by = auth.uid()::text);

-- Blocks: Inherit permissions from pages
CREATE POLICY "Users can view blocks in accessible pages" ON blocks
  FOR SELECT
  USING (
    page_id IN (
      SELECT id FROM pages
      -- The SELECT policy on pages will filter appropriately
    )
  );

CREATE POLICY "Users can edit blocks in editable pages" ON blocks
  FOR ALL
  USING (
    page_id IN (
      SELECT id FROM pages
      WHERE created_by = auth.uid()::text
      OR id IN (
        SELECT page_id FROM page_permissions
        WHERE user_id = auth.uid()::text AND can_edit = true
      )
    )
  );

-- Comments: Users can view comments on accessible pages
CREATE POLICY "Users can view comments on accessible pages" ON block_comments
  FOR SELECT
  USING (
    page_id IN (SELECT id FROM pages)
  );

CREATE POLICY "Users can create comments on accessible pages" ON block_comments
  FOR INSERT
  WITH CHECK (
    page_id IN (
      SELECT id FROM pages
      WHERE id IN (
        SELECT page_id FROM page_permissions
        WHERE user_id = auth.uid()::text AND can_comment = true
      )
    )
  );

CREATE POLICY "Users can edit their own comments" ON block_comments
  FOR UPDATE
  USING (user_id = auth.uid()::text);

-- Activity: Users can only see activity in their workspaces
CREATE POLICY "Users can view activity in their workspaces" ON page_activity
  FOR SELECT
  USING (
    page_id IN (SELECT id FROM pages)
  );

CREATE POLICY "Activity is automatically tracked" ON page_activity
  FOR INSERT
  WITH CHECK (true); -- System will handle validation

-- Templates: Public templates or workspace templates
CREATE POLICY "Users can view public or workspace templates" ON templates
  FOR SELECT
  USING (
    is_public = true
    OR
    workspace_id IN (
      SELECT workspace_id::text FROM auth.users 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create templates in their workspaces" ON templates
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id::text FROM auth.users 
      WHERE id = auth.uid()
    )
  );

-- Embeddings: Accessible if page/block is accessible
CREATE POLICY "Users can view embeddings for accessible content" ON embeddings
  FOR SELECT
  USING (
    page_id IN (SELECT id FROM pages)
    OR
    block_id IN (SELECT id FROM blocks)
  );

-- Functions for common operations

-- Function to get page hierarchy
CREATE OR REPLACE FUNCTION get_page_hierarchy(page_uuid UUID)
RETURNS TABLE (
  id UUID,
  parent_id UUID,
  title TEXT,
  level INTEGER,
  path TEXT
) AS $$
WITH RECURSIVE page_tree AS (
  SELECT 
    p.id,
    p.parent_id,
    p.title,
    0 as level,
    p.title as path
  FROM pages p
  WHERE p.id = page_uuid
  
  UNION ALL
  
  SELECT 
    p.id,
    p.parent_id,
    p.title,
    pt.level + 1,
    pt.path || ' > ' || p.title
  FROM pages p
  INNER JOIN page_tree pt ON p.parent_id = pt.id
)
SELECT * FROM page_tree ORDER BY level;
$$ LANGUAGE SQL STABLE;

-- Function to update workspace storage usage
CREATE OR REPLACE FUNCTION update_workspace_storage()
RETURNS TRIGGER AS $$
BEGIN
  -- Update storage used when files are added/removed
  UPDATE workspaces_extended
  SET 
    storage_used_bytes = storage_used_bytes + 
      CASE 
        WHEN TG_OP = 'INSERT' THEN (NEW.metadata->>'file_size')::BIGINT
        WHEN TG_OP = 'DELETE' THEN -(OLD.metadata->>'file_size')::BIGINT
        WHEN TG_OP = 'UPDATE' THEN 
          (NEW.metadata->>'file_size')::BIGINT - (OLD.metadata->>'file_size')::BIGINT
        ELSE 0
      END,
    updated_at = NOW()
  WHERE workspace_id = 
    CASE 
      WHEN TG_OP = 'DELETE' THEN 
        (SELECT workspace_id FROM pages WHERE id = OLD.page_id)
      ELSE 
        (SELECT workspace_id FROM pages WHERE id = NEW.page_id)
    END;
  
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- Trigger for storage tracking (simplified without WHEN clause)
CREATE TRIGGER track_storage_usage
  AFTER INSERT OR UPDATE OR DELETE ON blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_storage();

-- Function to track page activity
CREATE OR REPLACE FUNCTION track_page_activity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO page_activity (page_id, user_id, action, details)
  VALUES (
    NEW.id,
    NEW.updated_by,
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'created'
      WHEN TG_OP = 'UPDATE' THEN 'edited'
      ELSE 'unknown'
    END,
    jsonb_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'timestamp', NOW()
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for activity tracking
CREATE TRIGGER track_page_changes
  AFTER INSERT OR UPDATE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION track_page_activity();

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON workspaces_extended
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_pages_updated_at
  BEFORE UPDATE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_blocks_updated_at
  BEFORE UPDATE ON blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON block_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_permissions_updated_at
  BEFORE UPDATE ON page_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Seed some default templates
INSERT INTO templates (category, name, description, is_public, content, created_by)
VALUES 
  ('productivity', 'Meeting Notes', 'Template for meeting notes', true, 
   '{"blocks": [{"type": "heading", "content": {"text": "Meeting Notes", "level": 1}}]}', 
   'system'),
  ('productivity', 'Project Plan', 'Template for project planning', true,
   '{"blocks": [{"type": "heading", "content": {"text": "Project Plan", "level": 1}}]}',
   'system'),
  ('personal', 'Daily Journal', 'Template for daily journaling', true,
   '{"blocks": [{"type": "heading", "content": {"text": "Daily Journal", "level": 1}}]}',
   'system');

-- Add helpful comments
COMMENT ON TABLE pages IS 'Core table for all pages/documents in the system';
COMMENT ON TABLE blocks IS 'Modular content blocks that make up pages';
COMMENT ON TABLE workspaces_extended IS 'Extended workspace settings and limits';
COMMENT ON COLUMN pages.path IS 'Materialized path for efficient hierarchy queries';
COMMENT ON COLUMN pages.search_vector IS 'Full-text search index';
COMMENT ON COLUMN blocks.position IS 'Grid position for drag-and-drop layout';
COMMENT ON COLUMN embeddings.embedding IS 'Vector embeddings for semantic search';