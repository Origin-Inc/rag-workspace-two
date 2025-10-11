-- Comprehensive fix for all schema mismatches between Prisma and Database

-- 1. Add missing worker_id column to file_processing_jobs
ALTER TABLE "file_processing_jobs" 
ADD COLUMN IF NOT EXISTS "worker_id" VARCHAR(100);

-- 2. Fix progress_percent data type (should be INTEGER not DECIMAL)
ALTER TABLE "file_processing_jobs" 
ALTER COLUMN "progress_percent" SET DATA TYPE INTEGER USING COALESCE(progress_percent::INTEGER, 0);

-- 3. Ensure processed_rows has proper default
ALTER TABLE "file_processing_jobs" 
ALTER COLUMN "processed_rows" SET DEFAULT 0;

-- 4. Drop columns that exist in DB but not in Prisma schema
ALTER TABLE "file_processing_jobs" 
DROP COLUMN IF EXISTS "max_attempts",
DROP COLUMN IF EXISTS "result_metadata",
DROP COLUMN IF EXISTS "updated_at";

-- 5. Ensure all required columns have proper defaults
ALTER TABLE "file_processing_jobs" 
ALTER COLUMN "processed_rows" SET NOT NULL,
ALTER COLUMN "progress_percent" SET DEFAULT 0;