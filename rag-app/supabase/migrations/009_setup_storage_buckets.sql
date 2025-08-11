-- Create storage buckets for documents
-- Note: Bucket creation via SQL may require appropriate permissions

-- Check if the bucket already exists and create if not
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documents') THEN
    INSERT INTO storage.buckets (id, name, owner, created_at, updated_at)
    VALUES (
      'documents',
      'documents',
      auth.uid(),
      NOW(),
      NOW()
    );
  END IF;
END $$;

-- Create RLS policies for the documents bucket
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

-- Create a table to track document uploads and processing status
CREATE TABLE IF NOT EXISTS document_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'processed', 'failed')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS document_uploads_workspace_idx ON document_uploads(workspace_id);
CREATE INDEX IF NOT EXISTS document_uploads_status_idx ON document_uploads(status);
CREATE INDEX IF NOT EXISTS document_uploads_created_idx ON document_uploads(created_at DESC);

-- Enable RLS on document_uploads
ALTER TABLE document_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their document uploads"
  ON document_uploads FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create document uploads"
  ON document_uploads FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their document uploads"
  ON document_uploads FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );