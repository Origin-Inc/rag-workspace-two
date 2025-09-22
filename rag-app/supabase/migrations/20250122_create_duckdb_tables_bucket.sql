-- Create duckdb-tables bucket for storing serialized DuckDB tables
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'duckdb-tables',
  'duckdb-tables', 
  false, -- Private bucket
  104857600, -- 100MB limit
  ARRAY['application/json', 'application/octet-stream']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for duckdb-tables bucket
-- Policy: Users can upload their workspace's table exports
CREATE POLICY "Users can upload workspace table exports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'duckdb-tables' 
  AND (storage.foldername(name))[1] = 'tables'
  AND EXISTS (
    SELECT 1 FROM public.user_workspaces uw
    WHERE uw.user_id = auth.uid()::text
    AND uw.workspace_id = (storage.foldername(name))[2]
  )
);

-- Policy: Users can view their workspace's table exports
CREATE POLICY "Users can view workspace table exports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'duckdb-tables'
  AND EXISTS (
    SELECT 1 FROM public.user_workspaces uw
    WHERE uw.user_id = auth.uid()::text
    AND uw.workspace_id = (storage.foldername(name))[2]
  )
);

-- Policy: Users can update their workspace's table exports
CREATE POLICY "Users can update workspace table exports"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'duckdb-tables'
  AND EXISTS (
    SELECT 1 FROM public.user_workspaces uw
    WHERE uw.user_id = auth.uid()::text
    AND uw.workspace_id = (storage.foldername(name))[2]
  )
);

-- Policy: Users can delete their workspace's table exports
CREATE POLICY "Users can delete workspace table exports"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'duckdb-tables'
  AND EXISTS (
    SELECT 1 FROM public.user_workspaces uw
    WHERE uw.user_id = auth.uid()::text
    AND uw.workspace_id = (storage.foldername(name))[2]
  )
);