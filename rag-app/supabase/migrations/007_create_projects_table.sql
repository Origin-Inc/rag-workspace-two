-- First create workspaces table if it doesn't exist
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100),
  color VARCHAR(7),
  settings JSONB DEFAULT '{}',
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, slug)
);

-- Create indexes for projects
CREATE INDEX idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX idx_projects_is_archived ON projects(is_archived);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- Create pages table if it doesn't exist
CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title VARCHAR(500),
  slug VARCHAR(500),
  content TEXT,
  metadata JSONB DEFAULT '{}',
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update pages table to add project relationship
ALTER TABLE pages 
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS icon VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cover_image TEXT,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Create indexes for new page columns
CREATE INDEX IF NOT EXISTS idx_pages_project_id ON pages(project_id);
CREATE INDEX IF NOT EXISTS idx_pages_parent_id ON pages(parent_id);
CREATE INDEX IF NOT EXISTS idx_pages_position ON pages(position);
CREATE INDEX IF NOT EXISTS idx_pages_is_archived ON pages(is_archived);

-- Enable RLS for projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create user_workspaces table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, workspace_id)
);

-- Create roles table if it doesn't exist
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default roles if they don't exist
INSERT INTO roles (name, description) VALUES
  ('owner', 'Full control over workspace'),
  ('admin', 'Administrative access'),
  ('editor', 'Can edit content'),
  ('viewer', 'Read-only access')
ON CONFLICT (name) DO NOTHING;

-- RLS policies for projects
CREATE POLICY "Users can view projects in their workspaces" ON projects
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create projects in their workspaces" ON projects
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT uw.workspace_id FROM user_workspaces uw
      JOIN roles r ON r.name = uw.role
      WHERE uw.user_id = auth.uid() 
        AND r.name IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "Users can update projects in their workspaces" ON projects
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT uw.workspace_id FROM user_workspaces uw
      JOIN roles r ON r.name = uw.role
      WHERE uw.user_id = auth.uid() 
        AND r.name IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "Users can delete projects in their workspaces" ON projects
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT uw.workspace_id FROM user_workspaces uw
      JOIN roles r ON r.name = uw.role
      WHERE uw.user_id = auth.uid() 
        AND r.name IN ('owner', 'admin')
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for projects
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Create trigger for pages if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_pages_updated_at'
  ) THEN
    CREATE TRIGGER update_pages_updated_at
      BEFORE UPDATE ON pages
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- Insert sample project for existing workspaces (optional)
-- This ensures existing workspaces have at least one project
INSERT INTO projects (workspace_id, name, slug, description)
SELECT 
  w.id,
  'Default Project',
  'default-project',
  'Default project for organizing pages'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM projects p WHERE p.workspace_id = w.id
)
ON CONFLICT (workspace_id, slug) DO NOTHING;

-- Migrate existing pages to default project
UPDATE pages 
SET project_id = (
  SELECT p.id 
  FROM projects p 
  WHERE p.workspace_id::text = pages.workspace_id::text 
  AND p.slug = 'default-project'
  LIMIT 1
)
WHERE project_id IS NULL AND workspace_id IS NOT NULL;