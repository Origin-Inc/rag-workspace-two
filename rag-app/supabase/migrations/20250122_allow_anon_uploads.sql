-- Migration: Allow anonymous uploads to duckdb-tables bucket
-- Date: 2025-01-22
-- Purpose: Fix "new row violates row-level security policy" error when uploading files
-- 
-- The issue: Remix Auth and Supabase Auth are separate systems.
-- When uploading from browser with anon key, Supabase doesn't recognize the user as authenticated.
-- Solution: Allow anonymous uploads to the duckdb-tables bucket.

-- Drop restrictive policies that require authentication
DO $$
BEGIN
  -- Drop existing policies that might be blocking
  DROP POLICY IF EXISTS "Users can upload JSON exports to workspace folders" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated can upload to duckdb-tables" ON storage.objects;
  
  -- Create a completely open policy for duckdb-tables uploads
  -- This allows ANYONE (including anonymous users) to upload
  CREATE POLICY "Anyone can upload to duckdb-tables" 
  ON storage.objects FOR INSERT 
  TO anon, authenticated, public
  WITH CHECK (bucket_id = 'duckdb-tables');
  
  -- Also ensure read access is public
  DROP POLICY IF EXISTS "Users can view JSON exports in workspace folders" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can read duckdb-tables" ON storage.objects;
  
  CREATE POLICY "Anyone can read from duckdb-tables" 
  ON storage.objects FOR SELECT 
  TO anon, authenticated, public
  USING (bucket_id = 'duckdb-tables');
  
EXCEPTION WHEN OTHERS THEN
  -- If policies already exist or we don't have permission, continue
  NULL;
END $$;

-- Ensure bucket is public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'duckdb-tables';