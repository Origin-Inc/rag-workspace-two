# Production Deployment Guide

## Overview
This guide covers deploying the RAG Workspace application to production using Vercel (frontend/backend) and Supabase (database).

## Prerequisites
- Vercel account (https://vercel.com)
- Supabase account (https://supabase.com)
- GitHub repository connected to Vercel
- Upstash Redis account (recommended for Vercel) or alternative Redis provider
- OpenAI API key with billing enabled

## 1. Database Setup (Supabase)

### 1.1 Create Supabase Project
1. Go to https://app.supabase.com
2. Create new project with a strong database password
3. Select region closest to your users
4. Wait for project initialization (~2 minutes)

### 1.2 Enable pgvector Extension
```sql
-- Run in Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 1.3 Apply Database Migrations
1. Get connection string from Supabase dashboard:
   - Go to Settings → Database
   - Copy "Connection string" (use Transaction mode for migrations)
   
2. Run migrations locally:
```bash
# Set the production database URL temporarily
export DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres"

# Apply all migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

### 1.4 Configure Connection Pooling
- Use the "Connection pooling" connection string from Supabase
- Add `?pgbouncer=true&connection_limit=1` to the connection string
- This is critical for serverless environments

## 2. Redis Setup (Upstash Recommended)

### 2.1 Create Upstash Redis Database
1. Sign up at https://upstash.com
2. Create new Redis database
3. Select region matching your Vercel deployment
4. Copy the Redis URL (includes authentication)

### 2.2 Alternative: Redis Cloud
- If using Redis Cloud or other providers
- Ensure SSL/TLS is enabled
- Get connection URL with authentication

## 3. Environment Variables Setup

### 3.1 Required Variables
Copy `.env.example` and fill in production values:

```bash
# Database (Supabase with connection pooling)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres?pgbouncer=true&connection_limit=1

# Supabase
SUPABASE_URL=https://[PROJECT].supabase.co
SUPABASE_ANON_KEY=eyJ...  # From API settings
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Keep secure!

# Redis (Upstash)
REDIS_URL=redis://default:[PASSWORD]@[ENDPOINT].upstash.io:[PORT]

# OpenAI
OPENAI_API_KEY=sk-...  # Your production key

# Security (Generate new for production!)
JWT_SECRET=[32+ char random string]  # openssl rand -hex 32
SESSION_SECRET=[Different 32+ char string]  # openssl rand -hex 32
ENCRYPTION_SECRET=[Base64 32-byte key]  # openssl rand -base64 32
CRON_SECRET=[Random string for Vercel crons]  # openssl rand -hex 32

# Application
NODE_ENV=production
APP_URL=https://your-app.vercel.app
WS_URL=wss://your-app.vercel.app
```

### 3.2 Add to Vercel
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add each variable from above
3. Ensure "Production" environment is selected
4. Save all variables

## 4. Vercel Deployment

### 4.1 Initial Setup
```bash
# Install Vercel CLI
npm i -g vercel

# Link to project
vercel link

# Configure build settings
vercel --build-env NODE_ENV=production
```

### 4.2 vercel.json Configuration
Create `vercel.json` in project root:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "public",
  "framework": "remix",
  "regions": ["iad1"],
  "functions": {
    "app/routes/api.*.ts": {
      "maxDuration": 30
    },
    "app/routes/editor.$pageId.tsx": {
      "maxDuration": 60
    }
  },
  "crons": [
    {
      "path": "/api/cron/indexing",
      "schedule": "*/1 * * * *"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### 4.3 Deploy
```bash
# Production deployment
vercel --prod

# Or push to main branch for auto-deploy
git push origin main
```

## 5. Post-Deployment Tasks

### 5.1 Verify Services
1. Check health endpoint: `https://your-app.vercel.app/health`
2. Verify all services show "up" status
3. Check database connectivity
4. Test Redis connection
5. Verify OpenAI integration

### 5.2 Set Up Monitoring
1. **Vercel Analytics**: Enable in Vercel dashboard
2. **Error Tracking** (Optional):
   - Add Sentry integration
   - Set SENTRY_DSN environment variable

### 5.3 Configure Cron Jobs
1. Go to Vercel Dashboard → Functions → Crons
2. Verify indexing cron is running every minute
3. Add CRON_SECRET to authenticate cron requests

### 5.4 Database Indexes
Run these for optimal performance:
```sql
-- In Supabase SQL Editor
CREATE INDEX idx_pages_workspace_id ON pages(workspace_id);
CREATE INDEX idx_blocks_page_id ON blocks(page_id);
CREATE INDEX idx_page_embeddings_workspace ON page_embeddings(workspace_id);
CREATE INDEX idx_block_embeddings_workspace ON block_embeddings(workspace_id);

-- Vector indexes for similarity search
CREATE INDEX idx_page_embeddings_vector ON page_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX idx_block_embeddings_vector ON block_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

## 6. Security Checklist

- [ ] All secrets regenerated for production
- [ ] Environment variables set in Vercel (not in code)
- [ ] Database uses connection pooling
- [ ] Rate limiting configured
- [ ] CORS settings appropriate for production
- [ ] Session secrets are unique and secure
- [ ] Service role key not exposed to client
- [ ] API keys have appropriate scopes/limits
- [ ] Database backups configured in Supabase
- [ ] Row Level Security (RLS) policies reviewed

## 7. Performance Optimization

### 7.1 Edge Functions
- API routes automatically deploy as Edge Functions
- Ensure functions don't exceed 1MB compressed

### 7.2 Caching Strategy
- Redis caches frequently accessed data
- Set appropriate TTLs for cache entries
- Monitor Redis memory usage

### 7.3 Database Optimization
- Use connection pooling for all queries
- Implement pagination for large datasets
- Monitor slow queries in Supabase dashboard

## 8. Troubleshooting

### Common Issues

#### Database Connection Errors
- Ensure using pooled connection string
- Add `?pgbouncer=true&connection_limit=1`
- Check Supabase connection limits

#### Redis Connection Failed
- Verify REDIS_URL includes authentication
- Check firewall/network settings
- Ensure Redis instance is running

#### OpenAI Rate Limits
- Implement exponential backoff
- Monitor usage in OpenAI dashboard
- Consider upgrading API tier

#### Deployment Failures
- Check Vercel build logs
- Verify all environment variables set
- Ensure dependencies installed correctly

## 9. Rollback Strategy

If issues occur:
1. Revert to previous deployment in Vercel
2. Run database rollback if schema changed:
   ```bash
   npx prisma migrate resolve --rolled-back [migration_name]
   ```
3. Clear Redis cache if needed
4. Monitor error logs for root cause

## 10. Maintenance

### Regular Tasks
- Monitor database size and performance
- Check Redis memory usage
- Review API usage and costs
- Update dependencies monthly
- Backup database weekly (automated in Supabase)
- Review security logs

### Scaling Considerations
- Upgrade Supabase plan for more connections
- Increase Redis memory as needed
- Consider dedicated instances for high traffic
- Implement read replicas if needed

## Support

For deployment issues:
- Vercel Support: https://vercel.com/support
- Supabase Support: https://supabase.com/support
- Application Issues: Create issue in GitHub repository