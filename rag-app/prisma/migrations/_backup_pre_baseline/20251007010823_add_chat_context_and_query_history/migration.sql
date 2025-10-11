-- CreateTable
CREATE TABLE "chat_contexts" (
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
CREATE TABLE "query_history" (
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
CREATE UNIQUE INDEX "chat_contexts_page_id_key" ON "chat_contexts"("page_id");

-- CreateIndex
CREATE INDEX "chat_contexts_page_id_idx" ON "chat_contexts"("page_id");

-- CreateIndex
CREATE INDEX "chat_contexts_workspace_id_idx" ON "chat_contexts"("workspace_id");

-- CreateIndex
CREATE INDEX "query_history_page_id_idx" ON "query_history"("page_id");

-- CreateIndex
CREATE INDEX "query_history_created_at_idx" ON "query_history"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "chat_contexts" ADD CONSTRAINT "chat_contexts_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_contexts" ADD CONSTRAINT "chat_contexts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_contexts" ADD CONSTRAINT "chat_contexts_active_file_id_fkey" FOREIGN KEY ("active_file_id") REFERENCES "data_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_history" ADD CONSTRAINT "query_history_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
