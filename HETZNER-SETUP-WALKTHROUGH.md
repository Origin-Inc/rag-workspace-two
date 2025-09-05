# Complete Hetzner Server Setup Walkthrough

This guide walks you through setting up a Hetzner CPX31 server for your RAG application, from account creation to fully deployed application.

## Table of Contents
1. [Account Setup & Credits](#1-account-setup--credits)
2. [SSH Key Preparation](#2-ssh-key-preparation)
3. [Creating the Server](#3-creating-the-server)
4. [Initial Server Connection](#4-initial-server-connection)
5. [Server Provisioning](#5-server-provisioning)
6. [Application Setup](#6-application-setup)
7. [Database Migration](#7-database-migration)
8. [Going Live](#8-going-live)
9. [Verification & Testing](#9-verification--testing)

---

## 1. Account Setup & Credits

### Create Hetzner Account
1. Go to [https://www.hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Click "Register now" 
3. **Important**: New customers get €20 free credit (valid for 3 months until Dec 31, 2025)
4. Complete registration with:
   - Valid email address
   - Phone number for verification
   - Payment method (credit card or PayPal)

### Verify Account
1. Check email for verification link
2. Confirm phone number via SMS
3. Log in to [Hetzner Cloud Console](https://console.hetzner.cloud)

### Create Project
1. In Cloud Console, click "New Project"
2. Name it: `rag-production`
3. Select project to enter dashboard

---

## 2. SSH Key Preparation

### Generate SSH Key (if you don't have one)

**On Mac/Linux:**
```bash
# Generate Ed25519 key (recommended)
ssh-keygen -t ed25519 -C "your-email@example.com" -f ~/.ssh/hetzner_ed25519

# Or RSA key (fallback)
ssh-keygen -t rsa -b 4096 -C "your-email@example.com" -f ~/.ssh/hetzner_rsa
```

**On Windows (PowerShell):**
```powershell
ssh-keygen -t ed25519 -C "your-email@example.com" -f $env:USERPROFILE\.ssh\hetzner_ed25519
```

### Add SSH Key to Hetzner
1. In Cloud Console, go to "Security" → "SSH Keys"
2. Click "Add SSH Key"
3. Copy your public key:
   ```bash
   cat ~/.ssh/hetzner_ed25519.pub
   ```
4. Paste the key in the text field
5. Name it: `main-key` or your computer name
6. Click "Add SSH Key"

---

## 3. Creating the Server

### Server Configuration
1. In your project, click "Add Server"
2. Configure as follows:

**Location:**
- Choose closest to your users
- Recommended: Falkenstein (Germany) for EU
- Or Ashburn (USA) for North America

**Image:**
- Select: **Ubuntu 24.04**

**Type:**
- Select: **CPX31** (Shared vCPU)
- Specs: 4 vCPU, 8GB RAM, 160GB NVMe SSD
- Cost: €15.90/month (or hourly €0.024)

**Volume:** 
- Skip for now (can add later if needed)

**Network:**
- Leave as default (public IPv4 + IPv6)

**Firewalls:**
- Skip (we'll configure UFW later)

**SSH Keys:**
- **Select your SSH key** (IMPORTANT!)
- This is your only way to access the server

**Cloud Config:**
- Leave empty (we'll use our script)

**Name:**
- Enter: `rag-app-prod`

**Labels:** (optional)
- Add: `environment:production`
- Add: `app:rag`

3. Click **"Create & Buy Now"**

### Wait for Server Creation
- Takes about 10-30 seconds
- Note your server IP address (e.g., `157.90.xxx.xxx`)
- Server will appear in dashboard with status "Running"

---

## 4. Initial Server Connection

### First SSH Connection
```bash
# Test connection (replace with your server IP)
ssh -i ~/.ssh/hetzner_ed25519 root@YOUR_SERVER_IP

# You'll see a fingerprint warning:
# The authenticity of host 'YOUR_SERVER_IP' can't be established.
# ED25519 key fingerprint is SHA256:xxxxxxxxxxxxxxxxxxxxx
# Are you sure you want to continue connecting (yes/no)?

# Type: yes
```

### Verify Server
Once connected:
```bash
# Check system
lsb_release -a
# Should show: Ubuntu 24.04 LTS

# Check resources
free -h
df -h
nproc

# Update system
apt update && apt upgrade -y
```

---

## 5. Server Provisioning

### Download and Configure Provisioning Script
```bash
# Download provisioning script
cd /root
wget https://raw.githubusercontent.com/YOUR_USERNAME/rag-workspace-two/main/scripts/provision-hetzner.sh
chmod +x provision-hetzner.sh

# Set configuration
export DOMAIN="your-domain.com"  # Replace with your domain
export ADMIN_EMAIL="admin@your-domain.com"  # Your email
export SSH_PORT="22"  # Keep default or change for security
```

### Run Provisioning
```bash
# Execute provisioning (takes 5-10 minutes)
./provision-hetzner.sh

# The script will:
# ✓ Update system packages
# ✓ Install Docker & Docker Compose
# ✓ Create 'appuser' account
# ✓ Configure firewall (UFW)
# ✓ Setup Fail2ban
# ✓ Install PostgreSQL client tools
# ✓ Configure automatic backups
# ✓ Harden SSH
# ✓ Setup monitoring
```

### Switch to App User
```bash
# After provisioning completes
su - appuser
cd /opt/rag-app
```

---

## 6. Application Setup

### Clone Repository
```bash
# As appuser in /opt/rag-app
git clone https://github.com/YOUR_USERNAME/rag-workspace-two.git .
git checkout main  # or your production branch
```

### Configure Environment
```bash
# Copy example environment file
cp .env.production.example .env.production

# Edit with your values
nano .env.production
```

**Essential Environment Variables:**
```env
# Domain Configuration
DOMAIN=your-domain.com
ADMIN_EMAIL=admin@your-domain.com

# Database (Local PostgreSQL)
DB_USER=raguser
DB_PASSWORD=CHANGE_THIS_USE_STRONG_PASSWORD_HERE
DB_NAME=ragdb

# Use local PostgreSQL (not Supabase yet)
DATABASE_URL=postgresql://raguser:${DB_PASSWORD}@postgres:5432/ragdb?schema=public
DIRECT_URL=postgresql://raguser:${DB_PASSWORD}@postgres:5432/ragdb?schema=public

# Redis Configuration
REDIS_PASSWORD=CHANGE_THIS_USE_STRONG_REDIS_PASSWORD
REDIS_PROVIDER=local
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

# OpenAI (REQUIRED - Copy from Vercel/current setup)
OPENAI_API_KEY=sk-...your-actual-key-here

# Security (Generate unique values!)
SESSION_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_SECRET=$(openssl rand -hex 32)

# Application
NODE_ENV=production
APP_URL=https://your-domain.com
ENABLE_INDEXING_WORKER=true

# Monitoring
GRAFANA_PASSWORD=CHANGE_THIS_GRAFANA_PASSWORD
```

Save and exit (Ctrl+X, Y, Enter)

### Start Services
```bash
# Build and start all services
docker compose -f docker-compose.production.yml up -d --build

# This will:
# - Download Docker images
# - Build your application
# - Start PostgreSQL with pgvector
# - Start Redis
# - Start your app
# - Start Caddy (reverse proxy)
# - Takes 3-5 minutes first time

# Check status
docker compose -f docker-compose.production.yml ps

# View logs
docker compose -f docker-compose.production.yml logs -f app
```

---

## 7. Database Migration

### Prepare Migration on Local Machine
```bash
# On your LOCAL computer (not server)
cd ~/Projects/rag-workspace-two

# Set migration variables
export SUPABASE_DB_URL="postgresql://postgres:YOUR_SUPABASE_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres"
export TARGET_DB_URL="postgresql://raguser:YOUR_DB_PASSWORD@YOUR_SERVER_IP:5432/ragdb"

# Test connections
psql $SUPABASE_DB_URL -c "SELECT COUNT(*) FROM \"User\";"
psql $TARGET_DB_URL -c "SELECT version();"
```

### Run Migration
```bash
# Execute migration script
./scripts/migrate-from-supabase.sh

# The script will:
# 1. Export schema from Supabase
# 2. Export data from all tables
# 3. Create backup files
# 4. Import to Hetzner PostgreSQL
# 5. Verify migration

# When prompted: "Do you want to proceed with import? (y/n)"
# Type: y
```

### Apply Prisma Migrations
On the server:
```bash
# As appuser on server
cd /opt/rag-app
docker compose -f docker-compose.production.yml exec app npx prisma migrate deploy

# Generate Prisma client
docker compose -f docker-compose.production.yml exec app npx prisma generate
```

---

## 8. Going Live

### DNS Configuration

#### Using Cloudflare (Recommended)
1. Log in to Cloudflare
2. Select your domain
3. Go to DNS settings
4. Add records:
   ```
   Type  Name      Content           Proxy
   A     @         YOUR_SERVER_IP    ✓ Proxied
   A     www       YOUR_SERVER_IP    ✓ Proxied  
   A     grafana   YOUR_SERVER_IP    ✓ Proxied
   ```

#### Using Other DNS Provider
Add these records:
```
A     @         YOUR_SERVER_IP    
A     www       YOUR_SERVER_IP    
A     grafana   YOUR_SERVER_IP
```

### Wait for DNS Propagation
```bash
# Check DNS (from your local computer)
nslookup your-domain.com
ping your-domain.com

# Should return your server IP
```

### SSL Certificate Generation
Caddy will automatically get SSL certificates when first accessed:
```bash
# On server, check Caddy logs
docker compose -f docker-compose.production.yml logs caddy

# You should see:
# "certificate obtained successfully"
# "served key authentication certificate"
```

---

## 9. Verification & Testing

### Health Checks
```bash
# From server
curl http://localhost:3000/api/health
# Should return: {"status":"ok"}

# From your computer
curl https://your-domain.com/api/health
# Should return: {"status":"ok"}
```

### Test Application Features

1. **Access your app:**
   - Open browser: `https://your-domain.com`
   - Should see your RAG application

2. **Test authentication:**
   - Try logging in with existing account
   - Create new account if needed

3. **Test RAG features:**
   - Create a new page
   - Add content
   - Test AI responses
   - Verify indexing works

4. **Access monitoring:**
   - Go to: `https://grafana.your-domain.com`
   - Login: admin / YOUR_GRAFANA_PASSWORD
   - Import dashboards

### Monitor Initial Performance
```bash
# On server
docker stats

# Check logs for errors
docker compose -f docker-compose.production.yml logs --tail=50 app
docker compose -f docker-compose.production.yml logs --tail=50 worker
docker compose -f docker-compose.production.yml logs --tail=50 postgres
```

---

## Post-Setup Checklist

- [ ] Server is accessible via SSH
- [ ] Docker services are running
- [ ] Database migrated successfully
- [ ] Application accessible via HTTPS
- [ ] SSL certificates working
- [ ] Authentication working
- [ ] RAG indexing functional
- [ ] Monitoring accessible
- [ ] Backups configured
- [ ] Firewall enabled
- [ ] Fail2ban active

---

## Troubleshooting Common Issues

### Cannot SSH to Server
```bash
# Check if using correct key
ssh -i ~/.ssh/hetzner_ed25519 -v root@YOUR_SERVER_IP

# If permission denied, check Hetzner Console VNC
```

### Docker Compose Fails
```bash
# Check Docker status
systemctl status docker

# Restart Docker
systemctl restart docker

# Check disk space
df -h
```

### Database Connection Failed
```bash
# Test local connection
docker compose -f docker-compose.production.yml exec postgres psql -U raguser ragdb

# Check PostgreSQL logs
docker compose -f docker-compose.production.yml logs postgres
```

### Application Not Accessible
```bash
# Check if app is running
docker compose -f docker-compose.production.yml ps

# Check Caddy (reverse proxy)
docker compose -f docker-compose.production.yml logs caddy

# Test without proxy
curl http://localhost:3000
```

### SSL Certificate Issues
```bash
# Restart Caddy to retry
docker compose -f docker-compose.production.yml restart caddy

# Check DNS is pointing correctly
dig your-domain.com
```

---

## Daily Operations

### View Logs
```bash
# Application logs
docker compose -f docker-compose.production.yml logs -f app

# All services
docker compose -f docker-compose.production.yml logs -f
```

### Restart Services
```bash
# Restart specific service
docker compose -f docker-compose.production.yml restart app

# Restart all
docker compose -f docker-compose.production.yml restart
```

### Update Application
```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.production.yml up -d --build
```

### Backup Database
```bash
# Manual backup
docker exec rag-postgres-prod pg_dump -U raguser ragdb | gzip > backup_$(date +%Y%m%d).sql.gz
```

---

## Emergency Procedures

### If Server Becomes Inaccessible
1. Use Hetzner Console VNC access
2. Check firewall: `ufw status`
3. Check fail2ban: `fail2ban-client status`

### If Need to Rollback to Supabase
```bash
# Update .env.production
DATABASE_URL=YOUR_OLD_SUPABASE_URL
REDIS_PROVIDER=upstash
UPSTASH_REDIS_REST_URL=YOUR_UPSTASH_URL
UPSTASH_REDIS_REST_TOKEN=YOUR_UPSTASH_TOKEN

# Restart services
docker compose -f docker-compose.production.yml restart app worker
```

---

## Support Resources

- **Hetzner Support**: support@hetzner.com
- **Hetzner Status**: https://status.hetzner.com
- **Community Forum**: https://community.hetzner.com
- **Your Backups**: `/opt/rag-app/backups/`
- **Server Metrics**: https://grafana.your-domain.com

---

## Cost Summary

### Monthly Costs
- Hetzner CPX31: €15.90 (~$17)
- Domain (annual/12): ~$1
- **Total: ~$18/month**

### Compared to Previous
- Was: $55/month (Supabase + Upstash)
- Now: $18/month
- **Savings: $37/month ($444/year)**

---

## Next Steps After Setup

1. **Set up monitoring alerts** in Grafana
2. **Configure backup to S3/B2** for offsite storage
3. **Set up status page** for users
4. **Document your specific customizations**
5. **Schedule monthly maintenance windows**
6. **Keep Supabase active for 1 week** as fallback

---

Congratulations! Your RAG application is now running on your own infrastructure with 70% cost savings and full control! 🎉