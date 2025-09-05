# Hetzner Deployment Guide

This guide covers deploying the RAG application to a Hetzner CPX31 VPS, migrating from Supabase/Upstash to a self-hosted solution.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Server Provisioning](#server-provisioning)
- [Database Migration](#database-migration)
- [Application Deployment](#application-deployment)
- [Monitoring Setup](#monitoring-setup)
- [Rollback Procedures](#rollback-procedures)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Local Requirements
- SSH key pair for server access
- Git repository with your application code
- PostgreSQL client tools (for migration)
- Docker and Docker Compose (for local testing)

### Server Requirements
- Hetzner CPX31 or similar (4 vCPU, 8GB RAM, 160GB NVMe)
- Ubuntu 24.04 LTS
- Domain name pointed to server IP
- Cloudflare account (optional, for DNS and CDN)

## Server Provisioning

### 1. Create Hetzner Server

1. Log in to Hetzner Cloud Console
2. Create new server:
   - Type: CPX31
   - Image: Ubuntu 24.04
   - Location: Choose closest to your users
   - SSH Key: Add your public key
   - Name: `rag-app-prod`

### 2. Initial Server Setup

SSH into your new server:
```bash
ssh root@YOUR_SERVER_IP
```

Run the provisioning script:
```bash
# Download and run provisioning script
curl -O https://raw.githubusercontent.com/YOUR_REPO/main/scripts/provision-hetzner.sh
chmod +x provision-hetzner.sh

# Configure environment variables
export DOMAIN="your-domain.com"
export ADMIN_EMAIL="admin@your-domain.com"
export SSH_PORT="22"  # Change for security

# Run provisioning
./provision-hetzner.sh
```

The script will:
- Update system packages
- Install Docker and Docker Compose
- Configure firewall (UFW)
- Setup Fail2ban
- Harden SSH configuration
- Install monitoring tools
- Create application user
- Setup automatic backups

### 3. DNS Configuration

Point your domain to the server:
```
A Record: @ -> YOUR_SERVER_IP
A Record: www -> YOUR_SERVER_IP
A Record: grafana -> YOUR_SERVER_IP
```

## Database Migration

### 1. Export from Supabase

On your local machine:
```bash
# Set environment variables
export SUPABASE_DB_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
export TARGET_DB_URL="postgresql://raguser:PASSWORD@YOUR_SERVER_IP:5432/ragdb"

# Run migration script
cd scripts
./migrate-from-supabase.sh
```

### 2. Verify Migration

Connect to the new database:
```bash
psql $TARGET_DB_URL -c "SELECT COUNT(*) FROM \"Page\";"
psql $TARGET_DB_URL -c "SELECT COUNT(*) FROM page_embeddings;"
```

## Application Deployment

### 1. Prepare Environment

On the server:
```bash
# Switch to app user
su - appuser

# Clone repository
cd /opt/rag-app
git clone YOUR_REPOSITORY_URL .
git checkout main

# Create production environment file
cp .env.production.example .env.production
nano .env.production  # Edit with your values
```

### 2. Configure Environment Variables

Essential variables to set:
```env
# Domain
DOMAIN=your-domain.com
ADMIN_EMAIL=admin@your-domain.com

# Database (using local PostgreSQL)
DB_USER=raguser
DB_PASSWORD=strong_password_here
DB_NAME=ragdb
DATABASE_URL=postgresql://raguser:${DB_PASSWORD}@postgres:5432/ragdb?schema=public

# Redis (using local Redis)
REDIS_PROVIDER=local
REDIS_PASSWORD=strong_redis_password
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

# OpenAI
OPENAI_API_KEY=sk-...your-key-here

# Security (generate unique values!)
SESSION_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_SECRET=$(openssl rand -hex 32)

# Monitoring
GRAFANA_PASSWORD=strong_grafana_password
```

### 3. Deploy Application

Using the deployment script:
```bash
# From your local machine
export REMOTE_HOST=YOUR_SERVER_IP
export REPO_URL=https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Deploy
./scripts/deploy.sh deploy

# Check status
./scripts/deploy.sh status

# View logs
./scripts/deploy.sh logs app
```

Or manually on the server:
```bash
cd /opt/rag-app

# Build and start services
docker compose -f docker-compose.production.yml up -d --build

# Run database migrations
docker compose -f docker-compose.production.yml exec app npx prisma migrate deploy

# Check health
docker compose -f docker-compose.production.yml ps
curl http://localhost:3000/api/health
```

## Monitoring Setup

### 1. Access Grafana

Navigate to: `https://grafana.your-domain.com`
- Username: `admin`
- Password: Set in `.env.production`

### 2. Import Dashboards

1. Go to Dashboards → Import
2. Import these dashboard IDs:
   - `1860` - Node Exporter Full
   - `11835` - PostgreSQL Database
   - `11692` - Redis Dashboard
   - `13333` - Docker Monitoring

### 3. Configure Alerts

Set up alerts for:
- CPU usage > 80%
- Memory usage > 80%
- Disk usage > 80%
- Service health checks failing
- Database connection pool exhaustion

## Rollback Procedures

### Quick Rollback (Previous Docker Images)

If the latest deployment fails:
```bash
# On the server
cd /opt/rag-app

# Stop current containers
docker compose -f docker-compose.production.yml down

# Start with previous images
docker compose -f docker-compose.production.yml up -d --no-build

# Verify health
docker compose -f docker-compose.production.yml ps
```

### Full Rollback (From Backup)

If data corruption or major issues:
```bash
# List available backups
ls -lh /opt/rag-app/backups/deployments/

# Restore from backup
tar xzf /opt/rag-app/backups/deployments/backup_TIMESTAMP.tar.gz -C /

# Restart services
cd /opt/rag-app
docker compose -f docker-compose.production.yml up -d
```

### Database Rollback

Restore database from backup:
```bash
# Stop application
docker compose -f docker-compose.production.yml stop app worker

# Restore database
gunzip < /opt/rag-app/backups/postgres/backup_TIMESTAMP.sql.gz | \
  docker exec -i rag-postgres-prod psql -U raguser ragdb

# Restart application
docker compose -f docker-compose.production.yml start app worker
```

### Emergency Fallback to Managed Services

If self-hosted infrastructure fails:

1. **Switch to Supabase Database:**
```bash
# Update .env.production
DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres

# Restart application
docker compose -f docker-compose.production.yml restart app worker
```

2. **Switch to Upstash Redis:**
```bash
# Update .env.production
REDIS_PROVIDER=upstash
UPSTASH_REDIS_REST_URL=https://YOUR_ENDPOINT.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Restart application
docker compose -f docker-compose.production.yml restart app worker
```

3. **Deploy to Vercel/Railway:**
```bash
# Push to GitHub
git push origin main

# Deploy via platform dashboard or CLI
vercel --prod
# or
railway up
```

## Maintenance

### Daily Tasks
- Monitor Grafana dashboards
- Check application logs for errors
- Verify backup completion

### Weekly Tasks
- Review security logs (Fail2ban)
- Check disk usage
- Update dependencies (security patches)

### Monthly Tasks
- Review and optimize database
- Analyze performance metrics
- Test disaster recovery procedure

### Backup Schedule
Automated via cron:
- PostgreSQL: Daily at 2 AM
- Redis: Daily at 3 AM
- Full application: Weekly on Sunday

Manual backup:
```bash
# Database backup
docker exec rag-postgres-prod pg_dump -U raguser ragdb | \
  gzip > /opt/rag-app/backups/postgres/manual_$(date +%Y%m%d_%H%M%S).sql.gz

# Redis backup
docker exec rag-redis-prod redis-cli --pass $REDIS_PASSWORD BGSAVE
docker cp rag-redis-prod:/data/dump.rdb /opt/rag-app/backups/redis/manual_$(date +%Y%m%d_%H%M%S).rdb
```

## Troubleshooting

### Application Not Starting

Check logs:
```bash
docker compose -f docker-compose.production.yml logs app
docker compose -f docker-compose.production.yml logs postgres
docker compose -f docker-compose.production.yml logs redis
```

Common issues:
- Missing environment variables
- Database connection failed
- Port already in use
- Insufficient memory

### Database Issues

Check PostgreSQL:
```bash
# Check if running
docker compose -f docker-compose.production.yml ps postgres

# Check logs
docker compose -f docker-compose.production.yml logs postgres

# Connect to database
docker compose -f docker-compose.production.yml exec postgres psql -U raguser ragdb

# Check connections
SELECT count(*) FROM pg_stat_activity;
```

### Redis Issues

Check Redis:
```bash
# Check if running
docker compose -f docker-compose.production.yml ps redis

# Check logs
docker compose -f docker-compose.production.yml logs redis

# Connect to Redis
docker compose -f docker-compose.production.yml exec redis redis-cli --pass $REDIS_PASSWORD

# Check memory
INFO memory
```

### Performance Issues

1. Check resource usage:
```bash
docker stats
htop
df -h
```

2. Check database slow queries:
```sql
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

3. Check Redis slow log:
```bash
docker compose exec redis redis-cli --pass $REDIS_PASSWORD SLOWLOG GET 10
```

### SSL Certificate Issues

If Caddy fails to obtain certificates:
```bash
# Check Caddy logs
docker compose -f docker-compose.production.yml logs caddy

# Restart Caddy
docker compose -f docker-compose.production.yml restart caddy

# Manual certificate request
docker compose exec caddy caddy trust
```

## Security Checklist

- [ ] SSH key-only authentication enabled
- [ ] Firewall configured (UFW)
- [ ] Fail2ban active
- [ ] Automatic security updates enabled
- [ ] Database passwords changed from defaults
- [ ] Application secrets are unique and strong
- [ ] SSL certificates active
- [ ] Monitoring and alerting configured
- [ ] Backup encryption enabled
- [ ] Regular security audits scheduled

## Cost Comparison

### Previous Setup (Managed Services)
- Supabase: $25/month
- Upstash Redis: $30/month
- **Total: $55/month**
- Limitations: Request size limits, Redis eviction

### Current Setup (Hetzner)
- CPX31 Server: €15.90/month (~$17)
- Domain: ~$12/year (~$1/month)
- **Total: ~$18/month**
- Benefits: No limits, full control, better performance

### Annual Savings
- **~$444/year** (70% reduction)
- Plus: Better performance and reliability

## Support and Resources

- [Hetzner Documentation](https://docs.hetzner.com/)
- [Docker Documentation](https://docs.docker.com/)
- [PostgreSQL with pgvector](https://github.com/pgvector/pgvector)
- [Caddy Documentation](https://caddyserver.com/docs/)
- [Grafana Documentation](https://grafana.com/docs/)

## Emergency Contacts

Configure these in your monitoring:
- Email: admin@your-domain.com
- Slack webhook: (if configured)
- PagerDuty: (if configured)