-- Initialize PostgreSQL for production deployment
-- This script sets up pgvector and necessary extensions

-- Create extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Performance and monitoring
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';

-- Create optimized settings for vector operations
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET max_parallel_workers = 8;
ALTER SYSTEM SET max_parallel_maintenance_workers = 4;

-- Vector-specific optimizations
ALTER SYSTEM SET effective_cache_size = '6GB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
ALTER SYSTEM SET work_mem = '32MB';

-- Connection pooling settings
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET superuser_reserved_connections = 3;

-- WAL settings for better performance
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET max_wal_senders = 3;
ALTER SYSTEM SET wal_keep_size = '1GB';

-- Checkpoint settings
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET checkpoint_timeout = '15min';

-- Logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_duration = on;
ALTER SYSTEM SET log_min_duration_statement = 100; -- Log queries over 100ms

-- Create application user if not exists (for local deployment)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'raguser') THEN
        CREATE USER raguser WITH PASSWORD 'changethispassword';
    END IF;
END
$$;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE ragdb TO raguser;
GRANT CREATE ON SCHEMA public TO raguser;

-- Create backup user for automated backups
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'backup_user') THEN
        CREATE USER backup_user WITH PASSWORD 'backuppassword';
        GRANT CONNECT ON DATABASE ragdb TO backup_user;
        GRANT USAGE ON SCHEMA public TO backup_user;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO backup_user;
    END IF;
END
$$;

-- Reload configuration
SELECT pg_reload_conf();