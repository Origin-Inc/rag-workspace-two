-- Create storage buckets for user files
-- This migration sets up Supabase Storage buckets for persistent file storage

-- Create bucket for user-uploaded data files (CSV, Excel, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-data-files',
  'user-data-files', 
  false, -- Private bucket with RLS
  52428800, -- 50MB limit
  ARRAY[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream' -- For Parquet files
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create bucket for serialized DuckDB tables (Parquet format)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'duckdb-tables',
  'duckdb-tables',
  false, -- Private bucket with RLS
  104857600 -- 100MB limit for Parquet files
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for user-data-files bucket
-- Allow users to upload files for their workspace
CREATE POLICY "Users can upload files to their workspace"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-data-files' 
  AND (storage.foldername(name))[1] IN (
    SELECT w.id::text 
    FROM public."Workspace" w
    JOIN public."UserWorkspace" uw ON uw."workspaceId" = w.id
    WHERE uw."userId" = auth.uid()::text
  )
);

-- Allow users to read files from their workspace
CREATE POLICY "Users can read files from their workspace"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'user-data-files'
  AND (storage.foldername(name))[1] IN (
    SELECT w.id::text 
    FROM public."Workspace" w
    JOIN public."UserWorkspace" uw ON uw."workspaceId" = w.id
    WHERE uw."userId" = auth.uid()::text
  )
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete their workspace files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user-data-files'
  AND (storage.foldername(name))[1] IN (
    SELECT w.id::text 
    FROM public."Workspace" w
    JOIN public."UserWorkspace" uw ON uw."workspaceId" = w.id
    WHERE uw."userId" = auth.uid()::text
  )
);

-- RLS Policies for duckdb-tables bucket
-- Allow users to upload DuckDB tables for their workspace
CREATE POLICY "Users can upload DuckDB tables to their workspace"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'duckdb-tables'
  AND (storage.foldername(name))[1] IN (
    SELECT w.id::text 
    FROM public."Workspace" w
    JOIN public."UserWorkspace" uw ON uw."workspaceId" = w.id
    WHERE uw."userId" = auth.uid()::text
  )
);

-- Allow users to read DuckDB tables from their workspace  
CREATE POLICY "Users can read DuckDB tables from their workspace"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'duckdb-tables'
  AND (storage.foldername(name))[1] IN (
    SELECT w.id::text 
    FROM public."Workspace" w
    JOIN public."UserWorkspace" uw ON uw."workspaceId" = w.id
    WHERE uw."userId" = auth.uid()::text
  )
);

-- Allow users to delete DuckDB tables
CREATE POLICY "Users can delete DuckDB tables from their workspace"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'duckdb-tables'
  AND (storage.foldername(name))[1] IN (
    SELECT w.id::text 
    FROM public."Workspace" w
    JOIN public."UserWorkspace" uw ON uw."workspaceId" = w.id
    WHERE uw."userId" = auth.uid()::text
  )
);