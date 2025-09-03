-- Create database_blocks table
CREATE TABLE IF NOT EXISTS database_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  view_type VARCHAR(50) DEFAULT 'table',
  settings JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create database_columns table
CREATE TABLE IF NOT EXISTS database_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  width INTEGER DEFAULT 200,
  position INTEGER NOT NULL,
  config JSONB,
  is_visible BOOLEAN DEFAULT true,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_database_columns_database
    FOREIGN KEY (database_id) REFERENCES database_blocks(id) ON DELETE CASCADE
);

-- Create database_rows table
CREATE TABLE IF NOT EXISTS database_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL,
  cells JSONB NOT NULL,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_database_rows_database
    FOREIGN KEY (database_id) REFERENCES database_blocks(id) ON DELETE CASCADE
);

-- Create query_audit_logs table
CREATE TABLE IF NOT EXISTS query_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL,
  query TEXT NOT NULL,
  parsed_query JSONB NOT NULL,
  success BOOLEAN NOT NULL,
  error TEXT,
  executed_at TIMESTAMPTZ NOT NULL,
  execution_time INTEGER,
  rows_returned INTEGER,
  cached BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_query_audit_logs_database
    FOREIGN KEY (block_id) REFERENCES database_blocks(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_database_blocks_page ON database_blocks(page_id);

CREATE INDEX IF NOT EXISTS idx_database_columns_database ON database_columns(database_id);
CREATE INDEX IF NOT EXISTS idx_database_columns_position ON database_columns(position);

CREATE INDEX IF NOT EXISTS idx_database_rows_database ON database_rows(database_id);
CREATE INDEX IF NOT EXISTS idx_database_rows_position ON database_rows(position);

CREATE INDEX IF NOT EXISTS idx_query_audit_logs_block ON query_audit_logs(block_id);
CREATE INDEX IF NOT EXISTS idx_query_audit_logs_executed ON query_audit_logs(executed_at);
CREATE INDEX IF NOT EXISTS idx_query_audit_logs_success ON query_audit_logs(success);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables
CREATE TRIGGER update_database_blocks_updated_at BEFORE UPDATE ON database_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_database_columns_updated_at BEFORE UPDATE ON database_columns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_database_rows_updated_at BEFORE UPDATE ON database_rows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();