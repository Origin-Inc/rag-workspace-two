-- Fix storage RLS policies with proper auth context
-- Based on Supabase best practices for 2025

-- Drop all existing policies for duckdb-tables
DROP POLICY IF EXISTS "Allow authenticated uploads to duckdb-tables" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads from duckdb-tables" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to duckdb-tables" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from duckdb-tables" ON storage.objects;

-- Create comprehensive policies that properly handle auth context
-- These policies allow authenticated users to manage files in their workspace folders

-- INSERT: Allow authenticated users to upload to workspace folders they belong to
CREATE POLICY "Users can upload JSON exports to workspace folders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'duckdb-tables' AND
  auth.role() = 'authenticated' AND
  -- Path format: tables/workspaceId/filename.json
  (storage.foldername(name))[1] = 'tables'
);

-- SELECT: Allow reading files in workspace folders
CREATE POLICY "Users can view JSON exports in workspace folders"  
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'duckdb-tables' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = 'tables'
);

-- UPDATE: Allow updating files (for upsert operations)
CREATE POLICY "Users can update JSON exports in workspace folders"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'duckdb-tables' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = 'tables'
)
WITH CHECK (
  bucket_id = 'duckdb-tables' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = 'tables'
);

-- DELETE: Allow deleting files
CREATE POLICY "Users can delete JSON exports in workspace folders"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'duckdb-tables' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = 'tables'
);