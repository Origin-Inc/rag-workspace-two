-- Add GIN indexes for JSONB columns for fast containment queries
CREATE INDEX IF NOT EXISTS "idx_pages_metadata_gin" ON "pages" USING GIN ("metadata");
CREATE INDEX IF NOT EXISTS "idx_workspaces_settings_gin" ON "workspaces" USING GIN ("settings");
CREATE INDEX IF NOT EXISTS "idx_projects_settings_gin" ON "projects" USING GIN ("settings");
CREATE INDEX IF NOT EXISTS "idx_documents_metadata_gin" ON "documents" USING GIN ("metadata");
CREATE INDEX IF NOT EXISTS "idx_embeddings_metadata_gin" ON "embeddings" USING GIN ("metadata");
CREATE INDEX IF NOT EXISTS "idx_queries_context_gin" ON "queries" USING GIN ("context_used");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_details_gin" ON "audit_logs" USING GIN ("details");
CREATE INDEX IF NOT EXISTS "idx_integration_credentials_metadata_gin" ON "integration_credentials" USING GIN ("metadata");
CREATE INDEX IF NOT EXISTS "idx_webhooks_metadata_gin" ON "webhooks" USING GIN ("metadata");

-- Add B-tree indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS "idx_pages_created_at" ON "pages" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_pages_updated_at" ON "pages" ("updated_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_pages_title" ON "pages" ("title");
CREATE INDEX IF NOT EXISTS "idx_pages_is_public" ON "pages" ("is_public");
CREATE INDEX IF NOT EXISTS "idx_pages_is_archived" ON "pages" ("is_archived");

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS "idx_pages_project_archived" ON "pages" ("project_id", "is_archived");
CREATE INDEX IF NOT EXISTS "idx_pages_project_position" ON "pages" ("project_id", "position");
CREATE INDEX IF NOT EXISTS "idx_pages_parent_position" ON "pages" ("parent_id", "position");

-- Text search indexes for content
CREATE INDEX IF NOT EXISTS "idx_pages_title_text" ON "pages" USING GIN (to_tsvector('english', "title"));
CREATE INDEX IF NOT EXISTS "idx_documents_title_text" ON "documents" USING GIN (to_tsvector('english', "title"));

-- Indexes for session management
CREATE INDEX IF NOT EXISTS "idx_sessions_expires_at" ON "sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_expires_at_partial" ON "refresh_tokens" ("expires_at") WHERE "revoked_at" IS NULL;

-- Indexes for workspace queries
CREATE INDEX IF NOT EXISTS "idx_user_workspaces_workspace_role" ON "user_workspaces" ("workspace_id", "role_id");

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_created" ON "audit_logs" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_logs_resource_created" ON "audit_logs" ("resource", "created_at" DESC);

-- Partial indexes for active/pending records
CREATE INDEX IF NOT EXISTS "idx_invitations_pending" ON "invitations" ("workspace_id", "status") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "idx_integration_credentials_active" ON "integration_credentials" ("workspace_id", "provider") WHERE "is_active" = true;
CREATE INDEX IF NOT EXISTS "idx_webhooks_active" ON "webhooks" ("integration_id") WHERE "is_active" = true;

-- Analyze tables to update statistics
ANALYZE "pages";
ANALYZE "workspaces";
ANALYZE "projects";
ANALYZE "documents";
ANALYZE "embeddings";
ANALYZE "queries";
ANALYZE "audit_logs";
ANALYZE "user_workspaces";
ANALYZE "sessions";
ANALYZE "refresh_tokens";