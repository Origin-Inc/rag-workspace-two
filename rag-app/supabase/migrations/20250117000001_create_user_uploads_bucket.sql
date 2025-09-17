-- Create storage bucket for user file uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-uploads',
  'user-uploads', 
  false, -- Private bucket
  5368709120, -- 5GB in bytes
  ARRAY[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/plain',
    'application/json'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Enable RLS for the bucket
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can upload files to their own folder
CREATE POLICY "Users can upload their own files" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
  bucket_id = 'user-uploads' 
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Policy: Users can view/download their own files
CREATE POLICY "Users can view their own files" 
ON storage.objects FOR SELECT 
TO authenticated 
USING (
  bucket_id = 'user-uploads' 
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Policy: Users can update their own files
CREATE POLICY "Users can update their own files" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (
  bucket_id = 'user-uploads' 
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete their own files" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (
  bucket_id = 'user-uploads' 
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Create workspace-shared folder policy (files in workspace/{workspaceId}/ can be accessed by workspace members)
CREATE POLICY "Workspace members can access shared files" 
ON storage.objects FOR ALL 
TO authenticated 
USING (
  bucket_id = 'user-uploads' 
  AND (
    -- Check if path starts with 'workspace/'
    (storage.foldername(name))[1] = 'workspace'
    AND EXISTS (
      SELECT 1 FROM "UserWorkspace" uw
      WHERE uw."userId" = auth.uid()
      AND uw."workspaceId" = (storage.foldername(name))[2]::uuid
      AND uw.status = 'active'
    )
  )
)
WITH CHECK (
  bucket_id = 'user-uploads' 
  AND (
    -- Check if path starts with 'workspace/'
    (storage.foldername(name))[1] = 'workspace'
    AND EXISTS (
      SELECT 1 FROM "UserWorkspace" uw
      WHERE uw."userId" = auth.uid()
      AND uw."workspaceId" = (storage.foldername(name))[2]::uuid
      AND uw.status = 'active'
      AND uw.role IN ('owner', 'admin', 'member') -- Only certain roles can upload
    )
  )
);