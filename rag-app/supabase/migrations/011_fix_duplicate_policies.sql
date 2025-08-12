-- Fix duplicate RLS policies for storage objects
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can upload documents to their workspace folders" ON storage.objects;
  DROP POLICY IF EXISTS "Users can view documents in their workspace folders" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update documents in their workspace folders" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete documents from their workspace folders" ON storage.objects;
  
  DROP POLICY IF EXISTS "Users can view their document uploads" ON document_uploads;
  DROP POLICY IF EXISTS "Users can create document uploads" ON document_uploads;
  DROP POLICY IF EXISTS "Users can update their document uploads" ON document_uploads;
END $$;

-- Re-create RLS policies for storage objects with proper checks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can upload documents to their workspace folders'
  ) THEN
    CREATE POLICY "Users can upload documents to their workspace folders"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'documents' AND
      (storage.foldername(name))[1] = 'workspace-' || (
        SELECT workspace_id::text 
        FROM user_workspaces 
        WHERE user_id = auth.uid()
        LIMIT 1
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can view documents in their workspace folders'
  ) THEN
    CREATE POLICY "Users can view documents in their workspace folders"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'documents' AND
      (storage.foldername(name))[1] = 'workspace-' || (
        SELECT workspace_id::text 
        FROM user_workspaces 
        WHERE user_id = auth.uid()
        LIMIT 1
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can update documents in their workspace folders'
  ) THEN
    CREATE POLICY "Users can update documents in their workspace folders"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'documents' AND
      (storage.foldername(name))[1] = 'workspace-' || (
        SELECT workspace_id::text 
        FROM user_workspaces 
        WHERE user_id = auth.uid()
        LIMIT 1
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can delete documents from their workspace folders'
  ) THEN
    CREATE POLICY "Users can delete documents from their workspace folders"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'documents' AND
      (storage.foldername(name))[1] = 'workspace-' || (
        SELECT workspace_id::text 
        FROM user_workspaces 
        WHERE user_id = auth.uid()
        LIMIT 1
      )
    );
  END IF;
END $$;

-- Re-create RLS policies for document_uploads table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'document_uploads' 
    AND policyname = 'Users can view their document uploads'
  ) THEN
    CREATE POLICY "Users can view their document uploads"
    ON document_uploads FOR SELECT
    USING (
      workspace_id IN (
        SELECT workspace_id 
        FROM user_workspaces 
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'document_uploads' 
    AND policyname = 'Users can create document uploads'
  ) THEN
    CREATE POLICY "Users can create document uploads"
    ON document_uploads FOR INSERT
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id 
        FROM user_workspaces 
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'document_uploads' 
    AND policyname = 'Users can update their document uploads'
  ) THEN
    CREATE POLICY "Users can update their document uploads"
    ON document_uploads FOR UPDATE
    USING (
      workspace_id IN (
        SELECT workspace_id 
        FROM user_workspaces 
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END $$;