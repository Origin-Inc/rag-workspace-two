-- Fix Schema Mismatch Issues
-- This script adds missing columns and tables to align database with Prisma schema

-- 1. Add missing 'blocks' column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS blocks JSONB;

-- 2. Create missing tables for database block system
CREATE TABLE IF NOT EXISTS database_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    view_type VARCHAR(50) DEFAULT 'table' NOT NULL,
    settings JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_database_blocks_page_id ON database_blocks(page_id);

CREATE TABLE IF NOT EXISTS database_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    database_id UUID REFERENCES database_blocks(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    width INTEGER DEFAULT 200 NOT NULL,
    position INTEGER NOT NULL,
    config JSONB,
    is_visible BOOLEAN DEFAULT true NOT NULL,
    is_locked BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_database_columns_database_id ON database_columns(database_id);
CREATE INDEX IF NOT EXISTS idx_database_columns_position ON database_columns(position);

CREATE TABLE IF NOT EXISTS database_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    database_id UUID REFERENCES database_blocks(id) ON DELETE CASCADE NOT NULL,
    cells JSONB NOT NULL,
    position INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_database_rows_database_id ON database_rows(database_id);
CREATE INDEX IF NOT EXISTS idx_database_rows_position ON database_rows(position);

-- 3. Create permissions and role permissions tables
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(resource, action)
);

CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);

CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE NOT NULL,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(role_id, permission_id)
);

-- 4. Create query audit logs table
CREATE TABLE IF NOT EXISTS query_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id UUID REFERENCES database_blocks(id) ON DELETE CASCADE NOT NULL,
    query TEXT NOT NULL,
    parsed_query JSONB NOT NULL,
    success BOOLEAN NOT NULL,
    error TEXT,
    executed_at TIMESTAMPTZ NOT NULL,
    execution_time INTEGER,
    rows_returned INTEGER,
    cached BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_query_audit_logs_block_id ON query_audit_logs(block_id);
CREATE INDEX IF NOT EXISTS idx_query_audit_logs_executed_at ON query_audit_logs(executed_at);
CREATE INDEX IF NOT EXISTS idx_query_audit_logs_success ON query_audit_logs(success);

-- 5. Create integration credentials table  
CREATE TABLE IF NOT EXISTS integration_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    provider VARCHAR(50) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expiry TIMESTAMPTZ,
    metadata JSONB,
    is_active BOOLEAN DEFAULT true NOT NULL,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(workspace_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integration_credentials_workspace_id ON integration_credentials(workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_credentials_provider ON integration_credentials(provider);

-- 6. Create webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES integration_credentials(id) ON DELETE CASCADE NOT NULL,
    url TEXT NOT NULL,
    secret TEXT,
    events TEXT[] NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    last_triggered TIMESTAMPTZ,
    failure_count INTEGER DEFAULT 0 NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhooks_integration_id ON webhooks(integration_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_is_active ON webhooks(is_active);

-- 7. Add update triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to tables that need it
DROP TRIGGER IF EXISTS update_database_blocks_updated_at ON database_blocks;
CREATE TRIGGER update_database_blocks_updated_at 
    BEFORE UPDATE ON database_blocks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_database_columns_updated_at ON database_columns;
CREATE TRIGGER update_database_columns_updated_at 
    BEFORE UPDATE ON database_columns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_database_rows_updated_at ON database_rows;
CREATE TRIGGER update_database_rows_updated_at 
    BEFORE UPDATE ON database_rows 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_integration_credentials_updated_at ON integration_credentials;
CREATE TRIGGER update_integration_credentials_updated_at 
    BEFORE UPDATE ON integration_credentials 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;
CREATE TRIGGER update_webhooks_updated_at 
    BEFORE UPDATE ON webhooks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Verify the fix by checking if the new columns/tables exist
SELECT 
    'pages.blocks column' as item,
    CASE WHEN column_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
FROM information_schema.columns 
WHERE table_name = 'pages' AND column_name = 'blocks' AND table_schema = 'public'

UNION ALL

SELECT 
    'database_blocks table' as item,
    CASE WHEN table_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status  
FROM information_schema.tables
WHERE table_name = 'database_blocks' AND table_schema = 'public'

UNION ALL

SELECT 
    'permissions table' as item,
    CASE WHEN table_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
FROM information_schema.tables
WHERE table_name = 'permissions' AND table_schema = 'public';