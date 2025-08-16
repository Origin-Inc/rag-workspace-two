-- Task 12.9: Create template usage tracking table

CREATE TABLE IF NOT EXISTS template_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id TEXT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  
  -- Indexes
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for queries
CREATE INDEX IF NOT EXISTS idx_template_usage_template ON template_usage(template_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_workspace ON template_usage(workspace_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_user ON template_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_applied ON template_usage(applied_at DESC);

-- Create RLS policies
ALTER TABLE template_usage ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own template usage
CREATE POLICY "Users can view their template usage"
  ON template_usage
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    workspace_id IN (
      SELECT workspace_id FROM user_workspaces
      WHERE user_id = auth.uid()
    )
  );

-- Policy for users to track template usage
CREATE POLICY "Users can track template usage"
  ON template_usage
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND
    workspace_id IN (
      SELECT workspace_id FROM user_workspaces
      WHERE user_id = auth.uid()
    )
  );

-- Function to get template statistics
CREATE OR REPLACE FUNCTION get_template_statistics(p_template_id TEXT)
RETURNS TABLE (
  usage_count BIGINT,
  last_used TIMESTAMPTZ,
  popular_workspaces JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as usage_count,
    MAX(applied_at) as last_used,
    jsonb_agg(DISTINCT jsonb_build_object(
      'workspace_id', workspace_id,
      'applied_at', applied_at
    ) ORDER BY applied_at DESC) FILTER (WHERE applied_at IS NOT NULL) as popular_workspaces
  FROM template_usage
  WHERE template_id = p_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clone workspace template
CREATE OR REPLACE FUNCTION clone_workspace_template(
  p_template_id TEXT,
  p_workspace_id UUID,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_usage_id UUID;
BEGIN
  -- Record template usage
  INSERT INTO template_usage (
    template_id,
    workspace_id,
    user_id,
    applied_at
  ) VALUES (
    p_template_id,
    p_workspace_id,
    p_user_id,
    CURRENT_TIMESTAMP
  ) RETURNING id INTO v_usage_id;
  
  -- Return the usage record ID
  RETURN v_usage_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_template_statistics TO authenticated;
GRANT EXECUTE ON FUNCTION clone_workspace_template TO authenticated;