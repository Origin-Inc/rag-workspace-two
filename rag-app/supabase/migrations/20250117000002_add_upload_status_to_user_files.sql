-- Add upload status fields to UserFile table
ALTER TABLE "UserFile" 
ADD COLUMN IF NOT EXISTS upload_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ(6);

-- Create index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_user_files_upload_status 
ON "UserFile"(upload_status, workspace_id);

-- Create index for tracking pending uploads
CREATE INDEX IF NOT EXISTS idx_user_files_pending_uploads 
ON "UserFile"(user_id, upload_status) 
WHERE upload_status = 'pending';