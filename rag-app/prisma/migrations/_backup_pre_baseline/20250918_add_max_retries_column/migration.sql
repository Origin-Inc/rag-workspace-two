-- Add missing max_retries column to file_processing_jobs table
ALTER TABLE "file_processing_jobs" 
ADD COLUMN IF NOT EXISTS "max_retries" INTEGER NOT NULL DEFAULT 3;