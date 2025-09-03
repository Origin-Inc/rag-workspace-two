# Vercel Deployment - Quick Start Guide

Follow these steps in order to deploy your application to Vercel.

## Step 1: Database Setup (Supabase) - 10 minutes

### 1.1 Create Supabase Project
1. Go to https://app.supabase.com
2. Click "New project"
3. Enter:
   - Project name: `rag-workspace`
   - Database Password: **[Generate strong password and SAVE IT]**
   - Region: Choose closest to you
4. Click "Create new project" (wait ~2 minutes)

### 1.2 Enable Extensions
Once ready, go to SQL Editor and run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 1.3 Apply Migrations
1. Go to Settings → Database
2. Copy the "Connection string" (URI tab)
3. In your terminal, run:
```bash
# Replace [YOUR-PASSWORD] and [PROJECT-REF] with actual values
export DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Apply migrations
npx prisma migrate deploy

# Generate client
npx prisma generate
```

### 1.4 Save Your Connection Strings
Go to Settings → Database → Connection pooling:
- Copy the pooled connection string
- Add `?pgbouncer=true&connection_limit=1` to the end
- Save this as your `DATABASE_URL`

Go to Settings → API:
- Save `URL` as `SUPABASE_URL`  
- Save `anon public` as `SUPABASE_ANON_KEY`
- Save `service_role` as `SUPABASE_SERVICE_ROLE_KEY`

## Step 2: Redis Setup (Upstash) - 5 minutes

### 2.1 Create Upstash Account
1. Go to https://upstash.com
2. Sign up (free tier is fine to start)

### 2.2 Create Database
1. Click "Create Database"
2. Name: `rag-workspace`
3. Type: Regional
4. Region: Same as Vercel (e.g., US-East-1)
5. Click "Create"

### 2.3 Save Connection String
- Copy the "Redis URL" from Details tab
- Save this as your `REDIS_URL`

## Step 3: Generate Security Keys - 2 minutes

Run these commands to generate secure keys:

```bash
# JWT Secret (save as JWT_SECRET)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Session Secret (save as SESSION_SECRET) - MUST BE DIFFERENT
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption Secret (save as ENCRYPTION_SECRET)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Cron Secret (save as CRON_SECRET)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

## Step 4: Prepare GitHub Repository - 3 minutes

```bash
# Initialize git if needed
git init

# Add all files
git add .

# Commit
git commit -m "Initial deployment"

# Create GitHub repo and push
# Go to https://github.com/new
# Create repository named "rag-workspace"
# Then:
git remote add origin https://github.com/[YOUR-USERNAME]/rag-workspace.git
git branch -M main
git push -u origin main
```

## Step 5: Deploy to Vercel - 5 minutes

### 5.1 Import Project
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Select the `rag-app` directory as root

### 5.2 Configure Build Settings
- Framework Preset: `Remix`
- Build Command: `npm run build`
- Output Directory: `public`
- Install Command: `npm install`

### 5.3 Add Environment Variables
Click "Environment Variables" and add ALL of these:

```bash
# Database (use your pooled connection string from Step 1.4)
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1

# Supabase (from Step 1.4)
SUPABASE_URL=https://[PROJECT-REF].supabase.co
SUPABASE_ANON_KEY=[YOUR-ANON-KEY]
SUPABASE_SERVICE_ROLE_KEY=[YOUR-SERVICE-KEY]

# Redis (from Step 2.3)
REDIS_URL=redis://default:[PASSWORD]@[ENDPOINT].upstash.io:[PORT]

# OpenAI (your API key)
OPENAI_API_KEY=sk-...

# Security (from Step 3)
JWT_SECRET=[YOUR-JWT-SECRET]
SESSION_SECRET=[YOUR-SESSION-SECRET]
ENCRYPTION_SECRET=[YOUR-ENCRYPTION-SECRET]
CRON_SECRET=[YOUR-CRON-SECRET]

# Application
NODE_ENV=production
APP_URL=https://[YOUR-APP].vercel.app
WS_URL=wss://[YOUR-APP].vercel.app
PORT=3000
HOST=0.0.0.0

# Features
ENABLE_INDEXING_WORKER=true
```

### 5.4 Deploy
Click "Deploy" and wait for the build to complete (~3-5 minutes)

## Step 6: Post-Deployment Setup - 5 minutes

### 6.1 Create Database Indexes
Go to Supabase SQL Editor and run:
```sql
-- Performance indexes
CREATE INDEX idx_pages_workspace_id ON pages(workspace_id);
CREATE INDEX idx_blocks_page_id ON blocks(page_id);
CREATE INDEX idx_page_embeddings_workspace ON page_embeddings(workspace_id);
CREATE INDEX idx_block_embeddings_workspace ON block_embeddings(workspace_id);

-- Vector indexes
CREATE INDEX idx_page_embeddings_vector ON page_embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_block_embeddings_vector ON block_embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### 6.2 Verify Deployment
1. Visit your app URL: `https://[YOUR-APP].vercel.app`
2. Check health endpoint: `https://[YOUR-APP].vercel.app/health`
3. All services should show "up"

### 6.3 Test Core Features
1. Create an account
2. Create a workspace
3. Create a page
4. Add some content
5. Test AI assistant

## Troubleshooting

### Database Connection Issues
- Ensure you're using the pooled connection string
- Must include `?pgbouncer=true&connection_limit=1`
- Check Supabase dashboard for connection limits

### Redis Connection Failed
- Verify REDIS_URL includes authentication
- Check Upstash dashboard is showing active

### Build Failures
- Check Vercel build logs
- Ensure all environment variables are set
- Try building locally first: `npm run build`

### Cron Jobs Not Running
- Go to Vercel Dashboard → Functions → Crons
- Should show `/api/cron/indexing` scheduled
- Check CRON_SECRET is set

## Quick Commands

```bash
# View deployment status
vercel ls

# View logs
vercel logs

# Redeploy
vercel --prod

# Rollback if needed
vercel rollback
```

## Environment Variables Checklist

Required:
- [ ] DATABASE_URL (with pooling params)
- [ ] SUPABASE_URL
- [ ] SUPABASE_ANON_KEY
- [ ] SUPABASE_SERVICE_ROLE_KEY
- [ ] REDIS_URL
- [ ] OPENAI_API_KEY
- [ ] JWT_SECRET (32+ chars)
- [ ] SESSION_SECRET (different, 32+ chars)
- [ ] NODE_ENV=production
- [ ] APP_URL

Optional but recommended:
- [ ] ENCRYPTION_SECRET
- [ ] CRON_SECRET
- [ ] ENABLE_INDEXING_WORKER=true

## Success Indicators

✅ Landing page loads  
✅ Can create account  
✅ Can log in  
✅ Can create workspace  
✅ Can create/edit pages  
✅ AI features respond  
✅ Health endpoint returns 200  
✅ No errors in Vercel logs  

## Next Steps

Once deployed:
1. Set up custom domain (optional)
2. Enable Vercel Analytics
3. Configure monitoring
4. Set up backups in Supabase
5. Monitor costs

## Support

- Vercel: https://vercel.com/support
- Supabase: https://supabase.com/support
- Upstash: https://upstash.com/support