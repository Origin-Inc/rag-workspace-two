-- Proper implementation of Database Blocks with Supabase
-- This implements the actual database block feature as specified in tasks.json

-- Drop existing tables if they exist (from previous migration)
DROP TABLE IF EXISTS database_activity CASCADE;
DROP TABLE IF EXISTS database_row_comments CASCADE;
DROP TABLE IF EXISTS database_views CASCADE;
DROP TABLE IF EXISTS database_cells CASCADE;
DROP TABLE IF EXISTS database_rows CASCADE;
DROP TABLE IF EXISTS database_columns CASCADE;
DROP TABLE IF EXISTS database_blocks CASCADE;

-- Drop existing types if they exist
DROP TYPE IF EXISTS database_column_type CASCADE;
DROP TYPE IF EXISTS aggregation_type CASCADE;
DROP TYPE IF EXISTS filter_operator CASCADE;

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
  'created_time',
  'updated_time'
);

-- Main database blocks table
CREATE TABLE db_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Database',
  description TEXT,
  schema JSONB NOT NULL DEFAULT '[]', -- Column definitions
  settings JSONB DEFAULT '{}', -- Display settings
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(block_id)
);

-- Database rows with optimized structure for 50k+ rows
CREATE TABLE db_block_rows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  db_block_id UUID NOT NULL REFERENCES db_blocks(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}', -- Key-value pairs for column data
  position SERIAL, -- Auto-incrementing position for stable ordering
  version INT DEFAULT 1, -- For optimistic locking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Indexes for performance with large datasets
CREATE INDEX idx_db_blocks_block_id ON db_blocks(block_id);
CREATE INDEX idx_db_block_rows_db_block_id ON db_block_rows(db_block_id);
CREATE INDEX idx_db_block_rows_position ON db_block_rows(db_block_id, position);
CREATE INDEX idx_db_block_rows_created_at ON db_block_rows(created_at DESC);
CREATE INDEX idx_db_block_rows_data_gin ON db_block_rows USING gin(data);

-- Enable Row Level Security
ALTER TABLE db_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_block_rows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for db_blocks
CREATE POLICY "Users can view database blocks in their workspace"
  ON db_blocks FOR SELECT
  USING (
    block_id IN (
      SELECT b.id FROM blocks b
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id = (
        SELECT workspace_id::text FROM workspaces_extended 
        WHERE id IN (
          SELECT workspace_id FROM user_workspaces 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create database blocks in their workspace"
  ON db_blocks FOR INSERT
  WITH CHECK (
    block_id IN (
      SELECT b.id FROM blocks b
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id = (
        SELECT workspace_id::text FROM workspaces_extended 
        WHERE id IN (
          SELECT workspace_id FROM user_workspaces 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can update database blocks in their workspace"
  ON db_blocks FOR UPDATE
  USING (
    block_id IN (
      SELECT b.id FROM blocks b
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id = (
        SELECT workspace_id::text FROM workspaces_extended 
        WHERE id IN (
          SELECT workspace_id FROM user_workspaces 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can delete database blocks in their workspace"
  ON db_blocks FOR DELETE
  USING (
    block_id IN (
      SELECT b.id FROM blocks b
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id = (
        SELECT workspace_id::text FROM workspaces_extended 
        WHERE id IN (
          SELECT workspace_id FROM user_workspaces 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for db_block_rows
CREATE POLICY "Users can view rows in their workspace databases"
  ON db_block_rows FOR SELECT
  USING (
    db_block_id IN (
      SELECT db.id FROM db_blocks db
      JOIN blocks b ON db.block_id = b.id
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id = (
        SELECT workspace_id::text FROM workspaces_extended 
        WHERE id IN (
          SELECT workspace_id FROM user_workspaces 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create rows in their workspace databases"
  ON db_block_rows FOR INSERT
  WITH CHECK (
    db_block_id IN (
      SELECT db.id FROM db_blocks db
      JOIN blocks b ON db.block_id = b.id
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id = (
        SELECT workspace_id::text FROM workspaces_extended 
        WHERE id IN (
          SELECT workspace_id FROM user_workspaces 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can update rows in their workspace databases"
  ON db_block_rows FOR UPDATE
  USING (
    db_block_id IN (
      SELECT db.id FROM db_blocks db
      JOIN blocks b ON db.block_id = b.id
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id = (
        SELECT workspace_id::text FROM workspaces_extended 
        WHERE id IN (
          SELECT workspace_id FROM user_workspaces 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can delete rows in their workspace databases"
  ON db_block_rows FOR DELETE
  USING (
    db_block_id IN (
      SELECT db.id FROM db_blocks db
      JOIN blocks b ON db.block_id = b.id
      JOIN pages p ON b.page_id = p.id
      WHERE p.workspace_id = (
        SELECT workspace_id::text FROM workspaces_extended 
        WHERE id IN (
          SELECT workspace_id FROM user_workspaces 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- RPC function for bulk row updates (optimized for performance)
CREATE OR REPLACE FUNCTION bulk_update_rows(
  p_updates JSONB[]
)
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  v_update JSONB;
BEGIN
  FOREACH v_update IN ARRAY p_updates
  LOOP
    UPDATE db_block_rows
    SET 
      data = v_update->>'data',
      version = version + 1,
      updated_at = NOW(),
      updated_by = auth.uid()
    WHERE 
      id = (v_update->>'id')::UUID
      AND version = (v_update->>'version')::INT;
    
    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function for efficient row counting with filters
CREATE OR REPLACE FUNCTION count_db_rows(
  p_db_block_id UUID,
  p_filters JSONB DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_count BIGINT;
  v_query TEXT;
BEGIN
  v_query := 'SELECT COUNT(*) FROM db_block_rows WHERE db_block_id = $1';
  
  -- Add filter conditions if provided
  IF p_filters IS NOT NULL THEN
    -- Build dynamic WHERE clause based on filters
    -- This is a simplified version - expand as needed
    v_query := v_query || ' AND data @> $2';
    EXECUTE v_query INTO v_count USING p_db_block_id, p_filters;
  ELSE
    EXECUTE v_query INTO v_count USING p_db_block_id;
  END IF;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function for complex aggregations
CREATE OR REPLACE FUNCTION aggregate_column(
  p_db_block_id UUID,
  p_column_name TEXT,
  p_aggregation TEXT -- 'sum', 'avg', 'min', 'max', 'count'
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  CASE p_aggregation
    WHEN 'sum' THEN
      SELECT jsonb_build_object('value', SUM((data->>p_column_name)::NUMERIC))
      INTO v_result
      FROM db_block_rows
      WHERE db_block_id = p_db_block_id
        AND data ? p_column_name;
    
    WHEN 'avg' THEN
      SELECT jsonb_build_object('value', AVG((data->>p_column_name)::NUMERIC))
      INTO v_result
      FROM db_block_rows
      WHERE db_block_id = p_db_block_id
        AND data ? p_column_name;
    
    WHEN 'min' THEN
      SELECT jsonb_build_object('value', MIN((data->>p_column_name)::NUMERIC))
      INTO v_result
      FROM db_block_rows
      WHERE db_block_id = p_db_block_id
        AND data ? p_column_name;
    
    WHEN 'max' THEN
      SELECT jsonb_build_object('value', MAX((data->>p_column_name)::NUMERIC))
      INTO v_result
      FROM db_block_rows
      WHERE db_block_id = p_db_block_id
        AND data ? p_column_name;
    
    WHEN 'count' THEN
      SELECT jsonb_build_object('value', COUNT(*))
      INTO v_result
      FROM db_block_rows
      WHERE db_block_id = p_db_block_id
        AND data ? p_column_name;
    
    ELSE
      v_result := jsonb_build_object('error', 'Invalid aggregation type');
  END CASE;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_db_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_db_blocks_updated_at
  BEFORE UPDATE ON db_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_db_blocks_updated_at();

CREATE TRIGGER update_db_block_rows_updated_at
  BEFORE UPDATE ON db_block_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Function to get paginated rows with proper sorting
CREATE OR REPLACE FUNCTION get_paginated_rows(
  p_db_block_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_sort_column TEXT DEFAULT NULL,
  p_sort_direction TEXT DEFAULT 'ASC'
)
RETURNS TABLE (
  id UUID,
  data JSONB,
  row_position INT,
  version INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  IF p_sort_column IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      r.id,
      r.data,
      r.position AS row_position,
      r.version,
      r.created_at,
      r.updated_at
    FROM db_block_rows r
    WHERE r.db_block_id = p_db_block_id
    ORDER BY 
      CASE WHEN p_sort_direction = 'ASC' THEN r.data->>p_sort_column END ASC,
      CASE WHEN p_sort_direction = 'DESC' THEN r.data->>p_sort_column END DESC,
      r.position
    LIMIT p_limit
    OFFSET p_offset;
  ELSE
    RETURN QUERY
    SELECT 
      r.id,
      r.data,
      r.position AS row_position,
      r.version,
      r.created_at,
      r.updated_at
    FROM db_block_rows r
    WHERE r.db_block_id = p_db_block_id
    ORDER BY r.position
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE db_blocks IS 'Stores database block metadata and schema';
COMMENT ON TABLE db_block_rows IS 'Stores actual row data for database blocks, optimized for 50k+ rows';
COMMENT ON FUNCTION bulk_update_rows IS 'Efficiently updates multiple rows in a single transaction';
COMMENT ON FUNCTION count_db_rows IS 'Returns row count with optional filters';
COMMENT ON FUNCTION aggregate_column IS 'Performs aggregations on a column';
COMMENT ON FUNCTION get_paginated_rows IS 'Returns paginated rows with optional sorting';