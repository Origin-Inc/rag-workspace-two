-- Document processing tables for RAG system
-- Storage buckets should be created via Supabase dashboard

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