-- Migration for AI Controller with Action Logs and Preview Tracking
-- This creates tables for storing AI command history, previews, and execution logs

-- Create enum for action status
CREATE TYPE action_status AS ENUM (
  'pending',
  'preview_shown',
  'confirmed',
  'executing',
  'completed',
  'failed',
  'cancelled'
);

-- Create enum for action types
CREATE TYPE action_type AS ENUM (
  'create_database',
  'add_column',
  'create_formula',
  'create_block',
  'update_block',
  'delete_block',
  'move_block',
  'query_data'
);

-- Action logs table with preview tracking
CREATE TABLE action_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces_extended(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  parsed_action JSONB NOT NULL,
  action_type action_type,
  preview JSONB,
  preview_shown BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status action_status DEFAULT 'pending',
  result JSONB,
  error TEXT,
  undo_data JSONB, -- Store data needed to undo the action
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Action previews table for storing detailed previews
CREATE TABLE action_previews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_log_id UUID NOT NULL REFERENCES action_logs(id) ON DELETE CASCADE,
  preview_type TEXT NOT NULL, -- 'database_structure', 'affected_data', 'sample_output'
  preview_data JSONB NOT NULL,
  storage_path TEXT, -- Path to preview snapshot in Storage
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Command templates for common operations
CREATE TABLE command_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces_extended(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  template_command TEXT NOT NULL,
  suggested_columns JSONB, -- For database creation templates
  usage_count INTEGER DEFAULT 0,
  is_global BOOLEAN DEFAULT FALSE, -- Global templates available to all workspaces
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Undo history for action reversal
CREATE TABLE undo_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_log_id UUID NOT NULL REFERENCES action_logs(id) ON DELETE CASCADE,
  undo_action JSONB NOT NULL,
  executed BOOLEAN DEFAULT FALSE,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_action_logs_workspace_id ON action_logs(workspace_id);
CREATE INDEX idx_action_logs_user_id ON action_logs(user_id);
CREATE INDEX idx_action_logs_status ON action_logs(status);
CREATE INDEX idx_action_logs_created_at ON action_logs(created_at DESC);
CREATE INDEX idx_action_previews_action_log_id ON action_previews(action_log_id);
CREATE INDEX idx_command_templates_workspace_id ON command_templates(workspace_id);
CREATE INDEX idx_undo_history_action_log_id ON undo_history(action_log_id);

-- Enable Row Level Security
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE undo_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Action logs: Users can only see their own actions within their workspaces
CREATE POLICY "Users can view their action logs" ON action_logs
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR workspace_id IN (
      SELECT workspace_id FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create action logs" ON action_logs
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND workspace_id IN (
      SELECT workspace_id FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their action logs" ON action_logs
  FOR UPDATE
  USING (user_id = auth.uid());

-- Action previews: Same access as action logs
CREATE POLICY "Users can view action previews" ON action_previews
  FOR SELECT
  USING (
    action_log_id IN (
      SELECT id FROM action_logs 
      WHERE user_id = auth.uid()
        OR workspace_id IN (
          SELECT workspace_id FROM user_workspaces 
          WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Users can create action previews" ON action_previews
  FOR INSERT
  WITH CHECK (
    action_log_id IN (
      SELECT id FROM action_logs 
      WHERE user_id = auth.uid()
    )
  );

-- Command templates: View global or workspace templates
CREATE POLICY "Users can view templates" ON command_templates
  FOR SELECT
  USING (
    is_global = TRUE
    OR workspace_id IN (
      SELECT workspace_id FROM user_workspaces 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create workspace templates" ON command_templates
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      workspace_id IS NULL AND is_global = FALSE -- Personal template
      OR workspace_id IN (
        SELECT workspace_id FROM user_workspaces 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Undo history: Same access as action logs
CREATE POLICY "Users can view undo history" ON undo_history
  FOR SELECT
  USING (
    action_log_id IN (
      SELECT id FROM action_logs 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create undo history" ON undo_history
  FOR INSERT
  WITH CHECK (
    action_log_id IN (
      SELECT id FROM action_logs 
      WHERE user_id = auth.uid()
    )
  );

-- Helper functions

-- Function to get suggested columns for database creation
CREATE OR REPLACE FUNCTION get_suggested_columns(context_text TEXT)
RETURNS JSONB AS $$
DECLARE
  suggested_columns JSONB;
BEGIN
  -- Basic pattern matching for common database types
  CASE 
    WHEN context_text ILIKE '%project%' OR context_text ILIKE '%task%' THEN
      suggested_columns := '[
        {"name": "Task Name", "type": "text", "isRequired": true},
        {"name": "Status", "type": "select", "options": ["Not Started", "In Progress", "Completed", "Blocked"]},
        {"name": "Assignee", "type": "user"},
        {"name": "Due Date", "type": "date"},
        {"name": "Priority", "type": "select", "options": ["Low", "Medium", "High", "Critical"]},
        {"name": "Description", "type": "text"},
        {"name": "Progress", "type": "percent"}
      ]'::jsonb;
    
    WHEN context_text ILIKE '%expense%' OR context_text ILIKE '%budget%' THEN
      suggested_columns := '[
        {"name": "Date", "type": "date", "isRequired": true},
        {"name": "Description", "type": "text", "isRequired": true},
        {"name": "Amount", "type": "currency", "isRequired": true},
        {"name": "Category", "type": "select", "options": ["Food", "Transport", "Entertainment", "Utilities", "Other"]},
        {"name": "Payment Method", "type": "select", "options": ["Cash", "Credit Card", "Debit Card", "Bank Transfer"]},
        {"name": "Receipt", "type": "file"},
        {"name": "Notes", "type": "text"}
      ]'::jsonb;
    
    WHEN context_text ILIKE '%contact%' OR context_text ILIKE '%customer%' THEN
      suggested_columns := '[
        {"name": "Name", "type": "text", "isRequired": true},
        {"name": "Email", "type": "email"},
        {"name": "Phone", "type": "phone"},
        {"name": "Company", "type": "text"},
        {"name": "Status", "type": "select", "options": ["Lead", "Prospect", "Customer", "Inactive"]},
        {"name": "Last Contact", "type": "date"},
        {"name": "Notes", "type": "text"}
      ]'::jsonb;
    
    WHEN context_text ILIKE '%inventor%' OR context_text ILIKE '%product%' THEN
      suggested_columns := '[
        {"name": "Product Name", "type": "text", "isRequired": true},
        {"name": "SKU", "type": "text"},
        {"name": "Quantity", "type": "number"},
        {"name": "Price", "type": "currency"},
        {"name": "Category", "type": "select"},
        {"name": "Supplier", "type": "text"},
        {"name": "Reorder Level", "type": "number"},
        {"name": "Last Updated", "type": "updated_time"}
      ]'::jsonb;
    
    ELSE
      -- Default columns for generic database
      suggested_columns := '[
        {"name": "Name", "type": "text", "isRequired": true},
        {"name": "Description", "type": "text"},
        {"name": "Status", "type": "select"},
        {"name": "Created", "type": "created_time"},
        {"name": "Updated", "type": "updated_time"}
      ]'::jsonb;
  END CASE;
  
  RETURN suggested_columns;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to generate action preview
CREATE OR REPLACE FUNCTION generate_action_preview(
  p_action_type action_type,
  p_parsed_action JSONB
)
RETURNS JSONB AS $$
DECLARE
  preview JSONB;
BEGIN
  CASE p_action_type
    WHEN 'create_database' THEN
      preview := jsonb_build_object(
        'type', 'database_creation',
        'database_name', p_parsed_action->>'name',
        'columns', p_parsed_action->'columns',
        'estimated_structure', jsonb_build_object(
          'total_columns', jsonb_array_length(p_parsed_action->'columns'),
          'required_columns', (
            SELECT COUNT(*) 
            FROM jsonb_array_elements(p_parsed_action->'columns') AS col 
            WHERE (col->>'isRequired')::boolean = true
          )
        ),
        'sample_row', jsonb_build_object(
          'description', 'Example data that would be stored',
          'data', jsonb_build_object()
        )
      );
    
    WHEN 'add_column' THEN
      preview := jsonb_build_object(
        'type', 'column_addition',
        'column_name', p_parsed_action->>'columnName',
        'column_type', p_parsed_action->>'columnType',
        'affected_table', p_parsed_action->>'tableId',
        'impact', 'Will add new column to all existing rows with default value'
      );
    
    WHEN 'create_formula' THEN
      preview := jsonb_build_object(
        'type', 'formula_creation',
        'formula_text', p_parsed_action->>'formula',
        'column_name', p_parsed_action->>'columnName',
        'dependencies', p_parsed_action->'dependencies',
        'sample_calculation', 'Preview of formula result'
      );
    
    ELSE
      preview := jsonb_build_object(
        'type', p_action_type::text,
        'action', p_parsed_action,
        'impact', 'Preview not available for this action type'
      );
  END CASE;
  
  RETURN preview;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_action_logs_updated_at
  BEFORE UPDATE ON action_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_command_templates_updated_at
  BEFORE UPDATE ON command_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Insert default command templates
INSERT INTO command_templates (name, description, template_command, suggested_columns, is_global)
VALUES 
  ('Project Tracker', 'Create a database to track project tasks', 'Add a database to track project tasks', 
   '[{"name": "Task Name", "type": "text"}, {"name": "Status", "type": "select"}, {"name": "Assignee", "type": "user"}, {"name": "Due Date", "type": "date"}]'::jsonb, true),
  
  ('Expense Tracker', 'Create a database for expense tracking', 'Create expense tracker database',
   '[{"name": "Date", "type": "date"}, {"name": "Description", "type": "text"}, {"name": "Amount", "type": "currency"}, {"name": "Category", "type": "select"}]'::jsonb, true),
  
  ('Days Until Formula', 'Add a formula to calculate days until a date', 'Add a formula that calculates days until due date',
   '[{"name": "Days Until", "type": "formula", "formula": "DAYS_UNTIL([Due Date])"}]'::jsonb, true);

-- Comments for documentation
COMMENT ON TABLE action_logs IS 'Stores all AI controller commands and their execution status';
COMMENT ON TABLE action_previews IS 'Detailed previews for each action before execution';
COMMENT ON TABLE command_templates IS 'Reusable command templates with suggested configurations';
COMMENT ON TABLE undo_history IS 'Tracks undo operations for executed actions';
COMMENT ON FUNCTION get_suggested_columns IS 'Returns suggested columns based on context keywords';
COMMENT ON FUNCTION generate_action_preview IS 'Generates preview data for different action types';