-- Drop the existing upload policy that requires auth.uid()
DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;

-- Create a new policy that allows uploads to the uploads/ directory
-- This is less restrictive but still requires the bucket to be 'user-uploads'
CREATE POLICY "Allow uploads to uploads directory"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-uploads' AND 
  starts_with(name, 'uploads/')
);

-- Also add a policy for authenticated users to upload to their workspace
CREATE POLICY "Authenticated users can upload to workspace"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-uploads' AND 
  starts_with(name, 'uploads/')
);

-- Add SELECT policy for uploaded files
CREATE POLICY "Users can read uploads directory"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'user-uploads' AND 
  starts_with(name, 'uploads/')
);