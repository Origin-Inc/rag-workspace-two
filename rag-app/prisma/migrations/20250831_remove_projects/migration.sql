-- Migration to remove Projects and make Pages belong directly to Workspaces

-- First, ensure all pages have a workspaceId (copy from their project's workspaceId)
UPDATE pages p
SET workspace_id = pr.workspace_id
FROM projects pr
WHERE p.project_id = pr.id
AND p.workspace_id IS NULL;

-- Make workspace_id NOT NULL (after ensuring all pages have it)
ALTER TABLE pages ALTER COLUMN workspace_id SET NOT NULL;

-- Drop the foreign key constraint from pages to projects
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_project_id_fkey;

-- Drop the unique constraint on projectId and slug
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_project_id_slug_key;

-- Create new unique constraint on workspaceId and slug (if it doesn't exist)
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_workspace_id_slug_key;
ALTER TABLE pages ADD CONSTRAINT pages_workspace_id_slug_key UNIQUE (workspace_id, slug);

-- Make projectId nullable (as a transition step)
ALTER TABLE pages ALTER COLUMN project_id DROP NOT NULL;

-- Later, after updating all code, we can drop the project_id column entirely:
-- ALTER TABLE pages DROP COLUMN project_id;

-- And drop the projects table:
-- DROP TABLE IF EXISTS projects;