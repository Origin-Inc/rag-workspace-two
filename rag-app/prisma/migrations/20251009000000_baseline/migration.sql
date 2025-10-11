warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verification_token" VARCHAR(255),
    "reset_password_token" VARCHAR(255),
    "reset_password_expires" TIMESTAMPTZ(6),
    "two_factor_secret" VARCHAR(255),
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "lockout_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "settings" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resource" VARCHAR(100) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(100),
    "color" VARCHAR(7),
    "settings" JSONB,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID,
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "slug" VARCHAR(500) NOT NULL,
    "content" JSONB,
    "blocks" JSONB,
    "icon" VARCHAR(100),
    "cover_image" TEXT,
    "metadata" JSONB,
    "parent_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "embedding_status" VARCHAR(20) DEFAULT 'pending',
    "embedding_progress" INTEGER DEFAULT 0,
    "embedding_error" TEXT,
    "last_embedded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "family" VARCHAR(255) NOT NULL,
    "browser_info" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replaced_by" VARCHAR(500),
    "replaced_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(255),
    "details" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "accepted_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "content" TEXT,
    "file_path" VARCHAR(500),
    "file_type" VARCHAR(50),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "embedding" vector(1536),
    "embedding_halfvec" halfvec(1536),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."page_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "embedding" vector(1536),
    "embedding_halfvec" halfvec(1536),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."block_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "embedding" vector(1536),
    "embedding_halfvec" halfvec(1536),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "block_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."database_row_embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "row_id" UUID NOT NULL,
    "page_id" UUID,
    "workspace_id" UUID NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "embedding" vector(1536),
    "embedding_halfvec" halfvec(1536),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "database_row_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."queries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "query_text" TEXT NOT NULL,
    "response_text" TEXT,
    "context_used" JSONB,
    "model_used" VARCHAR(100),
    "tokens_used" INTEGER,
    "response_time_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."indexing_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "operation" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "worker_id" VARCHAR(100),

    CONSTRAINT "indexing_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."integration_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expiry" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."webhooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integration_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_triggered" TIMESTAMPTZ(6),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."database_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "view_type" VARCHAR(50) NOT NULL DEFAULT 'table',
    "settings" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "database_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."database_columns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "database_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 200,
    "position" INTEGER NOT NULL,
    "config" JSONB,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "database_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."database_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "database_id" UUID NOT NULL,
    "cells" JSONB NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "database_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_id" UUID NOT NULL,
    "query" TEXT NOT NULL,
    "parsed_query" JSONB NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "executed_at" TIMESTAMPTZ(6) NOT NULL,
    "execution_time" INTEGER,
    "rows_returned" INTEGER,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."data_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "table_name" VARCHAR(100) NOT NULL,
    "schema" JSONB NOT NULL,
    "row_count" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_url" TEXT,
    "parquet_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "page_id" UUID,
    "filename" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "storage_url" TEXT,
    "upload_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "uploaded_at" TIMESTAMPTZ(6),
    "processing_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "processing_error" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "data_table_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "checksum" VARCHAR(64),
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "share_scope" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_accessed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_data_tables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "table_name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "schema" JSONB NOT NULL,
    "row_count" INTEGER NOT NULL,
    "sample_data" JSONB,
    "storage_type" VARCHAR(20) NOT NULL,
    "table_path" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "statistics" JSONB,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_queried_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_data_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."file_processing_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "job_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "total_rows" INTEGER,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "error_message" TEXT,
    "error_details" JSONB,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "worker_id" VARCHAR(100),

    CONSTRAINT "file_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_contexts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "active_file_id" UUID,
    "current_topic" TEXT,
    "entities" JSONB NOT NULL DEFAULT '{}',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."query_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID NOT NULL,
    "query" TEXT NOT NULL,
    "intent" VARCHAR(50) NOT NULL,
    "sql" TEXT,
    "results" JSONB,
    "response" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_verification_token_key" ON "public"."users"("email_verification_token");

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_password_token_key" ON "public"."users"("reset_password_token");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "users_email_verification_token_idx" ON "public"."users"("email_verification_token");

-- CreateIndex
CREATE INDEX "users_reset_password_token_idx" ON "public"."users"("reset_password_token");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "public"."workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspaces_slug_idx" ON "public"."workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "public"."roles"("name");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "public"."permissions"("resource");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "public"."permissions"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "public"."role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "user_workspaces_user_id_idx" ON "public"."user_workspaces"("user_id");

-- CreateIndex
CREATE INDEX "user_workspaces_workspace_id_idx" ON "public"."user_workspaces"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_workspaces_user_id_workspace_id_key" ON "public"."user_workspaces"("user_id", "workspace_id");

-- CreateIndex
CREATE INDEX "projects_workspace_id_idx" ON "public"."projects"("workspace_id");

-- CreateIndex
CREATE INDEX "projects_is_archived_idx" ON "public"."projects"("is_archived");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_id_slug_key" ON "public"."projects"("workspace_id", "slug");

-- CreateIndex
CREATE INDEX "pages_project_id_idx" ON "public"."pages"("project_id");

-- CreateIndex
CREATE INDEX "pages_parent_id_idx" ON "public"."pages"("parent_id");

-- CreateIndex
CREATE INDEX "pages_position_idx" ON "public"."pages"("position");

-- CreateIndex
CREATE INDEX "pages_workspace_id_idx" ON "public"."pages"("workspace_id");

-- CreateIndex
CREATE INDEX "pages_workspace_id_parent_id_idx" ON "public"."pages"("workspace_id", "parent_id");

-- CreateIndex
CREATE INDEX "pages_embedding_status_idx" ON "public"."pages"("embedding_status");

-- CreateIndex
CREATE UNIQUE INDEX "pages_workspace_id_slug_key" ON "public"."pages"("workspace_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "pages_project_id_slug_key" ON "public"."pages"("project_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "public"."sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "public"."sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "public"."sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "public"."sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "public"."refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "public"."refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "public"."refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_idx" ON "public"."refresh_tokens"("family");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "public"."audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "public"."audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "public"."audit_logs"("resource");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "public"."audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "public"."invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "public"."invitations"("email");

-- CreateIndex
CREATE INDEX "invitations_workspace_id_idx" ON "public"."invitations"("workspace_id");

-- CreateIndex
CREATE INDEX "invitations_token_idx" ON "public"."invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_status_idx" ON "public"."invitations"("status");

-- CreateIndex
CREATE INDEX "invitations_expires_at_idx" ON "public"."invitations"("expires_at");

-- CreateIndex
CREATE INDEX "documents_user_id_idx" ON "public"."documents"("user_id");

-- CreateIndex
CREATE INDEX "embeddings_document_id_idx" ON "public"."embeddings"("document_id");

-- CreateIndex
CREATE INDEX "page_embeddings_page_id_idx" ON "public"."page_embeddings"("page_id");

-- CreateIndex
CREATE INDEX "page_embeddings_workspace_id_idx" ON "public"."page_embeddings"("workspace_id");

-- CreateIndex
CREATE INDEX "page_embeddings_page_id_chunk_index_idx" ON "public"."page_embeddings"("page_id", "chunk_index");

-- CreateIndex
CREATE INDEX "block_embeddings_page_id_idx" ON "public"."block_embeddings"("page_id");

-- CreateIndex
CREATE INDEX "block_embeddings_block_id_idx" ON "public"."block_embeddings"("block_id");

-- CreateIndex
CREATE INDEX "block_embeddings_workspace_id_idx" ON "public"."block_embeddings"("workspace_id");

-- CreateIndex
CREATE INDEX "database_row_embeddings_row_id_idx" ON "public"."database_row_embeddings"("row_id");

-- CreateIndex
CREATE INDEX "database_row_embeddings_workspace_id_idx" ON "public"."database_row_embeddings"("workspace_id");

-- CreateIndex
CREATE INDEX "queries_user_id_idx" ON "public"."queries"("user_id");

-- CreateIndex
CREATE INDEX "idx_indexing_queue_status" ON "public"."indexing_queue"("status");

-- CreateIndex
CREATE INDEX "idx_indexing_queue_priority" ON "public"."indexing_queue"("priority", "created_at");

-- CreateIndex
CREATE INDEX "idx_indexing_queue_entity" ON "public"."indexing_queue"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "indexing_queue_workspace_id_idx" ON "public"."indexing_queue"("workspace_id");

-- CreateIndex
CREATE INDEX "indexing_queue_created_at_idx" ON "public"."indexing_queue"("created_at");

-- CreateIndex
CREATE INDEX "integration_credentials_workspace_id_idx" ON "public"."integration_credentials"("workspace_id");

-- CreateIndex
CREATE INDEX "integration_credentials_provider_idx" ON "public"."integration_credentials"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_workspace_id_provider_key" ON "public"."integration_credentials"("workspace_id", "provider");

-- CreateIndex
CREATE INDEX "webhooks_integration_id_idx" ON "public"."webhooks"("integration_id");

-- CreateIndex
CREATE INDEX "webhooks_is_active_idx" ON "public"."webhooks"("is_active");

-- CreateIndex
CREATE INDEX "database_blocks_page_id_idx" ON "public"."database_blocks"("page_id");

-- CreateIndex
CREATE INDEX "database_columns_database_id_idx" ON "public"."database_columns"("database_id");

-- CreateIndex
CREATE INDEX "database_columns_position_idx" ON "public"."database_columns"("position");

-- CreateIndex
CREATE INDEX "database_rows_database_id_idx" ON "public"."database_rows"("database_id");

-- CreateIndex
CREATE INDEX "database_rows_position_idx" ON "public"."database_rows"("position");

-- CreateIndex
CREATE INDEX "query_audit_logs_block_id_idx" ON "public"."query_audit_logs"("block_id");

-- CreateIndex
CREATE INDEX "query_audit_logs_executed_at_idx" ON "public"."query_audit_logs"("executed_at");

-- CreateIndex
CREATE INDEX "query_audit_logs_success_idx" ON "public"."query_audit_logs"("success");

-- CreateIndex
CREATE INDEX "chat_messages_page_id_idx" ON "public"."chat_messages"("page_id");

-- CreateIndex
CREATE INDEX "chat_messages_workspace_id_idx" ON "public"."chat_messages"("workspace_id");

-- CreateIndex
CREATE INDEX "chat_messages_created_at_idx" ON "public"."chat_messages"("created_at");

-- CreateIndex
CREATE INDEX "data_files_page_id_idx" ON "public"."data_files"("page_id");

-- CreateIndex
CREATE INDEX "data_files_workspace_id_idx" ON "public"."data_files"("workspace_id");

-- CreateIndex
CREATE INDEX "data_files_table_name_idx" ON "public"."data_files"("table_name");

-- CreateIndex
CREATE INDEX "user_files_user_id_idx" ON "public"."user_files"("user_id");

-- CreateIndex
CREATE INDEX "user_files_workspace_id_idx" ON "public"."user_files"("workspace_id");

-- CreateIndex
CREATE INDEX "user_files_page_id_idx" ON "public"."user_files"("page_id");

-- CreateIndex
CREATE INDEX "user_files_processing_status_idx" ON "public"."user_files"("processing_status");

-- CreateIndex
CREATE INDEX "user_files_created_at_idx" ON "public"."user_files"("created_at");

-- CreateIndex
CREATE INDEX "user_files_checksum_idx" ON "public"."user_files"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "user_files_workspace_id_storage_path_key" ON "public"."user_files"("workspace_id", "storage_path");

-- CreateIndex
CREATE INDEX "user_data_tables_workspace_id_idx" ON "public"."user_data_tables"("workspace_id");

-- CreateIndex
CREATE INDEX "user_data_tables_table_name_idx" ON "public"."user_data_tables"("table_name");

-- CreateIndex
CREATE INDEX "user_data_tables_created_at_idx" ON "public"."user_data_tables"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_data_tables_workspace_id_table_name_key" ON "public"."user_data_tables"("workspace_id", "table_name");

-- CreateIndex
CREATE INDEX "file_processing_jobs_status_priority_idx" ON "public"."file_processing_jobs"("status", "priority");

-- CreateIndex
CREATE INDEX "file_processing_jobs_file_id_idx" ON "public"."file_processing_jobs"("file_id");

-- CreateIndex
CREATE INDEX "file_processing_jobs_workspace_id_idx" ON "public"."file_processing_jobs"("workspace_id");

-- CreateIndex
CREATE INDEX "file_processing_jobs_created_at_idx" ON "public"."file_processing_jobs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_contexts_page_id_key" ON "public"."chat_contexts"("page_id");

-- CreateIndex
CREATE INDEX "chat_contexts_page_id_idx" ON "public"."chat_contexts"("page_id");

-- CreateIndex
CREATE INDEX "chat_contexts_workspace_id_idx" ON "public"."chat_contexts"("workspace_id");

-- CreateIndex
CREATE INDEX "query_history_page_id_idx" ON "public"."query_history"("page_id");

-- CreateIndex
CREATE INDEX "query_history_created_at_idx" ON "public"."query_history"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_workspaces" ADD CONSTRAINT "user_workspaces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_workspaces" ADD CONSTRAINT "user_workspaces_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_workspaces" ADD CONSTRAINT "user_workspaces_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pages" ADD CONSTRAINT "pages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pages" ADD CONSTRAINT "pages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pages" ADD CONSTRAINT "pages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invitations" ADD CONSTRAINT "invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invitations" ADD CONSTRAINT "invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."embeddings" ADD CONSTRAINT "embeddings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."page_embeddings" ADD CONSTRAINT "page_embeddings_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."page_embeddings" ADD CONSTRAINT "page_embeddings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."block_embeddings" ADD CONSTRAINT "block_embeddings_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."block_embeddings" ADD CONSTRAINT "block_embeddings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."database_row_embeddings" ADD CONSTRAINT "database_row_embeddings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."queries" ADD CONSTRAINT "queries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."indexing_queue" ADD CONSTRAINT "indexing_queue_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."integration_credentials" ADD CONSTRAINT "integration_credentials_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."webhooks" ADD CONSTRAINT "webhooks_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integration_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."database_columns" ADD CONSTRAINT "database_columns_database_id_fkey" FOREIGN KEY ("database_id") REFERENCES "public"."database_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."database_rows" ADD CONSTRAINT "database_rows_database_id_fkey" FOREIGN KEY ("database_id") REFERENCES "public"."database_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_audit_logs" ADD CONSTRAINT "query_audit_logs_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."database_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_files" ADD CONSTRAINT "data_files_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_files" ADD CONSTRAINT "data_files_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_files" ADD CONSTRAINT "user_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_files" ADD CONSTRAINT "user_files_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_files" ADD CONSTRAINT "user_files_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_files" ADD CONSTRAINT "user_files_data_table_id_fkey" FOREIGN KEY ("data_table_id") REFERENCES "public"."user_data_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_data_tables" ADD CONSTRAINT "user_data_tables_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."file_processing_jobs" ADD CONSTRAINT "file_processing_jobs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."user_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."file_processing_jobs" ADD CONSTRAINT "file_processing_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_contexts" ADD CONSTRAINT "chat_contexts_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_contexts" ADD CONSTRAINT "chat_contexts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_contexts" ADD CONSTRAINT "chat_contexts_active_file_id_fkey" FOREIGN KEY ("active_file_id") REFERENCES "public"."data_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."query_history" ADD CONSTRAINT "query_history_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =============================================
-- CUSTOM FUNCTIONS
-- =============================================

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- Function: search_embeddings
CREATE OR REPLACE FUNCTION public.search_embeddings(query_embedding vector, workspace_uuid uuid, page_uuid uuid DEFAULT NULL::uuid, result_limit integer DEFAULT 10, similarity_threshold double precision DEFAULT 0.5)
RETURNS TABLE(id text, content text, metadata jsonb, similarity double precision, source_type text, source_id uuid)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    ue.id::text AS id,
    ue.chunk_text AS content,
    ue.metadata,
    CASE 
      WHEN ue.embedding IS NULL THEN 0.5
      ELSE 1 - (ue.embedding <=> query_embedding)
    END AS similarity,
    ue.source_type,
    ue.page_id AS source_id
  FROM unified_embeddings ue
  WHERE ue.workspace_id = workspace_uuid
    AND (page_uuid IS NULL OR ue.page_id = page_uuid)
  ORDER BY 
    CASE 
      WHEN ue.embedding IS NULL THEN 1
      ELSE 0 
    END,
    CASE 
      WHEN ue.embedding IS NOT NULL THEN ue.embedding <=> query_embedding
      ELSE 999
    END
  LIMIT result_limit;
END;
$function$;

-- =============================================
-- VIEWS
-- =============================================

-- View: unified_embeddings
CREATE OR REPLACE VIEW public.unified_embeddings AS
SELECT 'page'::text AS source_type,
    (pe.id)::text AS entity_id,
    pe.page_id,
    pe.workspace_id,
    pe.chunk_text,
    pe.chunk_index,
    pe.embedding,
    pe.metadata,
    pe.created_at,
    pe.updated_at,
    'page'::text AS entity_type,
    (pe.id)::text AS id
FROM page_embeddings pe
WHERE (pe.embedding IS NOT NULL)
UNION ALL
SELECT 'block'::text AS source_type,
    (be.id)::text AS entity_id,
    be.page_id,
    be.workspace_id,
    be.chunk_text,
    be.chunk_index,
    be.embedding,
    be.metadata,
    be.created_at,
    be.updated_at,
    'block'::text AS entity_type,
    (be.id)::text AS id
FROM block_embeddings be
WHERE (be.embedding IS NOT NULL)
UNION ALL
SELECT 'database_row'::text AS source_type,
    (dre.id)::text AS entity_id,
    dre.page_id,
    dre.workspace_id,
    dre.chunk_text,
    NULL::integer AS chunk_index,
    dre.embedding,
    dre.metadata,
    dre.created_at,
    dre.updated_at,
    'database_row'::text AS entity_type,
    (dre.id)::text AS id
FROM database_row_embeddings dre
WHERE (dre.embedding IS NOT NULL);

-- =============================================
-- TRIGGERS
-- =============================================

CREATE TRIGGER update_block_embeddings_updated_at BEFORE UPDATE ON public.block_embeddings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_data_files_updated_at BEFORE UPDATE ON public.data_files FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_database_blocks_updated_at BEFORE UPDATE ON public.database_blocks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_database_columns_updated_at BEFORE UPDATE ON public.database_columns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_database_row_embeddings_updated_at BEFORE UPDATE ON public.database_row_embeddings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_database_rows_updated_at BEFORE UPDATE ON public.database_rows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_indexing_queue_updated_at BEFORE UPDATE ON public.indexing_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_integration_credentials_updated_at BEFORE UPDATE ON public.integration_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_page_embeddings_updated_at BEFORE UPDATE ON public.page_embeddings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON public.webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

