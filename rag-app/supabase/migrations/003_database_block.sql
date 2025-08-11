-- Migration for Database Block Feature
-- This creates tables and functions for the advanced database block component
-- supporting 50k+ rows with real-time collaboration

-- Create enum for database column types
CREATE TYPE database_column_type AS ENUM (
  'text',
  'number',
  'date',
  'datetime',
  'select',
  'multi_select',
  'checkbox',
  'url',
  'email',
  'phone',
  'currency',
  'percent',
  'rating',
  'user',
  'file',
  'formula',
  'rollup',
  'lookup',
  'created_time',
  'updated_time',
  'created_by',
  'updated_by'
);

-- Create enum for aggregation types
CREATE TYPE aggregation_type AS ENUM (
  'count',
  'count_empty',
  'count_not_empty',
  'count_unique',
  'sum',
  'average',
  'median',
  'min',
  'max',
  'range',
  'earliest',
  'latest'
);

-- Create enum for filter operators
CREATE TYPE filter_operator AS ENUM (
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'between',
  'is_within',
  'is_before',
  'is_after'
);

-- Database block metadata
CREATE TABLE database_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Database',
  description TEXT,
  schema JSONB NOT NULL DEFAULT '[]', -- Column definitions
  views JSONB DEFAULT '[]', -- Saved views (filters, sorts, hidden columns)
  settings JSONB DEFAULT '{}', -- Display settings
  row_count INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(block_id)
);

-- Database columns definition
CREATE TABLE database_columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  database_block_id UUID NOT NULL REFERENCES database_blocks(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL, -- Internal column identifier
  name TEXT NOT NULL,
  type database_column_type NOT NULL,
  position INTEGER NOT NULL,
  width INTEGER DEFAULT 150,
  is_primary BOOLEAN DEFAULT FALSE,
  is_required BOOLEAN DEFAULT FALSE,
  is_unique BOOLEAN DEFAULT FALSE,
  is_hidden BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  default_value JSONB,
  options JSONB DEFAULT '{}', -- For select/multi-select options, formula expressions, etc.
  validation JSONB DEFAULT '{}', -- Validation rules
  aggregation aggregation_type,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(database_block_id, column_id),
  UNIQUE(database_block_id, position)
);

-- Database rows
CREATE TABLE database_rows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  database_block_id UUID NOT NULL REFERENCES database_blocks(id) ON DELETE CASCADE,
  row_number SERIAL, -- Auto-incrementing row number for stable ordering
  data JSONB NOT NULL DEFAULT '{}', -- Key-value pairs for column data
  metadata JSONB DEFAULT '{}', -- Additional metadata (created_by, updated_by, etc.)
  version INTEGER DEFAULT 1, -- For optimistic locking
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE(database_block_id, row_number)
);

-- Database cells (for efficient updates and history)
CREATE TABLE database_cells (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  row_id UUID NOT NULL REFERENCES database_rows(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL,
  value JSONB,
  previous_value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  UNIQUE(row_id, column_id)
);

-- Database views (saved filters, sorts, and column visibility)
CREATE TABLE database_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  database_block_id UUID NOT NULL REFERENCES database_blocks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'table', -- table, gallery, kanban, calendar, timeline
  filters JSONB DEFAULT '[]',
  sorts JSONB DEFAULT '[]',
  visible_columns TEXT[] DEFAULT '{}',
  group_by TEXT,
  color_by TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Database comments on rows
CREATE TABLE database_row_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  row_id UUID NOT NULL REFERENCES database_rows(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  mentions TEXT[] DEFAULT '{}',
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Database activity log
CREATE TABLE database_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  database_block_id UUID NOT NULL REFERENCES database_blocks(id) ON DELETE CASCADE,
  row_id UUID REFERENCES database_rows(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- created, updated, deleted, commented, etc.
  changes JSONB DEFAULT '{}', -- What changed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_database_blocks_block_id ON database_blocks(block_id);
CREATE INDEX idx_database_columns_database_block_id ON database_columns(database_block_id);
CREATE INDEX idx_database_columns_position ON database_columns(database_block_id, position);
CREATE INDEX idx_database_rows_database_block_id ON database_rows(database_block_id);
CREATE INDEX idx_database_rows_row_number ON database_rows(database_block_id, row_number);
CREATE INDEX idx_database_rows_created_at ON database_rows(created_at DESC);
CREATE INDEX idx_database_rows_updated_at ON database_rows(updated_at DESC);
CREATE INDEX idx_database_cells_row_id ON database_cells(row_id);
CREATE INDEX idx_database_cells_column_id ON database_cells(row_id, column_id);
CREATE INDEX idx_database_views_database_block_id ON database_views(database_block_id);
CREATE INDEX idx_database_row_comments_row_id ON database_row_comments(row_id);
CREATE INDEX idx_database_activity_database_block_id ON database_activity(database_block_id);
CREATE INDEX idx_database_activity_row_id ON database_activity(row_id);
CREATE INDEX idx_database_activity_created_at ON database_activity(created_at DESC);

-- Enable Row Level Security
ALTER TABLE database_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE database_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE database_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE database_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE database_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE database_row_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE database_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Database blocks: Users can view/edit database blocks in their workspace
CREATE POLICY "Users can view database blocks in their workspace" ON database_blocks
  FOR SELECT
  USING (
    block_id IN (
      SELECT b.id FROM blocks b
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id IN (
        SELECT workspace_id::text FROM auth.users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create database blocks in their workspace" ON database_blocks
  FOR INSERT
  WITH CHECK (
    block_id IN (
      SELECT b.id FROM blocks b
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id IN (
        SELECT workspace_id::text FROM auth.users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update database blocks in their workspace" ON database_blocks
  FOR UPDATE
  USING (
    block_id IN (
      SELECT b.id FROM blocks b
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id IN (
        SELECT workspace_id::text FROM auth.users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete database blocks in their workspace" ON database_blocks
  FOR DELETE
  USING (
    block_id IN (
      SELECT b.id FROM blocks b
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id IN (
        SELECT workspace_id::text FROM auth.users WHERE id = auth.uid()
      )
    )
  );

-- Similar policies for database_columns
CREATE POLICY "Users can view database columns" ON database_columns
  FOR SELECT
  USING (
    database_block_id IN (
      SELECT id FROM database_blocks
    )
  );

CREATE POLICY "Users can manage database columns" ON database_columns
  FOR ALL
  USING (
    database_block_id IN (
      SELECT id FROM database_blocks
    )
  );

-- Similar policies for database_rows
CREATE POLICY "Users can view database rows" ON database_rows
  FOR SELECT
  USING (
    database_block_id IN (
      SELECT id FROM database_blocks
    )
  );

CREATE POLICY "Users can manage database rows" ON database_rows
  FOR ALL
  USING (
    database_block_id IN (
      SELECT id FROM database_blocks
    )
  );

-- Similar policies for database_cells
CREATE POLICY "Users can view database cells" ON database_cells
  FOR SELECT
  USING (
    row_id IN (
      SELECT id FROM database_rows
    )
  );

CREATE POLICY "Users can manage database cells" ON database_cells
  FOR ALL
  USING (
    row_id IN (
      SELECT id FROM database_rows
    )
  );

-- Similar policies for other tables
CREATE POLICY "Users can manage database views" ON database_views
  FOR ALL
  USING (
    database_block_id IN (
      SELECT id FROM database_blocks
    )
  );

CREATE POLICY "Users can manage database comments" ON database_row_comments
  FOR ALL
  USING (
    row_id IN (
      SELECT id FROM database_rows
    )
  );

CREATE POLICY "Users can view database activity" ON database_activity
  FOR SELECT
  USING (
    database_block_id IN (
      SELECT id FROM database_blocks
    )
  );

CREATE POLICY "Activity is automatically tracked" ON database_activity
  FOR INSERT
  WITH CHECK (true);

-- Helper functions

-- Function to get paginated rows with filters and sorts
CREATE OR REPLACE FUNCTION get_database_rows(
  p_database_block_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_filters JSONB DEFAULT '[]',
  p_sorts JSONB DEFAULT '[]'
)
RETURNS TABLE (
  id UUID,
  row_number INTEGER,
  data JSONB,
  metadata JSONB,
  version INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  -- TODO: Implement dynamic filtering and sorting based on p_filters and p_sorts
  -- For now, return simple paginated results
  RETURN QUERY
  SELECT 
    r.id,
    r.row_number::INTEGER,
    r.data,
    r.metadata,
    r.version,
    r.created_at,
    r.updated_at
  FROM database_rows r
  WHERE r.database_block_id = p_database_block_id
    AND r.is_deleted = FALSE
  ORDER BY r.row_number
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function for bulk row updates
CREATE OR REPLACE FUNCTION bulk_update_database_rows(
  p_updates JSONB[]
)
RETURNS INTEGER AS $$
DECLARE
  update_record JSONB;
  updated_count INTEGER := 0;
BEGIN
  FOREACH update_record IN ARRAY p_updates
  LOOP
    UPDATE database_rows
    SET 
      data = update_record->'data',
      metadata = COALESCE(update_record->'metadata', metadata),
      version = version + 1,
      updated_at = NOW(),
      updated_by = update_record->>'updated_by'
    WHERE id = (update_record->>'id')::UUID
      AND version = (update_record->>'version')::INTEGER; -- Optimistic locking
    
    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for bulk cell updates (more efficient for individual cell changes)
CREATE OR REPLACE FUNCTION bulk_update_database_cells(
  p_updates JSONB[]
)
RETURNS INTEGER AS $$
DECLARE
  update_record JSONB;
  updated_count INTEGER := 0;
BEGIN
  FOREACH update_record IN ARRAY p_updates
  LOOP
    INSERT INTO database_cells (row_id, column_id, value, updated_by)
    VALUES (
      (update_record->>'row_id')::UUID,
      update_record->>'column_id',
      update_record->'value',
      update_record->>'updated_by'
    )
    ON CONFLICT (row_id, column_id)
    DO UPDATE SET
      previous_value = database_cells.value,
      value = EXCLUDED.value,
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by;
    
    updated_count := updated_count + 1;
    
    -- Update the parent row's updated_at
    UPDATE database_rows
    SET updated_at = NOW()
    WHERE id = (update_record->>'row_id')::UUID;
  END LOOP;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate aggregations for a column
CREATE OR REPLACE FUNCTION calculate_column_aggregation(
  p_database_block_id UUID,
  p_column_id TEXT,
  p_aggregation aggregation_type
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  CASE p_aggregation
    WHEN 'count' THEN
      SELECT jsonb_build_object('value', COUNT(*))
      INTO result
      FROM database_rows
      WHERE database_block_id = p_database_block_id
        AND is_deleted = FALSE;
    
    WHEN 'count_not_empty' THEN
      SELECT jsonb_build_object('value', COUNT(*))
      INTO result
      FROM database_rows
      WHERE database_block_id = p_database_block_id
        AND is_deleted = FALSE
        AND data->p_column_id IS NOT NULL
        AND data->p_column_id != 'null'::jsonb;
    
    WHEN 'sum' THEN
      SELECT jsonb_build_object('value', SUM((data->p_column_id)::NUMERIC))
      INTO result
      FROM database_rows
      WHERE database_block_id = p_database_block_id
        AND is_deleted = FALSE
        AND data->p_column_id IS NOT NULL;
    
    WHEN 'average' THEN
      SELECT jsonb_build_object('value', AVG((data->p_column_id)::NUMERIC))
      INTO result
      FROM database_rows
      WHERE database_block_id = p_database_block_id
        AND is_deleted = FALSE
        AND data->p_column_id IS NOT NULL;
    
    ELSE
      result := jsonb_build_object('value', NULL, 'error', 'Unsupported aggregation type');
  END CASE;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to duplicate a database row
CREATE OR REPLACE FUNCTION duplicate_database_row(
  p_row_id UUID,
  p_user_id TEXT
)
RETURNS UUID AS $$
DECLARE
  new_row_id UUID;
  source_row RECORD;
BEGIN
  -- Get the source row
  SELECT * INTO source_row
  FROM database_rows
  WHERE id = p_row_id;
  
  -- Create new row with duplicated data
  INSERT INTO database_rows (
    database_block_id,
    data,
    metadata,
    created_by,
    updated_by
  ) VALUES (
    source_row.database_block_id,
    source_row.data,
    jsonb_build_object('duplicated_from', p_row_id),
    p_user_id,
    p_user_id
  ) RETURNING id INTO new_row_id;
  
  -- Log activity
  INSERT INTO database_activity (
    database_block_id,
    row_id,
    user_id,
    action,
    changes
  ) VALUES (
    source_row.database_block_id,
    new_row_id,
    p_user_id,
    'duplicated',
    jsonb_build_object('source_row_id', p_row_id)
  );
  
  RETURN new_row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update row count on database_blocks
CREATE OR REPLACE FUNCTION update_database_row_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE database_blocks
    SET row_count = row_count + 1
    WHERE id = NEW.database_block_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE database_blocks
    SET row_count = row_count - 1
    WHERE id = OLD.database_block_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_row_count_on_insert
  AFTER INSERT ON database_rows
  FOR EACH ROW
  WHEN (NEW.is_deleted = FALSE)
  EXECUTE FUNCTION update_database_row_count();

CREATE TRIGGER update_row_count_on_delete
  AFTER DELETE ON database_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_database_row_count();

CREATE TRIGGER update_row_count_on_soft_delete
  AFTER UPDATE ON database_rows
  FOR EACH ROW
  WHEN (OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE)
  EXECUTE FUNCTION update_database_row_count();

-- Trigger to log activity
CREATE OR REPLACE FUNCTION log_database_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO database_activity (database_block_id, row_id, user_id, action, changes)
    VALUES (NEW.database_block_id, NEW.id, COALESCE(NEW.created_by, 'system'), 'created', row_to_json(NEW)::jsonb);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO database_activity (database_block_id, row_id, user_id, action, changes)
    VALUES (NEW.database_block_id, NEW.id, COALESCE(NEW.updated_by, 'system'), 'updated', 
            jsonb_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW)));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO database_activity (database_block_id, row_id, user_id, action, changes)
    VALUES (OLD.database_block_id, OLD.id, 'system', 'deleted', row_to_json(OLD)::jsonb);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_row_activity
  AFTER INSERT OR UPDATE OR DELETE ON database_rows
  FOR EACH ROW
  EXECUTE FUNCTION log_database_activity();

-- Update timestamp triggers
CREATE TRIGGER update_database_blocks_updated_at
  BEFORE UPDATE ON database_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_database_columns_updated_at
  BEFORE UPDATE ON database_columns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_database_rows_updated_at
  BEFORE UPDATE ON database_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_database_views_updated_at
  BEFORE UPDATE ON database_views
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_database_row_comments_updated_at
  BEFORE UPDATE ON database_row_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Add comments for documentation
COMMENT ON TABLE database_blocks IS 'Metadata for database block instances';
COMMENT ON TABLE database_columns IS 'Column definitions for database blocks';
COMMENT ON TABLE database_rows IS 'Row data for database blocks';
COMMENT ON TABLE database_cells IS 'Individual cell values with history';
COMMENT ON TABLE database_views IS 'Saved views with filters and sorts';
COMMENT ON TABLE database_row_comments IS 'Comments on database rows';
COMMENT ON TABLE database_activity IS 'Activity log for database changes';
COMMENT ON FUNCTION get_database_rows IS 'Get paginated rows with filters and sorts';
COMMENT ON FUNCTION bulk_update_database_rows IS 'Bulk update rows with optimistic locking';
COMMENT ON FUNCTION bulk_update_database_cells IS 'Bulk update individual cells';
COMMENT ON FUNCTION calculate_column_aggregation IS 'Calculate aggregation for a column';
COMMENT ON FUNCTION duplicate_database_row IS 'Duplicate a database row';