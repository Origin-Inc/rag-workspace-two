-- Add parquet_url column to data_files table if it doesn't exist
ALTER TABLE public.data_files 
ADD COLUMN IF NOT EXISTS parquet_url TEXT;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_data_files_parquet_url 
ON public.data_files(parquet_url) 
WHERE parquet_url IS NOT NULL;

-- Update RLS policy for duckdb-tables bucket to fix permission issue
DROP POLICY IF EXISTS "Users can upload workspace table exports" ON storage.objects;

-- Recreate policy with fixed path check
CREATE POLICY "Users can upload workspace table exports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'duckdb-tables' 
  AND auth.uid() IS NOT NULL
  AND (
    -- Allow direct path format: tables/workspaceId/filename
    (storage.foldername(name))[1] = 'tables'
    AND EXISTS (
      SELECT 1 FROM public.user_workspaces uw
      WHERE uw.user_id = auth.uid()::text
      AND uw.workspace_id = (storage.foldername(name))[2]
    )
  )
);

-- Also update the SELECT policy to ensure consistency
DROP POLICY IF EXISTS "Users can view workspace table exports" ON storage.objects;

CREATE POLICY "Users can view workspace table exports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'duckdb-tables'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'tables'
  AND EXISTS (
    SELECT 1 FROM public.user_workspaces uw
    WHERE uw.user_id = auth.uid()::text
    AND uw.workspace_id = (storage.foldername(name))[2]
  )
);

-- Update the UPDATE policy
DROP POLICY IF EXISTS "Users can update workspace table exports" ON storage.objects;

CREATE POLICY "Users can update workspace table exports"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'duckdb-tables'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'tables'
  AND EXISTS (
    SELECT 1 FROM public.user_workspaces uw
    WHERE uw.user_id = auth.uid()::text
    AND uw.workspace_id = (storage.foldername(name))[2]
  )
)
WITH CHECK (
  bucket_id = 'duckdb-tables'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'tables'
  AND EXISTS (
    SELECT 1 FROM public.user_workspaces uw
    WHERE uw.user_id = auth.uid()::text
    AND uw.workspace_id = (storage.foldername(name))[2]
  )
);

-- Update the DELETE policy
DROP POLICY IF EXISTS "Users can delete workspace table exports" ON storage.objects;

CREATE POLICY "Users can delete workspace table exports"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'duckdb-tables'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = 'tables'
  AND EXISTS (
    SELECT 1 FROM public.user_workspaces uw
    WHERE uw.user_id = auth.uid()::text
    AND uw.workspace_id = (storage.foldername(name))[2]
  )
);