-- CreateTable for API usage tracking
CREATE TABLE IF NOT EXISTS "api_usage" (
    "id" SERIAL PRIMARY KEY,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "total_cost" DECIMAL(10,6) NOT NULL,
    "cached" BOOLEAN DEFAULT false,
    "user_id" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex for performance
CREATE INDEX IF NOT EXISTS "idx_api_usage_created_at" ON "api_usage"("created_at");
CREATE INDEX IF NOT EXISTS "idx_api_usage_user_id" ON "api_usage"("user_id");
CREATE INDEX IF NOT EXISTS "idx_api_usage_model" ON "api_usage"("model");

-- Add foreign key constraint to User table if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'User'
    ) THEN
        ALTER TABLE "api_usage" 
        ADD CONSTRAINT "api_usage_user_id_fkey" 
        FOREIGN KEY ("user_id") 
        REFERENCES "User"("id") 
        ON DELETE SET NULL 
        ON UPDATE CASCADE;
    END IF;
END $$;