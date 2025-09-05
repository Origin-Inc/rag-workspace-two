#!/bin/bash

# Migration script from Supabase to self-hosted PostgreSQL
# This script exports data from Supabase and imports it to local/Hetzner PostgreSQL

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/../backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Load environment variables
if [ -f "${SCRIPT_DIR}/../.env.production" ]; then
    export $(cat "${SCRIPT_DIR}/../.env.production" | grep -v '^#' | xargs)
fi

echo -e "${GREEN}=== Supabase to Self-Hosted Migration Script ===${NC}"

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check for required tools
    command -v pg_dump >/dev/null 2>&1 || { echo -e "${RED}pg_dump is required but not installed.${NC}" >&2; exit 1; }
    command -v psql >/dev/null 2>&1 || { echo -e "${RED}psql is required but not installed.${NC}" >&2; exit 1; }
    command -v supabase >/dev/null 2>&1 || { echo -e "${YELLOW}Warning: Supabase CLI not found. Some features may not work.${NC}" >&2; }
    
    # Check for required environment variables
    if [ -z "$SUPABASE_DB_URL" ]; then
        echo -e "${RED}SUPABASE_DB_URL not set. Please set your Supabase database URL.${NC}"
        exit 1
    fi
    
    if [ -z "$TARGET_DB_URL" ]; then
        echo -e "${YELLOW}TARGET_DB_URL not set. Using local Docker PostgreSQL.${NC}"
        TARGET_DB_URL="postgresql://raguser:${DB_PASSWORD}@localhost:5432/ragdb"
    fi
    
    echo -e "${GREEN}Prerequisites check passed.${NC}"
}

# Function to create backup directory
create_backup_dir() {
    mkdir -p "${BACKUP_DIR}/supabase"
    mkdir -p "${BACKUP_DIR}/migration"
}

# Function to export schema from Supabase
export_schema() {
    echo -e "${YELLOW}Exporting schema from Supabase...${NC}"
    
    # Export schema only (no data)
    pg_dump "${SUPABASE_DB_URL}" \
        --schema-only \
        --no-owner \
        --no-privileges \
        --no-comments \
        --exclude-schema=auth \
        --exclude-schema=storage \
        --exclude-schema=supabase_functions \
        --exclude-schema=supabase_migrations \
        --exclude-schema=extensions \
        --exclude-schema=graphql \
        --exclude-schema=graphql_public \
        --exclude-schema=realtime \
        --exclude-schema=vault \
        --file="${BACKUP_DIR}/migration/schema_${TIMESTAMP}.sql"
    
    echo -e "${GREEN}Schema exported successfully.${NC}"
}

# Function to export data from Supabase
export_data() {
    echo -e "${YELLOW}Exporting data from Supabase...${NC}"
    
    # Export data only (no schema)
    pg_dump "${SUPABASE_DB_URL}" \
        --data-only \
        --no-owner \
        --no-privileges \
        --disable-triggers \
        --exclude-schema=auth \
        --exclude-schema=storage \
        --exclude-schema=supabase_functions \
        --exclude-schema=supabase_migrations \
        --exclude-schema=extensions \
        --exclude-schema=graphql \
        --exclude-schema=graphql_public \
        --exclude-schema=realtime \
        --exclude-schema=vault \
        --file="${BACKUP_DIR}/migration/data_${TIMESTAMP}.sql"
    
    echo -e "${GREEN}Data exported successfully.${NC}"
}

# Function to export specific tables
export_tables() {
    echo -e "${YELLOW}Exporting specific application tables...${NC}"
    
    # List of application tables to export
    TABLES=(
        "users"
        "workspaces"
        "WorkspaceMember"
        "Project"
        "pages"
        "Block"
        "documents"
        "queries"
        "page_embeddings"
    )
    
    for table in "${TABLES[@]}"; do
        echo -e "  Exporting table: ${table}"
        pg_dump "${SUPABASE_DB_URL}" \
            --data-only \
            --no-owner \
            --no-privileges \
            --disable-triggers \
            --table="public.\"${table}\"" \
            --file="${BACKUP_DIR}/migration/table_${table}_${TIMESTAMP}.sql"
    done
    
    echo -e "${GREEN}Tables exported successfully.${NC}"
}

# Function to prepare target database
prepare_target_db() {
    echo -e "${YELLOW}Preparing target database...${NC}"
    
    # Check if database exists and is accessible
    psql "${TARGET_DB_URL}" -c "SELECT version();" >/dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo -e "${RED}Cannot connect to target database.${NC}"
        echo "Please ensure PostgreSQL is running and accessible."
        exit 1
    fi
    
    # Create extensions
    psql "${TARGET_DB_URL}" -c "CREATE EXTENSION IF NOT EXISTS vector;"
    psql "${TARGET_DB_URL}" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
    psql "${TARGET_DB_URL}" -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
    
    echo -e "${GREEN}Target database prepared.${NC}"
}

# Function to import schema
import_schema() {
    echo -e "${YELLOW}Importing schema to target database...${NC}"
    
    # Import schema
    psql "${TARGET_DB_URL}" < "${BACKUP_DIR}/migration/schema_${TIMESTAMP}.sql"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Schema imported successfully.${NC}"
    else
        echo -e "${RED}Schema import failed. Check the error messages above.${NC}"
        exit 1
    fi
}

# Function to import data
import_data() {
    echo -e "${YELLOW}Importing data to target database...${NC}"
    
    # Import data
    psql "${TARGET_DB_URL}" < "${BACKUP_DIR}/migration/data_${TIMESTAMP}.sql"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Data imported successfully.${NC}"
    else
        echo -e "${YELLOW}Some data import errors occurred. This may be normal for constraint violations.${NC}"
    fi
}

# Function to verify migration
verify_migration() {
    echo -e "${YELLOW}Verifying migration...${NC}"
    
    # Count records in key tables
    TABLES=("users" "workspaces" "pages" "Block" "page_embeddings")
    
    for table in "${TABLES[@]}"; do
        COUNT=$(psql "${TARGET_DB_URL}" -t -c "SELECT COUNT(*) FROM \"${table}\";")
        echo -e "  Table ${table}: ${COUNT} records"
    done
    
    echo -e "${GREEN}Migration verification complete.${NC}"
}

# Function to create migration rollback
create_rollback() {
    echo -e "${YELLOW}Creating rollback backup...${NC}"
    
    pg_dump "${TARGET_DB_URL}" \
        --clean \
        --if-exists \
        --file="${BACKUP_DIR}/migration/rollback_${TIMESTAMP}.sql"
    
    echo -e "${GREEN}Rollback backup created.${NC}"
}

# Main execution
main() {
    echo -e "${GREEN}Starting migration from Supabase to self-hosted PostgreSQL${NC}"
    echo -e "Timestamp: ${TIMESTAMP}"
    echo ""
    
    check_prerequisites
    create_backup_dir
    
    # Step 1: Export from Supabase
    echo -e "\n${GREEN}Step 1: Export from Supabase${NC}"
    export_schema
    export_data
    export_tables
    
    # Step 2: Prepare target database
    echo -e "\n${GREEN}Step 2: Prepare target database${NC}"
    prepare_target_db
    
    # Step 3: Import to target
    echo -e "\n${GREEN}Step 3: Import to target database${NC}"
    
    read -p "Do you want to proceed with import? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        import_schema
        import_data
        verify_migration
        create_rollback
        
        echo -e "\n${GREEN}=== Migration Complete ===${NC}"
        echo -e "Backup files saved in: ${BACKUP_DIR}/migration/"
        echo -e "Rollback file: rollback_${TIMESTAMP}.sql"
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo "1. Test your application with the new database"
        echo "2. Update your .env files to point to the new database"
        echo "3. If everything works, you can disable the Supabase connection"
        echo "4. Keep the rollback file for at least 7 days"
    else
        echo -e "${YELLOW}Migration cancelled.${NC}"
    fi
}

# Run main function
main "$@"