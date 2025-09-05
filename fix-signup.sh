#!/bin/bash

# Script to fix signup issue on Hetzner server
echo "🔧 Fixing signup permissions issue..."

# SSH to server and run fixes
ssh -i ~/.ssh/hetzner_ed25519 root@178.156.186.87 << 'EOF'
cd /opt/rag-app

echo "📋 Checking current database state..."
docker exec rag-postgres psql -U raguser ragdb -c "SELECT COUNT(*) as role_count FROM roles;"
docker exec rag-postgres psql -U raguser ragdb -c "SELECT COUNT(*) as perm_count FROM permissions;"

echo "🌱 Running database seed to populate permissions..."
docker exec rag-app npx prisma db seed || echo "Seed might have partially failed, continuing..."

echo "🔄 Restarting application..."
docker restart rag-app

echo "⏳ Waiting for app to start..."
sleep 10

echo "✅ Checking health..."
curl -s http://localhost:3000/api/health | grep "healthy" && echo "App is healthy!"

echo "📊 Final database state:"
docker exec rag-postgres psql -U raguser ragdb -c "SELECT * FROM roles;"
docker exec rag-postgres psql -U raguser ragdb -c "SELECT COUNT(*) FROM permissions;"

echo "✨ Fix complete! Try signing up now at https://odeun.tech/auth/signup"
EOF