#!/bin/bash

# Simple webhook server for auto-deployment
# Run this on your Hetzner server

cat > /opt/rag-app/deploy.sh << 'EOF'
#!/bin/bash
cd /opt/rag-app

# Log deployment
echo "$(date): Starting deployment" >> /opt/rag-app/deploy.log

# Pull latest changes
git pull origin main >> /opt/rag-app/deploy.log 2>&1

# Build and restart
docker compose -f docker-compose.production.yml build >> /opt/rag-app/deploy.log 2>&1
docker compose -f docker-compose.production.yml down >> /opt/rag-app/deploy.log 2>&1
docker compose -f docker-compose.production.yml up -d >> /opt/rag-app/deploy.log 2>&1

# Run migrations
docker exec rag-app npx prisma migrate deploy >> /opt/rag-app/deploy.log 2>&1

echo "$(date): Deployment completed" >> /opt/rag-app/deploy.log
EOF

chmod +x /opt/rag-app/deploy.sh

# Create a simple webhook listener
cat > /etc/systemd/system/deploy-webhook.service << 'EOF'
[Unit]
Description=Deployment Webhook
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/rag-app
ExecStart=/usr/bin/python3 -m http.server 9001
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable deploy-webhook
systemctl start deploy-webhook