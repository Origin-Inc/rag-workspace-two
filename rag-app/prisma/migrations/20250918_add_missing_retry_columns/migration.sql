-- Add missing columns to file_processing_jobs table
ALTER TABLE "file_processing_jobs" 
ADD COLUMN IF NOT EXISTS "retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "progress_percent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "error_details" JSONB;

-- Drop the old attempts column if it exists (replaced by retry_count)
ALTER TABLE "file_processing_jobs" 
DROP COLUMN IF EXISTS "attempts";