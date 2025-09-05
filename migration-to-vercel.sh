#!/bin/bash

echo "🔄 Migration Checklist: Hetzner → Vercel + Supabase + Railway"
echo "============================================================"
echo ""
echo "Step 1: Update Environment Variables"
echo "-------------------------------------"
echo "In your .env.local file, update:"
echo ""
cat << 'EOF'
# Supabase (Real values from Supabase dashboard)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your-real-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-real-service-key

# Database (Supabase)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.YOUR_PROJECT.supabase.co:5432/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:[YOUR-PASSWORD]@db.YOUR_PROJECT.supabase.co:5432/postgres

# Redis (Railway instead of Upstash)
REDIS_URL=redis://default:[YOUR-PASSWORD]@[YOUR-HOST].railway.app:6379
REDIS_PROVIDER=railway  # Change from 'upstash' to 'railway'

# Keep these the same
OPENAI_API_KEY=your-existing-key
SESSION_SECRET=your-existing-secret
JWT_SECRET=your-existing-secret
ENCRYPTION_SECRET=your-existing-secret
EOF

echo ""
echo "Step 2: Code Changes (Minimal)"
echo "-------------------------------"
echo "1. Update redis.server.ts if needed for Railway"
echo "2. Remove any Hetzner-specific health checks"
echo "3. That's it! No other code changes needed"

echo ""
echo "Step 3: Deployment Commands"
echo "----------------------------"
echo "# 1. Push to GitHub"
echo "git add ."
echo "git commit -m 'chore: Switch back to Vercel + Supabase + Railway'"
echo "git push origin main"
echo ""
echo "# 2. Import to Vercel"
echo "Go to: https://vercel.com/new"
echo "Import your GitHub repo"
echo "Add all environment variables"
echo ""
echo "# 3. Set up Railway Redis"
echo "Go to: https://railway.app/new"
echo "Add Redis service"
echo "Copy connection string"
echo ""
echo "# 4. Data Migration"
echo "pg_dump postgresql://raguser:SecurePassword123@178.156.186.87:5432/ragdb > backup.sql"
echo "psql YOUR_SUPABASE_URL < backup.sql"
echo ""
echo "Done! Your app is back on managed services 🎉"