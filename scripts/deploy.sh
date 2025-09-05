#!/bin/bash

# Production Deployment Script for RAG Application
# Deploys the application to Hetzner CPX31 server

set -e

# Configuration
REMOTE_USER=${REMOTE_USER:-"appuser"}
REMOTE_HOST=${REMOTE_HOST:-""}
REMOTE_PORT=${REMOTE_PORT:-"22"}
APP_DIR="/opt/rag-app"
REPO_URL=${REPO_URL:-""}
BRANCH=${BRANCH:-"main"}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    if [ -z "$REMOTE_HOST" ]; then
        log_error "REMOTE_HOST not set. Please provide the server IP or hostname."
        exit 1
    fi
    
    if [ -z "$REPO_URL" ]; then
        log_error "REPO_URL not set. Please provide the Git repository URL."
        exit 1
    fi
    
    # Test SSH connection
    ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "echo 'SSH connection successful'" || {
        log_error "Cannot connect to remote server via SSH"
        exit 1
    }
}

# Deploy application
deploy_app() {
    log_info "Starting deployment to ${REMOTE_HOST}..."
    
    # Create deployment script
    cat > /tmp/deploy_remote.sh <<'SCRIPT'
#!/bin/bash
set -e

APP_DIR="/opt/rag-app"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=== Starting deployment on remote server ==="

# Clone or update repository
if [ ! -d "${APP_DIR}/.git" ]; then
    echo "Cloning repository..."
    git clone ${REPO_URL} ${APP_DIR}
    cd ${APP_DIR}
    git checkout ${BRANCH}
else
    echo "Updating repository..."
    cd ${APP_DIR}
    git fetch origin
    git checkout ${BRANCH}
    git pull origin ${BRANCH}
fi

# Check for .env.production
if [ ! -f "${APP_DIR}/.env.production" ]; then
    echo "ERROR: .env.production file not found!"
    echo "Please create .env.production from .env.production.example"
    exit 1
fi

# Backup current deployment
if [ -d "${APP_DIR}/docker-compose.production.yml" ]; then
    echo "Creating backup of current deployment..."
    mkdir -p ${APP_DIR}/backups/deployments
    tar czf ${APP_DIR}/backups/deployments/backup_${TIMESTAMP}.tar.gz \
        --exclude='backups' \
        --exclude='node_modules' \
        --exclude='logs' \
        ${APP_DIR}
fi

# Build and deploy with Docker Compose
echo "Building Docker images..."
cd ${APP_DIR}
docker compose -f docker-compose.production.yml build

echo "Stopping current containers..."
docker compose -f docker-compose.production.yml down

echo "Starting new containers..."
docker compose -f docker-compose.production.yml up -d

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
sleep 10

# Run database migrations
echo "Running database migrations..."
docker compose -f docker-compose.production.yml exec -T app npx prisma migrate deploy || true

# Health check
echo "Performing health check..."
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml exec -T app curl -f http://localhost:3000/api/health || {
    echo "Health check failed!"
    exit 1
}

echo "=== Deployment completed successfully ==="
SCRIPT
    
    # Copy and execute deployment script
    scp -P ${REMOTE_PORT} /tmp/deploy_remote.sh ${REMOTE_USER}@${REMOTE_HOST}:/tmp/
    ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} "REPO_URL='${REPO_URL}' BRANCH='${BRANCH}' bash /tmp/deploy_remote.sh"
    
    # Cleanup
    rm /tmp/deploy_remote.sh
}

# Rollback deployment
rollback() {
    log_info "Starting rollback..."
    
    ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} <<'ROLLBACK'
    cd /opt/rag-app
    
    # List available backups
    echo "Available backups:"
    ls -lh backups/deployments/*.tar.gz 2>/dev/null || {
        echo "No backups found!"
        exit 1
    }
    
    # Get latest backup
    LATEST_BACKUP=$(ls -t backups/deployments/*.tar.gz | head -1)
    echo "Rolling back to: ${LATEST_BACKUP}"
    
    # Stop current containers
    docker compose -f docker-compose.production.yml down
    
    # Restore backup
    tar xzf ${LATEST_BACKUP} -C /
    
    # Start containers
    cd /opt/rag-app
    docker compose -f docker-compose.production.yml up -d
    
    echo "Rollback completed"
ROLLBACK
}

# View logs
view_logs() {
    log_info "Viewing application logs..."
    
    ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} \
        "cd /opt/rag-app && docker compose -f docker-compose.production.yml logs -f --tail=100 $1"
}

# Status check
status() {
    log_info "Checking application status..."
    
    ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} <<'STATUS'
    echo "=== Docker Containers ==="
    cd /opt/rag-app
    docker compose -f docker-compose.production.yml ps
    
    echo -e "\n=== Resource Usage ==="
    docker stats --no-stream
    
    echo -e "\n=== Health Checks ==="
    docker compose -f docker-compose.production.yml exec -T app curl -s http://localhost:3000/api/health || echo "App health check failed"
    docker compose -f docker-compose.production.yml exec -T postgres pg_isready || echo "PostgreSQL health check failed"
    docker compose -f docker-compose.production.yml exec -T redis redis-cli ping || echo "Redis health check failed"
    
    echo -e "\n=== Disk Usage ==="
    df -h /
    
    echo -e "\n=== Memory Usage ==="
    free -h
STATUS
}

# Database operations
db_operation() {
    case $1 in
        backup)
            log_info "Creating database backup..."
            ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} \
                "cd /opt/rag-app && bash scripts/backup-postgres.sh"
            ;;
        restore)
            log_info "Restoring database..."
            if [ -z "$2" ]; then
                log_error "Please provide backup file name"
                exit 1
            fi
            ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} \
                "cd /opt/rag-app && docker compose -f docker-compose.production.yml exec -T postgres psql -U raguser ragdb < backups/postgres/$2"
            ;;
        migrate)
            log_info "Running database migrations..."
            ssh -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST} \
                "cd /opt/rag-app && docker compose -f docker-compose.production.yml exec -T app npx prisma migrate deploy"
            ;;
        *)
            log_error "Unknown database operation: $1"
            exit 1
            ;;
    esac
}

# Main menu
show_menu() {
    echo -e "\n${BLUE}=== RAG Application Deployment Tool ===${NC}"
    echo "1) Deploy application"
    echo "2) Rollback to previous version"
    echo "3) View logs"
    echo "4) Check status"
    echo "5) Database backup"
    echo "6) Database restore"
    echo "7) Run migrations"
    echo "8) Exit"
    echo -n "Select option: "
}

# Interactive mode
interactive() {
    while true; do
        show_menu
        read -r option
        
        case $option in
            1)
                deploy_app
                ;;
            2)
                rollback
                ;;
            3)
                echo -n "Service name (app/worker/postgres/redis/caddy): "
                read -r service
                view_logs $service
                ;;
            4)
                status
                ;;
            5)
                db_operation backup
                ;;
            6)
                echo -n "Backup file name: "
                read -r backup_file
                db_operation restore $backup_file
                ;;
            7)
                db_operation migrate
                ;;
            8)
                exit 0
                ;;
            *)
                log_error "Invalid option"
                ;;
        esac
    done
}

# Parse command line arguments
case ${1:-} in
    deploy)
        check_prerequisites
        deploy_app
        ;;
    rollback)
        check_prerequisites
        rollback
        ;;
    logs)
        check_prerequisites
        view_logs ${2:-app}
        ;;
    status)
        check_prerequisites
        status
        ;;
    db)
        check_prerequisites
        db_operation ${2:-backup} ${3:-}
        ;;
    interactive|menu)
        check_prerequisites
        interactive
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|logs [service]|status|db {backup|restore|migrate}|interactive}"
        echo ""
        echo "Environment variables:"
        echo "  REMOTE_HOST - Server IP or hostname (required)"
        echo "  REMOTE_USER - SSH user (default: appuser)"
        echo "  REMOTE_PORT - SSH port (default: 22)"
        echo "  REPO_URL    - Git repository URL (required for deploy)"
        echo "  BRANCH      - Git branch (default: main)"
        echo ""
        echo "Examples:"
        echo "  REMOTE_HOST=1.2.3.4 REPO_URL=https://github.com/user/repo.git $0 deploy"
        echo "  REMOTE_HOST=1.2.3.4 $0 status"
        echo "  REMOTE_HOST=1.2.3.4 $0 logs app"
        echo "  REMOTE_HOST=1.2.3.4 $0 interactive"
        exit 1
        ;;
esac