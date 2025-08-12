-- Create page_blocks table for storing canvas blocks
CREATE TABLE IF NOT EXISTS page_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  content JSONB DEFAULT '{}'::jsonb,
  properties JSONB DEFAULT '{}'::jsonb,
  position JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "width": 12, "height": 1}'::jsonb,
  parent_id UUID REFERENCES page_blocks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Indexes
  CONSTRAINT valid_position CHECK (
    (position->>'x')::int >= 0 AND
    (position->>'y')::int >= 0 AND
    (position->>'width')::int > 0 AND
    (position->>'height')::int > 0
  )
);

-- Create indexes
CREATE INDEX idx_page_blocks_page_id ON page_blocks(page_id);
CREATE INDEX idx_page_blocks_type ON page_blocks(type);
CREATE INDEX idx_page_blocks_parent_id ON page_blocks(parent_id);
CREATE INDEX idx_page_blocks_position ON page_blocks USING GIN(position);
CREATE INDEX idx_page_blocks_created_at ON page_blocks(created_at DESC);

-- Enable RLS
ALTER TABLE page_blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view blocks in accessible pages"
  ON page_blocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pages p
      WHERE p.id = page_blocks.page_id
      AND (
        p.is_public = true OR
        EXISTS (
          SELECT 1 FROM project_collaborators pm
          WHERE pm.project_id = p.project_id
          AND pm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can insert blocks in editable pages"
  ON page_blocks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pages p
      JOIN project_collaborators pm ON pm.project_id = p.project_id
      WHERE p.id = page_blocks.page_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "Users can update blocks in editable pages"
  ON page_blocks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM pages p
      JOIN project_collaborators pm ON pm.project_id = p.project_id
      WHERE p.id = page_blocks.page_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "Users can delete blocks in editable pages"
  ON page_blocks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM pages p
      JOIN project_collaborators pm ON pm.project_id = p.project_id
      WHERE p.id = page_blocks.page_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'admin', 'editor')
    )
  );

-- Create function to update page timestamp when blocks change
CREATE OR REPLACE FUNCTION update_page_on_block_change()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE pages 
  SET updated_at = NOW() 
  WHERE id = COALESCE(NEW.page_id, OLD.page_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_page_timestamp_on_block_change
  AFTER INSERT OR UPDATE OR DELETE ON page_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_page_on_block_change();