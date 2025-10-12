-- Make project_id optional for pages to support Notion-style hierarchy
ALTER TABLE "pages" ALTER COLUMN "project_id" DROP NOT NULL;

-- Make workspace_id required for pages
ALTER TABLE "pages" ALTER COLUMN "workspace_id" SET NOT NULL;

-- Add unique constraint for workspace-based slugs
ALTER TABLE "pages" ADD CONSTRAINT "pages_workspace_id_slug_key" UNIQUE ("workspace_id", "slug");

-- Add index for hierarchy queries
CREATE INDEX IF NOT EXISTS "pages_workspace_id_parent_id_idx" ON "pages"("workspace_id", "parent_id");

-- Add blocks column if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pages' AND column_name='blocks') THEN
    ALTER TABLE "pages" ADD COLUMN "blocks" JSONB;
  END IF;
END $$;