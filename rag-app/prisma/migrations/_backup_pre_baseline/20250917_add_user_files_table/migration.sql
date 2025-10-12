-- CreateTable
CREATE TABLE "user_files" (
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
    "checksum" VARCHAR(64),
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "share_scope" VARCHAR(20),
    "data_table_id" UUID,
    "metadata" JSONB DEFAULT '{}',
    "tags" VARCHAR(100)[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_processing_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "job_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "processed_rows" INTEGER,
    "total_rows" INTEGER,
    "progress_percent" DECIMAL(5,2),
    "result_metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_data_tables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "file_id" UUID,
    "table_name" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "schema_info" JSONB NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "column_count" INTEGER NOT NULL DEFAULT 0,
    "size_bytes" BIGINT,
    "storage_location" VARCHAR(50) NOT NULL DEFAULT 'duckdb',
    "is_temporary" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(6),
    "last_accessed_at" TIMESTAMPTZ(6),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_data_tables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_files_user_id_idx" ON "user_files"("user_id");
CREATE INDEX "user_files_workspace_id_idx" ON "user_files"("workspace_id");
CREATE INDEX "user_files_page_id_idx" ON "user_files"("page_id");
CREATE INDEX "user_files_processing_status_idx" ON "user_files"("processing_status");
CREATE INDEX "user_files_upload_status_idx" ON "user_files"("upload_status");
CREATE INDEX "user_files_data_table_id_idx" ON "user_files"("data_table_id");

-- CreateIndex
CREATE INDEX "file_processing_jobs_file_id_idx" ON "file_processing_jobs"("file_id");
CREATE INDEX "file_processing_jobs_workspace_id_idx" ON "file_processing_jobs"("workspace_id");
CREATE INDEX "file_processing_jobs_status_idx" ON "file_processing_jobs"("status");
CREATE INDEX "file_processing_jobs_priority_status_idx" ON "file_processing_jobs"("priority" DESC, "status");

-- CreateIndex
CREATE INDEX "user_data_tables_user_id_idx" ON "user_data_tables"("user_id");
CREATE INDEX "user_data_tables_workspace_id_idx" ON "user_data_tables"("workspace_id");
CREATE INDEX "user_data_tables_file_id_idx" ON "user_data_tables"("file_id");
CREATE UNIQUE INDEX "user_data_tables_table_name_key" ON "user_data_tables"("table_name");

-- AddForeignKey
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_data_table_id_fkey" FOREIGN KEY ("data_table_id") REFERENCES "user_data_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_processing_jobs" ADD CONSTRAINT "file_processing_jobs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "user_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "file_processing_jobs" ADD CONSTRAINT "file_processing_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_data_tables" ADD CONSTRAINT "user_data_tables_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_data_tables" ADD CONSTRAINT "user_data_tables_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_data_tables" ADD CONSTRAINT "user_data_tables_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "user_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;