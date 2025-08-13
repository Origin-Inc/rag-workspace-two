-- Migration for Page Editor with Canvas System
-- Adds support for canvas-based page editing with grid layout

-- Add is_public column to pages table if it doesn't exist
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

-- Add canvas settings to pages table
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS canvas_settings JSONB DEFAULT '{
  "grid": {
    "columns": 12,
    "rowHeight": 40,
    "gap": 8,
    "maxWidth": 1200
  },
  "snapToGrid": true,
  "showGrid": false,
  "autoArrange": true
}'::jsonb;

-- Add editor settings for pages
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS editor_settings JSONB DEFAULT '{
  "fontSize": "medium",
  "fontFamily": "default",
  "showOutline": true,
  "showBlockHandles": true,
  "enableSlashCommands": true,
  "enableMarkdown": true,
  "enableAI": true
}'::jsonb;

-- Create page templates table
CREATE TABLE IF NOT EXISTS page_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'general',
  icon VARCHAR(100),
  thumbnail_url TEXT,
  blocks_structure JSONB NOT NULL,
  canvas_settings JSONB DEFAULT '{}',
  editor_settings JSONB DEFAULT '{}',
  use_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, slug)
);

-- Create page versions table for history
CREATE TABLE IF NOT EXISTS page_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title VARCHAR(500),
  blocks_snapshot JSONB NOT NULL,
  canvas_settings JSONB,
  metadata JSONB,
  change_summary TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(page_id, version_number)
);

-- Create block templates for quick insertion
CREATE TABLE IF NOT EXISTS block_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) DEFAULT 'custom',
  block_type block_type NOT NULL,
  content JSONB NOT NULL,
  properties JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  icon VARCHAR(100),
  shortcut VARCHAR(50),
  is_public BOOLEAN DEFAULT FALSE,
  use_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create slash commands registry
CREATE TABLE IF NOT EXISTS slash_commands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  command VARCHAR(50) UNIQUE NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'general',
  icon VARCHAR(100),
  action_type VARCHAR(50) NOT NULL, -- 'insert_block', 'ai_action', 'formatting', 'navigation'
  action_data JSONB,
  keywords TEXT[] DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT TRUE,
  min_role VARCHAR(50) DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create collaborative editing sessions
CREATE TABLE IF NOT EXISTS editing_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  cursor_position JSONB,
  selection_range JSONB,
  viewport JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  
  UNIQUE(page_id, user_id, is_active)
);

-- Create clipboard for cross-page copy/paste
CREATE TABLE IF NOT EXISTS clipboard_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL, -- 'blocks', 'text', 'media'
  content JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_page_templates_project ON page_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_page_templates_category ON page_templates(category);
CREATE INDEX IF NOT EXISTS idx_page_templates_public ON page_templates(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_page_templates_featured ON page_templates(is_featured) WHERE is_featured = TRUE;

CREATE INDEX IF NOT EXISTS idx_page_versions_page ON page_versions(page_id);
CREATE INDEX IF NOT EXISTS idx_page_versions_created ON page_versions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_block_templates_project ON block_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_block_templates_category ON block_templates(category);
CREATE INDEX IF NOT EXISTS idx_block_templates_shortcut ON block_templates(shortcut);

CREATE INDEX IF NOT EXISTS idx_slash_commands_command ON slash_commands(command);
CREATE INDEX IF NOT EXISTS idx_slash_commands_category ON slash_commands(category);
CREATE INDEX IF NOT EXISTS idx_slash_commands_keywords ON slash_commands USING GIN(keywords);

CREATE INDEX IF NOT EXISTS idx_editing_sessions_page ON editing_sessions(page_id);
CREATE INDEX IF NOT EXISTS idx_editing_sessions_active ON editing_sessions(page_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_editing_sessions_activity ON editing_sessions(last_activity DESC);

CREATE INDEX IF NOT EXISTS idx_clipboard_user ON clipboard_items(user_id);
CREATE INDEX IF NOT EXISTS idx_clipboard_expires ON clipboard_items(expires_at);

-- Enable RLS
ALTER TABLE page_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE slash_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE editing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clipboard_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for page_templates
CREATE POLICY "Users can view public templates or project templates" ON page_templates
  FOR SELECT
  USING (
    is_public = TRUE OR
    is_featured = TRUE OR
    EXISTS (
      SELECT 1 FROM project_collaborators pm
      WHERE pm.project_id = page_templates.project_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create templates in their project" ON page_templates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_collaborators pm
      WHERE pm.project_id = page_templates.project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'admin', 'editor')
    )
  );

-- RLS Policies for page_versions
CREATE POLICY "Users can view versions of pages they have access to" ON page_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pages p
      WHERE p.id = page_versions.page_id
      AND EXISTS (
        SELECT 1 FROM project_collaborators pm
        WHERE pm.project_id = p.project_id
        AND pm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create versions for pages they can edit" ON page_versions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pages p
      JOIN project_collaborators pm ON pm.project_id = p.project_id
      WHERE p.id = page_versions.page_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'admin', 'editor')
    )
  );

-- RLS Policies for block_templates
CREATE POLICY "Users can view public or project block templates" ON block_templates
  FOR SELECT
  USING (
    is_public = TRUE OR
    EXISTS (
      SELECT 1 FROM project_collaborators pm
      WHERE pm.project_id = block_templates.project_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create block templates" ON block_templates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_collaborators pm
      WHERE pm.project_id = block_templates.project_id
      AND pm.user_id = auth.uid()
    )
  );

-- RLS Policies for slash_commands
CREATE POLICY "All users can view enabled slash commands" ON slash_commands
  FOR SELECT
  USING (is_enabled = TRUE);

-- RLS Policies for editing_sessions
CREATE POLICY "Users can view all active sessions for pages they access" ON editing_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pages p
      WHERE p.id = editing_sessions.page_id
      AND EXISTS (
        SELECT 1 FROM project_collaborators pm
        WHERE pm.project_id = p.project_id
        AND pm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage their own sessions" ON editing_sessions
  FOR ALL
  USING (user_id = auth.uid());

-- RLS Policies for clipboard_items
CREATE POLICY "Users can only access their own clipboard" ON clipboard_items
  FOR ALL
  USING (user_id = auth.uid());

-- Functions for page editor

-- Function to create a new page version
CREATE OR REPLACE FUNCTION create_page_version(
  p_page_id UUID,
  p_change_summary TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_version_number INTEGER;
  v_version_id UUID;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
  FROM page_versions
  WHERE page_id = p_page_id;
  
  -- Create snapshot of current state
  INSERT INTO page_versions (
    page_id,
    version_number,
    title,
    blocks_snapshot,
    canvas_settings,
    metadata,
    change_summary,
    created_by
  )
  SELECT 
    p.id,
    v_version_number,
    p.title,
    COALESCE(
      json_agg(
        json_build_object(
          'id', b.id,
          'type', b.type,
          'content', b.content,
          'properties', b.properties,
          'position', b.position,
          'metadata', b.metadata,
          'parent_id', b.parent_id
        ) ORDER BY b.position
      ) FILTER (WHERE b.id IS NOT NULL),
      '[]'::json
    ),
    p.canvas_settings,
    p.metadata,
    p_change_summary,
    auth.uid()
  FROM pages p
  LEFT JOIN blocks b ON b.page_id = p.id
  WHERE p.id = p_page_id
  GROUP BY p.id
  RETURNING id INTO v_version_id;
  
  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to restore a page version
CREATE OR REPLACE FUNCTION restore_page_version(
  p_version_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_page_id UUID;
  v_blocks JSONB;
BEGIN
  -- Get version data
  SELECT page_id, blocks_snapshot INTO v_page_id, v_blocks
  FROM page_versions
  WHERE id = p_version_id;
  
  IF v_page_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Delete existing blocks
  DELETE FROM blocks WHERE page_id = v_page_id;
  
  -- Restore blocks from snapshot
  INSERT INTO blocks (
    id,
    page_id,
    type,
    content,
    properties,
    position,
    metadata,
    parent_id,
    created_by
  )
  SELECT 
    COALESCE((block_data->>'id')::UUID, gen_random_uuid()),
    v_page_id,
    (block_data->>'type')::block_type,
    block_data->'content',
    block_data->'properties',
    block_data->'position',
    block_data->'metadata',
    (block_data->>'parent_id')::UUID,
    auth.uid()
  FROM jsonb_array_elements(v_blocks) AS block_data;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired clipboard items
CREATE OR REPLACE FUNCTION cleanup_expired_clipboard()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM clipboard_items
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to track active editing sessions
CREATE OR REPLACE FUNCTION update_editing_session(
  p_page_id UUID,
  p_cursor_position JSONB DEFAULT NULL,
  p_selection_range JSONB DEFAULT NULL,
  p_viewport JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Update or insert session
  INSERT INTO editing_sessions (
    page_id,
    user_id,
    session_token,
    cursor_position,
    selection_range,
    viewport,
    last_activity
  ) VALUES (
    p_page_id,
    auth.uid(),
    encode(gen_random_bytes(32), 'hex'),
    p_cursor_position,
    p_selection_range,
    p_viewport,
    NOW()
  )
  ON CONFLICT (page_id, user_id, is_active) 
  WHERE is_active = TRUE
  DO UPDATE SET
    cursor_position = COALESCE(p_cursor_position, editing_sessions.cursor_position),
    selection_range = COALESCE(p_selection_range, editing_sessions.selection_range),
    viewport = COALESCE(p_viewport, editing_sessions.viewport),
    last_activity = NOW()
  RETURNING id INTO v_session_id;
  
  -- Mark old sessions as inactive
  UPDATE editing_sessions
  SET is_active = FALSE, ended_at = NOW()
  WHERE page_id = p_page_id 
    AND last_activity < NOW() - INTERVAL '30 minutes'
    AND is_active = TRUE;
  
  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default slash commands
INSERT INTO slash_commands (command, label, description, category, icon, action_type, action_data, keywords) VALUES
  ('/text', 'Text', 'Add a text block', 'basic', '📝', 'insert_block', '{"type": "text"}'::jsonb, '{"paragraph", "p"}'),
  ('/h1', 'Heading 1', 'Add a large heading', 'basic', '📰', 'insert_block', '{"type": "heading", "properties": {"level": 1}}'::jsonb, '{"title", "header"}'),
  ('/h2', 'Heading 2', 'Add a medium heading', 'basic', '📰', 'insert_block', '{"type": "heading", "properties": {"level": 2}}'::jsonb, '{"subtitle", "header"}'),
  ('/h3', 'Heading 3', 'Add a small heading', 'basic', '📰', 'insert_block', '{"type": "heading", "properties": {"level": 3}}'::jsonb, '{"subheading", "header"}'),
  ('/bullet', 'Bullet List', 'Add a bullet list', 'basic', '• ', 'insert_block', '{"type": "bullet_list"}'::jsonb, '{"list", "ul"}'),
  ('/number', 'Numbered List', 'Add a numbered list', 'basic', '1.', 'insert_block', '{"type": "numbered_list"}'::jsonb, '{"list", "ol"}'),
  ('/check', 'Checkbox', 'Add a checkbox', 'basic', '☑️', 'insert_block', '{"type": "checkbox"}'::jsonb, '{"todo", "task"}'),
  ('/code', 'Code Block', 'Add a code block', 'advanced', '💻', 'insert_block', '{"type": "code"}'::jsonb, '{"programming", "snippet"}'),
  ('/quote', 'Quote', 'Add a quote block', 'basic', '💬', 'insert_block', '{"type": "quote"}'::jsonb, '{"blockquote", "citation"}'),
  ('/divider', 'Divider', 'Add a horizontal divider', 'basic', '—', 'insert_block', '{"type": "divider"}'::jsonb, '{"line", "separator", "hr"}'),
  ('/image', 'Image', 'Add an image', 'media', '🖼️', 'insert_block', '{"type": "image"}'::jsonb, '{"picture", "photo", "img"}'),
  ('/video', 'Video', 'Add a video', 'media', '🎬', 'insert_block', '{"type": "video"}'::jsonb, '{"movie", "film"}'),
  ('/file', 'File', 'Add a file attachment', 'media', '📎', 'insert_block', '{"type": "file"}'::jsonb, '{"attachment", "document"}'),
  ('/table', 'Table', 'Add a table', 'data', '📊', 'insert_block', '{"type": "table", "properties": {"rows": 3, "cols": 3}}'::jsonb, '{"grid", "spreadsheet"}'),
  ('/kanban', 'Kanban Board', 'Add a kanban board', 'data', '📋', 'insert_block', '{"type": "kanban"}'::jsonb, '{"board", "cards"}'),
  ('/calendar', 'Calendar', 'Add a calendar view', 'data', '📅', 'insert_block', '{"type": "calendar"}'::jsonb, '{"date", "schedule"}'),
  ('/toggle', 'Toggle', 'Add a toggle block', 'advanced', '▶', 'insert_block', '{"type": "toggle"}'::jsonb, '{"collapse", "expand", "accordion"}'),
  ('/callout', 'Callout', 'Add a callout block', 'advanced', '💡', 'insert_block', '{"type": "callout"}'::jsonb, '{"info", "warning", "tip"}'),
  ('/embed', 'Embed', 'Embed external content', 'media', '🔗', 'insert_block', '{"type": "embed"}'::jsonb, '{"iframe", "external"}'),
  ('/ai', 'AI Assistant', 'Ask AI to write', 'ai', '🤖', 'ai_action', '{"action": "generate"}'::jsonb, '{"generate", "write", "create"}'),
  ('/summarize', 'Summarize', 'Summarize selected text', 'ai', '📝', 'ai_action', '{"action": "summarize"}'::jsonb, '{"tldr", "brief"}'),
  ('/translate', 'Translate', 'Translate selected text', 'ai', '🌐', 'ai_action', '{"action": "translate"}'::jsonb, '{"language", "convert"}'),
  ('/date', 'Date', 'Insert current date', 'utility', '📅', 'formatting', '{"type": "date"}'::jsonb, '{"today", "now"}'),
  ('/mention', 'Mention', 'Mention a user', 'utility', '@', 'formatting', '{"type": "mention"}'::jsonb, '{"user", "person"}')
ON CONFLICT (command) DO NOTHING;

-- Insert default page templates
INSERT INTO page_templates (project_id, name, slug, description, category, blocks_structure, is_public, is_featured) VALUES
  (NULL, 'Blank Page', 'blank', 'Start with an empty canvas', 'basic', '[]'::jsonb, TRUE, TRUE),
  (NULL, 'Meeting Notes', 'meeting-notes', 'Template for meeting notes', 'business', 
   '[{"type": "heading", "content": {"text": "Meeting Notes"}, "properties": {"level": 1}}, {"type": "heading", "content": {"text": "Date & Attendees"}, "properties": {"level": 2}}, {"type": "text", "content": {"text": "Date: "}}, {"type": "text", "content": {"text": "Attendees: "}}, {"type": "heading", "content": {"text": "Agenda"}, "properties": {"level": 2}}, {"type": "bullet_list", "content": {"items": []}}, {"type": "heading", "content": {"text": "Discussion"}, "properties": {"level": 2}}, {"type": "text", "content": {"text": ""}}, {"type": "heading", "content": {"text": "Action Items"}, "properties": {"level": 2}}, {"type": "checkbox", "content": {"items": []}}]'::jsonb,
   TRUE, TRUE),
  (NULL, 'Project Brief', 'project-brief', 'Template for project briefs', 'business',
   '[{"type": "heading", "content": {"text": "Project Brief"}, "properties": {"level": 1}}, {"type": "callout", "content": {"text": "Project Status: In Planning", "icon": "📋"}}, {"type": "heading", "content": {"text": "Overview"}, "properties": {"level": 2}}, {"type": "text", "content": {"text": ""}}, {"type": "heading", "content": {"text": "Goals & Objectives"}, "properties": {"level": 2}}, {"type": "bullet_list", "content": {"items": []}}, {"type": "heading", "content": {"text": "Timeline"}, "properties": {"level": 2}}, {"type": "table", "properties": {"rows": 3, "cols": 3}}, {"type": "heading", "content": {"text": "Resources"}, "properties": {"level": 2}}, {"type": "text", "content": {"text": ""}}]'::jsonb,
   TRUE, TRUE),
  (NULL, 'Blog Post', 'blog-post', 'Template for blog posts', 'content',
   '[{"type": "heading", "content": {"text": "Blog Post Title"}, "properties": {"level": 1}}, {"type": "text", "content": {"text": "By Author Name | Date"}}, {"type": "image", "content": {"url": "", "caption": "Featured Image"}}, {"type": "text", "content": {"text": "Introduction paragraph..."}}, {"type": "heading", "content": {"text": "Section 1"}, "properties": {"level": 2}}, {"type": "text", "content": {"text": ""}}, {"type": "heading", "content": {"text": "Section 2"}, "properties": {"level": 2}}, {"type": "text", "content": {"text": ""}}, {"type": "heading", "content": {"text": "Conclusion"}, "properties": {"level": 2}}, {"type": "text", "content": {"text": ""}}]'::jsonb,
   TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- Triggers

-- Auto-update updated_at for page_templates
CREATE TRIGGER update_page_templates_updated_at
  BEFORE UPDATE ON page_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-increment use_count for templates
CREATE OR REPLACE FUNCTION increment_template_use_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.template_id IS NOT NULL THEN
    UPDATE page_templates 
    SET use_count = use_count + 1 
    WHERE id = NEW.template_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Clean up old editing sessions periodically
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS void AS $$
BEGIN
  UPDATE editing_sessions
  SET is_active = FALSE, ended_at = NOW()
  WHERE last_activity < NOW() - INTERVAL '1 hour'
    AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql;