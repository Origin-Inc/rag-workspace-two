#!/bin/bash

# Hetzner CPX31 Server Provisioning Script
# This script sets up a production-ready environment on Ubuntu 24.04

set -e

# Configuration
DOMAIN=${DOMAIN:-"example.com"}
ADMIN_EMAIL=${ADMIN_EMAIL:-"admin@example.com"}
SSH_PORT=${SSH_PORT:-22}
TIMEZONE=${TIMEZONE:-"UTC"}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root"
   exit 1
fi

# =============================================================================
# System Update and Basic Setup
# =============================================================================

setup_system() {
    log_info "Updating system packages..."
    apt-get update
    apt-get upgrade -y
    apt-get dist-upgrade -y
    apt-get autoremove -y
    
    log_info "Setting timezone to ${TIMEZONE}..."
    timedatectl set-timezone ${TIMEZONE}
    
    log_info "Installing essential packages..."
    apt-get install -y \
        curl \
        wget \
        git \
        vim \
        htop \
        net-tools \
        ufw \
        fail2ban \
        unattended-upgrades \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        software-properties-common \
        build-essential \
        python3-pip \
        jq \
        ncdu \
        iotop \
        sysstat
}

# =============================================================================
# Create Application User
# =============================================================================

create_app_user() {
    log_info "Creating application user..."
    
    if id "appuser" &>/dev/null; then
        log_warn "User 'appuser' already exists"
    else
        useradd -m -s /bin/bash appuser
        usermod -aG sudo appuser
        usermod -aG docker appuser 2>/dev/null || true
        
        # Set up SSH key for appuser (copy from root if exists)
        if [ -d /root/.ssh ]; then
            cp -r /root/.ssh /home/appuser/
            chown -R appuser:appuser /home/appuser/.ssh
            chmod 700 /home/appuser/.ssh
            chmod 600 /home/appuser/.ssh/authorized_keys 2>/dev/null || true
        fi
    fi
}

# =============================================================================
# Docker Installation
# =============================================================================

install_docker() {
    log_info "Installing Docker..."
    
    # Check if Docker is already installed
    if command -v docker &> /dev/null; then
        log_warn "Docker is already installed"
        return
    fi
    
    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    
    # Add Docker repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Enable Docker service
    systemctl enable docker
    systemctl start docker
    
    # Add appuser to docker group
    usermod -aG docker appuser
    
    log_info "Docker installed successfully"
}

# =============================================================================
# PostgreSQL Client Tools
# =============================================================================

install_postgres_tools() {
    log_info "Installing PostgreSQL client tools..."
    
    # Install PostgreSQL 16 client
    sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
    apt-get update
    apt-get install -y postgresql-client-16
}

# =============================================================================
# Node.js Installation (for local tools)
# =============================================================================

install_nodejs() {
    log_info "Installing Node.js 20..."
    
    # Install Node.js 20
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    
    # Install global packages
    npm install -g pm2
}

# =============================================================================
# Firewall Configuration
# =============================================================================

configure_firewall() {
    log_info "Configuring firewall..."
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH (custom port if specified)
    ufw allow ${SSH_PORT}/tcp comment 'SSH'
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    ufw allow 443/udp comment 'HTTP/3'
    
    # Allow Docker Swarm (if needed)
    # ufw allow 2377/tcp comment 'Docker Swarm'
    # ufw allow 7946/tcp comment 'Docker Swarm'
    # ufw allow 7946/udp comment 'Docker Swarm'
    # ufw allow 4789/udp comment 'Docker Overlay'
    
    # Enable firewall
    echo "y" | ufw enable
    ufw status verbose
}

# =============================================================================
# Fail2ban Configuration
# =============================================================================

configure_fail2ban() {
    log_info "Configuring Fail2ban..."
    
    # Create jail.local
    cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = ${ADMIN_EMAIL}
sendername = Fail2ban
action = %(action_mwl)s

[sshd]
enabled = true
port = ${SSH_PORT}
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[docker-nginx]
enabled = true
filter = docker-nginx
logpath = /var/lib/docker/containers/*/*-json.log
maxretry = 10
findtime = 300
bantime = 3600

[docker-caddy]
enabled = true
filter = docker-caddy
logpath = /var/lib/docker/containers/*/*-json.log
maxretry = 10
findtime = 300
bantime = 3600
EOF

    # Create custom filters
    cat > /etc/fail2ban/filter.d/docker-nginx.conf <<EOF
[Definition]
failregex = ^.*"remote_addr":"<HOST>".*"status":"(403|401|429)".*$
ignoreregex =
EOF

    cat > /etc/fail2ban/filter.d/docker-caddy.conf <<EOF
[Definition]
failregex = ^.*"remote_ip":"<HOST>".*"status":(403|401|429).*$
ignoreregex =
EOF

    # Restart fail2ban
    systemctl restart fail2ban
    systemctl enable fail2ban
}

# =============================================================================
# SSH Hardening
# =============================================================================

harden_ssh() {
    log_info "Hardening SSH configuration..."
    
    # Backup original config
    cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup
    
    # Harden SSH config
    cat > /etc/ssh/sshd_config.d/99-hardening.conf <<EOF
# SSH Hardening Configuration
Port ${SSH_PORT}
Protocol 2
PermitRootLogin prohibit-password
PubkeyAuthentication yes
PasswordAuthentication no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
PrintMotd no
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server
ClientAliveInterval 300
ClientAliveCountMax 2
MaxAuthTries 3
MaxSessions 10
LoginGraceTime 60
StrictModes yes
IgnoreRhosts yes
HostbasedAuthentication no
EOF
    
    # Test SSH config
    sshd -t
    if [ $? -eq 0 ]; then
        systemctl restart sshd
        log_info "SSH hardened successfully"
    else
        log_error "SSH configuration test failed"
        cp /etc/ssh/sshd_config.backup /etc/ssh/sshd_config
        systemctl restart sshd
    fi
}

# =============================================================================
# Automatic Security Updates
# =============================================================================

configure_auto_updates() {
    log_info "Configuring automatic security updates..."
    
    cat > /etc/apt/apt.conf.d/50unattended-upgrades <<EOF
Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}-security";
    "\${distro_id}ESMApps:\${distro_codename}-apps-security";
    "\${distro_id}ESM:\${distro_codename}-infra-security";
};
Unattended-Upgrade::Package-Blacklist {
    "docker-ce";
    "docker-ce-cli";
    "containerd.io";
    "postgresql-*";
};
Unattended-Upgrade::DevRelease "false";
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Mail "${ADMIN_EMAIL}";
Unattended-Upgrade::MailReport "on-change";
EOF

    cat > /etc/apt/apt.conf.d/20auto-upgrades <<EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

    systemctl restart unattended-upgrades
}

# =============================================================================
# System Monitoring
# =============================================================================

setup_monitoring() {
    log_info "Setting up system monitoring..."
    
    # Install monitoring tools
    apt-get install -y prometheus-node-exporter
    
    # Configure node exporter
    systemctl enable prometheus-node-exporter
    systemctl start prometheus-node-exporter
    
    # Create monitoring script
    cat > /usr/local/bin/system-monitor.sh <<'EOF'
#!/bin/bash
# System monitoring script

THRESHOLD_CPU=80
THRESHOLD_MEM=80
THRESHOLD_DISK=80

# Check CPU usage
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
if (( $(echo "$CPU_USAGE > $THRESHOLD_CPU" | bc -l) )); then
    echo "High CPU usage: ${CPU_USAGE}%" | mail -s "CPU Alert on $(hostname)" ${ADMIN_EMAIL}
fi

# Check memory usage
MEM_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
if [ $MEM_USAGE -gt $THRESHOLD_MEM ]; then
    echo "High memory usage: ${MEM_USAGE}%" | mail -s "Memory Alert on $(hostname)" ${ADMIN_EMAIL}
fi

# Check disk usage
DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt $THRESHOLD_DISK ]; then
    echo "High disk usage: ${DISK_USAGE}%" | mail -s "Disk Alert on $(hostname)" ${ADMIN_EMAIL}
fi
EOF
    
    chmod +x /usr/local/bin/system-monitor.sh
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "*/15 * * * * /usr/local/bin/system-monitor.sh") | crontab -
}

# =============================================================================
# Create Application Directory Structure
# =============================================================================

create_app_structure() {
    log_info "Creating application directory structure..."
    
    mkdir -p /opt/rag-app
    mkdir -p /opt/rag-app/backups/postgres
    mkdir -p /opt/rag-app/backups/redis
    mkdir -p /opt/rag-app/logs
    mkdir -p /opt/rag-app/monitoring
    mkdir -p /opt/rag-app/scripts
    
    chown -R appuser:appuser /opt/rag-app
    chmod 755 /opt/rag-app
}

# =============================================================================
# Install Backup Scripts
# =============================================================================

install_backup_scripts() {
    log_info "Installing backup scripts..."
    
    # PostgreSQL backup script
    cat > /opt/rag-app/scripts/backup-postgres.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/opt/rag-app/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="ragdb"
DB_USER="raguser"

# Create backup
docker exec rag-postgres-prod pg_dump -U ${DB_USER} ${DB_NAME} | gzip > ${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz

# Keep only last 7 days of backups
find ${BACKUP_DIR} -name "backup_*.sql.gz" -mtime +7 -delete

# Optional: Upload to S3 or other remote storage
# aws s3 cp ${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz s3://your-bucket/postgres-backups/
EOF
    
    # Redis backup script
    cat > /opt/rag-app/scripts/backup-redis.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/opt/rag-app/backups/redis"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup
docker exec rag-redis-prod redis-cli --pass ${REDIS_PASSWORD} BGSAVE
sleep 5
docker cp rag-redis-prod:/data/dump.rdb ${BACKUP_DIR}/dump_${TIMESTAMP}.rdb

# Keep only last 7 days of backups
find ${BACKUP_DIR} -name "dump_*.rdb" -mtime +7 -delete

# Optional: Upload to S3 or other remote storage
# aws s3 cp ${BACKUP_DIR}/dump_${TIMESTAMP}.rdb s3://your-bucket/redis-backups/
EOF
    
    chmod +x /opt/rag-app/scripts/backup-*.sh
    chown -R appuser:appuser /opt/rag-app/scripts
    
    # Add to crontab for appuser
    su - appuser -c "(crontab -l 2>/dev/null; echo '0 2 * * * /opt/rag-app/scripts/backup-postgres.sh') | crontab -"
    su - appuser -c "(crontab -l 2>/dev/null; echo '0 3 * * * /opt/rag-app/scripts/backup-redis.sh') | crontab -"
}

# =============================================================================
# System Tuning for Performance
# =============================================================================

tune_system() {
    log_info "Tuning system for performance..."
    
    # Kernel parameters for better performance
    cat >> /etc/sysctl.conf <<EOF

# Network tuning
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_congestion_control = bbr
net.core.default_qdisc = fq

# Connection handling
net.ipv4.tcp_max_syn_backlog = 4096
net.core.somaxconn = 4096
net.ipv4.ip_local_port_range = 10000 65000
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 30

# File handles
fs.file-max = 2097152
fs.nr_open = 1048576

# Swap usage
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
EOF
    
    # Apply sysctl settings
    sysctl -p
    
    # Increase file limits
    cat >> /etc/security/limits.conf <<EOF
* soft nofile 65536
* hard nofile 65536
* soft nproc 32768
* hard nproc 32768
appuser soft nofile 65536
appuser hard nofile 65536
EOF
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    log_info "Starting Hetzner CPX31 server provisioning..."
    
    # Run all setup functions
    setup_system
    create_app_user
    install_docker
    install_postgres_tools
    install_nodejs
    configure_firewall
    configure_fail2ban
    harden_ssh
    configure_auto_updates
    setup_monitoring
    create_app_structure
    install_backup_scripts
    tune_system
    
    log_info "===================================================="
    log_info "Server provisioning completed successfully!"
    log_info "===================================================="
    log_info ""
    log_info "Next steps:"
    log_info "1. Clone your application repository to /opt/rag-app"
    log_info "2. Copy and configure .env.production file"
    log_info "3. Run docker compose up -d"
    log_info "4. Configure DNS to point to this server"
    log_info ""
    log_info "Security notes:"
    log_info "- SSH is configured on port ${SSH_PORT}"
    log_info "- Root login is disabled (use 'appuser')"
    log_info "- Firewall is enabled with minimal ports open"
    log_info "- Fail2ban is monitoring for brute force attempts"
    log_info "- Automatic security updates are enabled"
    log_info ""
    log_warn "IMPORTANT: Save your server access credentials securely!"
}

# Run main function
main "$@"