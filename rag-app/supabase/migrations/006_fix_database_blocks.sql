-- Fix database blocks to work without the full workspace structure
-- This makes the database block feature work independently for demo purposes

-- First, drop the existing tables with their constraints
DROP TABLE IF EXISTS db_block_rows CASCADE;
DROP TABLE IF EXISTS db_blocks CASCADE;

-- Create a simplified db_blocks table without foreign key to blocks
CREATE TABLE db_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  block_id TEXT NOT NULL UNIQUE, -- Changed from UUID foreign key to simple text identifier
  name TEXT NOT NULL DEFAULT 'Untitled Database',
  description TEXT,
  schema JSONB NOT NULL DEFAULT '[]', -- Column definitions
  settings JSONB DEFAULT '{}', -- Display settings
  workspace_id TEXT, -- Optional workspace reference
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recreate db_block_rows with reference to the new db_blocks
CREATE TABLE db_block_rows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  db_block_id UUID NOT NULL REFERENCES db_blocks(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}', -- Key-value pairs for column data
  position SERIAL, -- Auto-incrementing position for stable ordering
  version INT DEFAULT 1, -- For optimistic locking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

-- Recreate indexes
CREATE INDEX idx_db_blocks_block_id ON db_blocks(block_id);
CREATE INDEX idx_db_block_rows_db_block_id ON db_block_rows(db_block_id);
CREATE INDEX idx_db_block_rows_position ON db_block_rows(db_block_id, position);
CREATE INDEX idx_db_block_rows_created_at ON db_block_rows(created_at DESC);
CREATE INDEX idx_db_block_rows_data_gin ON db_block_rows USING gin(data);

-- Enable Row Level Security (simplified for demo)
ALTER TABLE db_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_block_rows ENABLE ROW LEVEL SECURITY;

-- Create simplified RLS policies that allow all operations for now
-- In production, these would check workspace membership

-- Policies for db_blocks (allow all for demo)
CREATE POLICY "Allow all operations on db_blocks for demo"
  ON db_blocks FOR ALL
  USING (true)
  WITH CHECK (true);

-- Policies for db_block_rows (allow all for demo)
CREATE POLICY "Allow all operations on db_block_rows for demo"
  ON db_block_rows FOR ALL
  USING (true)
  WITH CHECK (true);

-- Recreate the helper functions
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
      data = (v_update->>'data')::JSONB,
      version = version + 1,
      updated_at = NOW()
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
  
  IF p_filters IS NOT NULL THEN
    v_query := v_query || ' AND data @> $2';
    EXECUTE v_query INTO v_count USING p_db_block_id, p_filters;
  ELSE
    EXECUTE v_query INTO v_count USING p_db_block_id;
  END IF;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION aggregate_column(
  p_db_block_id UUID,
  p_column_name TEXT,
  p_aggregation TEXT
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

-- Comments for documentation
COMMENT ON TABLE db_blocks IS 'Simplified database blocks table for demo purposes';
COMMENT ON TABLE db_block_rows IS 'Row data for database blocks, optimized for 50k+ rows';
COMMENT ON COLUMN db_blocks.block_id IS 'Text identifier for the database block (no foreign key for demo)';