-- Enhanced Project Management System Migration
-- This migration adds comprehensive project management features

-- Add missing columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS parent_project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS template_structure JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'public'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS starred_by UUID[] DEFAULT '{}';

-- Create project_collaborators table for fine-grained permissions
CREATE TABLE IF NOT EXISTS project_collaborators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'commenter')),
  permissions JSONB DEFAULT '{}',
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, user_id)
);

-- Create project_pages junction table for better page organization
CREATE TABLE IF NOT EXISTS project_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  folder_path TEXT DEFAULT '/',
  is_pinned BOOLEAN DEFAULT FALSE,
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, page_id)
);

-- Create project_templates table
CREATE TABLE IF NOT EXISTS project_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100),
  category VARCHAR(100) DEFAULT 'general',
  structure JSONB NOT NULL,
  preview_image TEXT,
  use_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, slug)
);

-- Create project_activity table for tracking changes
CREATE TABLE IF NOT EXISTS project_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  entity_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project_folders for organizing pages
CREATE TABLE IF NOT EXISTS project_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES project_folders(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  path TEXT NOT NULL,
  icon VARCHAR(100),
  color VARCHAR(7),
  position INTEGER DEFAULT 0,
  is_expanded BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, path)
);

-- Create project_views for saved views/filters
CREATE TABLE IF NOT EXISTS project_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'list' CHECK (type IN ('list', 'board', 'calendar', 'timeline', 'gallery', 'table')),
  filters JSONB DEFAULT '{}',
  sort_by VARCHAR(100),
  sort_order VARCHAR(10) DEFAULT 'asc',
  group_by VARCHAR(100),
  is_default BOOLEAN DEFAULT FALSE,
  is_shared BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_parent_project_id ON projects(parent_project_id);
CREATE INDEX IF NOT EXISTS idx_projects_position ON projects(position);
CREATE INDEX IF NOT EXISTS idx_projects_is_template ON projects(is_template);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_projects_starred_by ON projects USING GIN(starred_by);

CREATE INDEX IF NOT EXISTS idx_project_collaborators_project_id ON project_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_user_id ON project_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_role ON project_collaborators(role);

CREATE INDEX IF NOT EXISTS idx_project_pages_project_id ON project_pages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_pages_page_id ON project_pages(page_id);
CREATE INDEX IF NOT EXISTS idx_project_pages_position ON project_pages(position);
CREATE INDEX IF NOT EXISTS idx_project_pages_folder_path ON project_pages(folder_path);

CREATE INDEX IF NOT EXISTS idx_project_activity_project_id ON project_activity(project_id);
CREATE INDEX IF NOT EXISTS idx_project_activity_user_id ON project_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_project_activity_created_at ON project_activity(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_folders_project_id ON project_folders(project_id);
CREATE INDEX IF NOT EXISTS idx_project_folders_parent_id ON project_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_project_folders_path ON project_folders(path);

CREATE INDEX IF NOT EXISTS idx_project_views_project_id ON project_views(project_id);
CREATE INDEX IF NOT EXISTS idx_project_views_created_by ON project_views(created_by);

-- Enable RLS for new tables
ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_collaborators
CREATE POLICY "Users can view collaborators of projects they have access to" ON project_collaborators
  FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.workspace_id IN (
        SELECT workspace_id FROM user_workspaces 
        WHERE user_id = auth.uid()
      )
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Project admins can manage collaborators" ON project_collaborators
  FOR ALL
  USING (
    project_id IN (
      SELECT project_id FROM project_collaborators
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for project_pages
CREATE POLICY "Users can view pages in projects they have access to" ON project_pages
  FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.workspace_id IN (
        SELECT workspace_id FROM user_workspaces 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Project editors can manage pages" ON project_pages
  FOR ALL
  USING (
    project_id IN (
      SELECT project_id FROM project_collaborators
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

-- RLS Policies for project_templates
CREATE POLICY "Users can view templates in their workspace or public templates" ON project_templates
  FOR SELECT
  USING (
    is_public = TRUE OR
    workspace_id IN (
      SELECT workspace_id FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create templates in their workspace" ON project_templates
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT uw.workspace_id FROM user_workspaces uw
      JOIN roles r ON r.name = uw.role
      WHERE uw.user_id = auth.uid() 
        AND r.name IN ('owner', 'admin', 'editor')
    )
  );

-- RLS Policies for project_activity
CREATE POLICY "Users can view activity in projects they have access to" ON project_activity
  FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.workspace_id IN (
        SELECT workspace_id FROM user_workspaces 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "System can insert activity" ON project_activity
  FOR INSERT
  WITH CHECK (true);

-- RLS Policies for project_folders
CREATE POLICY "Users can view folders in projects they have access to" ON project_folders
  FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.workspace_id IN (
        SELECT workspace_id FROM user_workspaces 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Project editors can manage folders" ON project_folders
  FOR ALL
  USING (
    project_id IN (
      SELECT project_id FROM project_collaborators
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

-- RLS Policies for project_views
CREATE POLICY "Users can view views in projects they have access to" ON project_views
  FOR SELECT
  USING (
    is_shared = TRUE OR created_by = auth.uid() OR
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.workspace_id IN (
        SELECT workspace_id FROM user_workspaces 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage their own views" ON project_views
  FOR ALL
  USING (created_by = auth.uid());

-- Function to track project activity
CREATE OR REPLACE FUNCTION track_project_activity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_activity (
    project_id,
    user_id,
    action,
    entity_type,
    entity_id,
    entity_name,
    details
  ) VALUES (
    COALESCE(NEW.project_id, OLD.project_id),
    auth.uid(),
    TG_ARGV[0],
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.title, NEW.name, OLD.title, OLD.name),
    jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create activity tracking triggers
CREATE TRIGGER track_page_activity
  AFTER INSERT OR UPDATE OR DELETE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION track_project_activity('page_modified');

CREATE TRIGGER track_project_activity_trigger
  AFTER UPDATE ON projects
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION track_project_activity('project_updated');

-- Function to get project hierarchy
CREATE OR REPLACE FUNCTION get_project_hierarchy(workspace_uuid UUID)
RETURNS TABLE (
  id UUID,
  parent_project_id UUID,
  name VARCHAR,
  slug VARCHAR,
  level INTEGER,
  path TEXT
) AS $$
WITH RECURSIVE project_tree AS (
  SELECT 
    p.id,
    p.parent_project_id,
    p.name,
    p.slug,
    0 as level,
    p.name::TEXT as path
  FROM projects p
  WHERE p.workspace_id = workspace_uuid AND p.parent_project_id IS NULL
  
  UNION ALL
  
  SELECT 
    p.id,
    p.parent_project_id,
    p.name,
    p.slug,
    pt.level + 1,
    pt.path || ' > ' || p.name
  FROM projects p
  INNER JOIN project_tree pt ON p.parent_project_id = pt.id
)
SELECT * FROM project_tree ORDER BY path;
$$ LANGUAGE sql STABLE;

-- Function to duplicate a project from template
CREATE OR REPLACE FUNCTION duplicate_project_from_template(
  template_id UUID,
  new_workspace_id UUID,
  new_name VARCHAR,
  new_slug VARCHAR
)
RETURNS UUID AS $$
DECLARE
  new_project_id UUID;
  template_record RECORD;
BEGIN
  -- Get template details
  SELECT * INTO template_record 
  FROM projects 
  WHERE id = template_id AND is_template = TRUE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  
  -- Create new project
  INSERT INTO projects (
    workspace_id,
    name,
    slug,
    description,
    icon,
    color,
    settings,
    template_structure,
    created_by
  ) VALUES (
    new_workspace_id,
    new_name,
    new_slug,
    template_record.description,
    template_record.icon,
    template_record.color,
    template_record.settings,
    template_record.template_structure,
    auth.uid()
  ) RETURNING id INTO new_project_id;
  
  -- Copy template pages if they exist
  INSERT INTO pages (
    workspace_id,
    project_id,
    title,
    slug,
    icon,
    content,
    position,
    created_by
  )
  SELECT 
    new_workspace_id,
    new_project_id,
    title,
    slug || '-' || substr(md5(random()::text), 0, 7),
    icon,
    content,
    position,
    auth.uid()
  FROM pages
  WHERE project_id = template_id;
  
  -- Update template use count
  UPDATE project_templates 
  SET use_count = use_count + 1 
  WHERE id = template_id;
  
  RETURN new_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add helper function for project search
CREATE OR REPLACE FUNCTION search_projects(
  search_query TEXT,
  workspace_uuid UUID,
  include_archived BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  slug VARCHAR,
  description TEXT,
  icon VARCHAR,
  color VARCHAR,
  is_archived BOOLEAN,
  page_count BIGINT,
  last_activity TIMESTAMPTZ,
  relevance REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.slug,
    p.description,
    p.icon,
    p.color,
    p.is_archived,
    COUNT(DISTINCT pp.page_id) as page_count,
    MAX(pa.created_at) as last_activity,
    ts_rank(
      to_tsvector('english', COALESCE(p.name, '') || ' ' || COALESCE(p.description, '')),
      websearch_to_tsquery('english', search_query)
    ) as relevance
  FROM projects p
  LEFT JOIN project_pages pp ON p.id = pp.project_id
  LEFT JOIN project_activity pa ON p.id = pa.project_id
  WHERE 
    p.workspace_id = workspace_uuid
    AND (include_archived OR p.is_archived = FALSE)
    AND (
      p.name ILIKE '%' || search_query || '%'
      OR p.description ILIKE '%' || search_query || '%'
      OR search_query = ANY(p.tags)
    )
  GROUP BY p.id
  ORDER BY relevance DESC, p.updated_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Insert default project templates
INSERT INTO project_templates (workspace_id, name, slug, description, category, structure, is_public) VALUES
(NULL, 'Kanban Board', 'kanban-board', 'Track tasks using a Kanban-style board', 'productivity', 
 '{"columns": ["To Do", "In Progress", "Review", "Done"], "default_view": "board"}'::jsonb, TRUE),
(NULL, 'Documentation', 'documentation', 'Organize your documentation and guides', 'knowledge', 
 '{"folders": ["Getting Started", "API Reference", "Guides", "FAQ"], "default_view": "list"}'::jsonb, TRUE),
(NULL, 'Product Roadmap', 'product-roadmap', 'Plan and track product development', 'planning', 
 '{"quarters": ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024"], "default_view": "timeline"}'::jsonb, TRUE),
(NULL, 'Meeting Notes', 'meeting-notes', 'Organize meeting notes and action items', 'collaboration', 
 '{"folders": ["Daily Standups", "Weekly Syncs", "One-on-Ones", "Retrospectives"], "default_view": "list"}'::jsonb, TRUE),
(NULL, 'Research Project', 'research-project', 'Collect and organize research materials', 'research', 
 '{"folders": ["Literature Review", "Data Collection", "Analysis", "Reports"], "default_view": "list"}'::jsonb, TRUE)
ON CONFLICT DO NOTHING;