# Vercel Deployment Checklist

## 1. Vercel Setup
- [ ] Go to https://vercel.com/new
- [ ] Import GitHub repository: `rag-workspace-two`
- [ ] Select branch: `feature/task-4-database-block`

## 2. Configure Project Settings
- [ ] Framework Preset: Remix
- [ ] Root Directory: `rag-app`
- [ ] Build Command: `npm run build`
- [ ] Output Directory: `build`
- [ ] Install Command: `npm install`

## 3. Add Environment Variables
Copy all variables from `VERCEL_ENV_VARS.md`:

### Database (Supabase)
- DATABASE_URL
- DIRECT_URL

### Supabase
- SUPABASE_URL
- SUPABASE_ANON_KEY  
- SUPABASE_SERVICE_ROLE_KEY

### Redis (Railway)
- REDIS_PROVIDER (set to: local)
- REDIS_URL
- REDIS_PASSWORD

### OpenAI
- OPENAI_API_KEY

### Security
- SESSION_SECRET
- JWT_SECRET
- ENCRYPTION_SECRET
- CRON_SECRET

### Application
- NODE_ENV (set to: production)
- APP_URL (update after deployment with actual Vercel URL)
- ENABLE_INDEXING_WORKER (set to: true)

## 4. Deploy
- [ ] Click "Deploy"
- [ ] Wait for build to complete
- [ ] Update APP_URL with deployed URL

## 5. Set up Railway Redis
- [ ] Go to https://railway.app/new
- [ ] Add Redis service
- [ ] Copy connection string (already in VERCEL_ENV_VARS.md)

## 6. Test Deployment
- [ ] Visit deployed URL
- [ ] Test login/signup
- [ ] Test document upload
- [ ] Test RAG search

## 7. Data Migration (if needed)
If you have existing data in the Hetzner PostgreSQL:
```bash
# Export from Hetzner
pg_dump postgresql://raguser:SecurePassword123@178.156.186.87:5432/ragdb > backup.sql

# Import to Supabase
psql postgresql://postgres:bonqo4rafgymzizvUp@db.afqibcfcornmwppxjbyk.supabase.co:5432/postgres < backup.sql
```