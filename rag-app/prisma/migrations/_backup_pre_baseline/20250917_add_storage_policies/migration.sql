-- Storage policies for user-uploads bucket
-- Allow authenticated users to upload files to their own folder
CREATE POLICY "Users can upload their own files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-uploads' AND 
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Allow users to update their own files
CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'user-uploads' AND 
  auth.uid()::text = (string_to_array(name, '/'))[1]
)
WITH CHECK (
  bucket_id = 'user-uploads' AND 
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Allow users to read their own files
CREATE POLICY "Users can read their own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'user-uploads' AND 
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user-uploads' AND 
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Allow authenticated users to read workspace shared files
CREATE POLICY "Users can read workspace files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'user-uploads' AND 
  (string_to_array(name, '/'))[1] = 'workspace'
);

-- Allow service role to do everything (for server-side operations)
CREATE POLICY "Service role can do everything"
ON storage.objects
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');