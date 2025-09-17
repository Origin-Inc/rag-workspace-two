-- Add missing columns to user_files table
ALTER TABLE "user_files" 
ADD COLUMN IF NOT EXISTS "last_accessed_at" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ(6);