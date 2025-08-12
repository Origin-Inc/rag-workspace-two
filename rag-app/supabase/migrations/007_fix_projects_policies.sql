-- Fix RLS policies for projects without roles table
DROP POLICY IF EXISTS "Users can create projects in their workspaces" ON projects;
DROP POLICY IF EXISTS "Users can update projects in their workspaces" ON projects;
DROP POLICY IF EXISTS "Users can delete projects in their workspaces" ON projects;

-- Simplified policies without role checking for now
CREATE POLICY "Users can create projects in their workspaces" ON projects
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update projects in their workspaces" ON projects
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete projects in their workspaces" ON projects
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

-- Fix the page migration query with proper type casting
UPDATE pages 
SET project_id = (
  SELECT p.id 
  FROM projects p 
  WHERE p.workspace_id::text = pages.workspace_id::text
  AND p.slug = 'default-project'
  LIMIT 1
)
WHERE project_id IS NULL AND workspace_id IS NOT NULL;