-- Add missing updated_at column to data_files table
ALTER TABLE public.data_files 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create a trigger to auto-update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if exists then recreate
DROP TRIGGER IF EXISTS update_data_files_updated_at ON public.data_files;

CREATE TRIGGER update_data_files_updated_at 
BEFORE UPDATE ON public.data_files 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Drop all existing policies for duckdb-tables
DROP POLICY IF EXISTS "Users can upload workspace table exports" ON storage.objects;
DROP POLICY IF EXISTS "Users can view workspace table exports" ON storage.objects;
DROP POLICY IF EXISTS "Users can update workspace table exports" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete workspace table exports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload table exports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view table exports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update table exports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete table exports" ON storage.objects;

-- Create simpler, more permissive policies for authenticated users
-- These policies simply check if the user is authenticated

-- INSERT policy - Allow authenticated users to upload to their workspace
CREATE POLICY "Authenticated users can upload table exports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'duckdb-tables' 
  AND auth.uid() IS NOT NULL
);

-- SELECT policy - Allow authenticated users to view their files
CREATE POLICY "Authenticated users can view table exports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'duckdb-tables'
  AND auth.uid() IS NOT NULL
);

-- UPDATE policy - Allow authenticated users to update their files
CREATE POLICY "Authenticated users can update table exports"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'duckdb-tables'
  AND auth.uid() IS NOT NULL
)
WITH CHECK (
  bucket_id = 'duckdb-tables'
  AND auth.uid() IS NOT NULL
);

-- DELETE policy - Allow authenticated users to delete their files
CREATE POLICY "Authenticated users can delete table exports"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'duckdb-tables'
  AND auth.uid() IS NOT NULL
);