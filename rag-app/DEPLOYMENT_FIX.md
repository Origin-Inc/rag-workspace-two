# Deployment Fix Instructions

## Issue
The Vercel deployment is crashing with a 500 error because:
1. Database schema hasn't been applied to Supabase
2. APP_URL is set to placeholder value

## Immediate Actions Required

### 1. Update Environment Variables on Vercel

Go to your Vercel project settings and update:
```
APP_URL=https://rag-workspace-two.vercel.app
WS_URL=wss://rag-workspace-two.vercel.app
```
(Replace with your actual Vercel URL)

### 2. Apply Database Schema to Supabase

#### Option A: Using Supabase Dashboard (Recommended)
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to SQL Editor
4. Run the following scripts in order:
   - First: Copy and paste the entire contents of `supabase_init.sql`
   - Second: Copy and paste the entire contents of `scripts/setup-supabase-production.sql`

#### Option B: Using psql Command Line
```bash
# Connect to your Supabase database
psql "postgresql://postgres.afqibcfcornmwppxjbyk:bonqo4rafgymzizvUp@aws-0-us-west-1.pooler.supabase.com:5432/postgres"

# Run the scripts
\i supabase_init.sql
\i scripts/setup-supabase-production.sql
```

### 3. Enable pgvector Extension in Supabase
1. Go to Supabase Dashboard
2. Navigate to Database → Extensions
3. Search for "vector"
4. Click "Enable" if not already enabled

### 4. Verify Database Connection
Test the connection with this query in Supabase SQL Editor:
```sql
SELECT 
    extname,
    extversion 
FROM pg_extension 
WHERE extname = 'vector';

-- Should return a row with vector extension
```

### 5. Redeploy on Vercel
After updating environment variables:
```bash
# Trigger a new deployment
git commit --allow-empty -m "fix: Trigger deployment with correct environment variables"
git push origin main
```

## Environment Variables Checklist

Ensure all these are set correctly on Vercel:

### Required Variables
- ✅ `DATABASE_URL` - Use connection pooler URL from Supabase
- ✅ `DIRECT_URL` - Direct connection URL (for migrations)
- ✅ `SUPABASE_URL` - Your Supabase project URL
- ✅ `SUPABASE_ANON_KEY` - Supabase anonymous key
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- ✅ `REDIS_URL` - Upstash Redis URL
- ✅ `OPENAI_API_KEY` - OpenAI API key
- ✅ `SESSION_SECRET` - Generated secure string
- ✅ `JWT_SECRET` - Generated secure string
- ⚠️ `APP_URL` - UPDATE THIS to your actual Vercel URL
- ⚠️ `WS_URL` - UPDATE THIS to wss://your-vercel-url
- ✅ `NODE_ENV` - Set to "production"
- ✅ `ENABLE_DEV_LOGIN` - Set to "false"
- ✅ `LOG_LEVEL` - Set to "error"

## Debugging

### Check Vercel Function Logs
1. Go to Vercel Dashboard
2. Click on "Functions" tab
3. Check the logs for specific error messages

### Common Issues and Solutions

#### "function search_embeddings does not exist"
- Run the `scripts/setup-supabase-production.sql` script

#### "relation does not exist"
- Run the `supabase_init.sql` script first

#### "extension 'vector' is not available"
- Enable pgvector in Supabase Extensions dashboard

#### Connection timeouts
- Ensure you're using the pooler connection string for DATABASE_URL
- Check that Supabase project is not paused

## Testing the Fix

Once everything is set up:

1. Visit your Vercel URL
2. The landing page should load without errors
3. Try navigating to `/auth/login`
4. Check browser console for any errors

## Support

If issues persist after following these steps:
1. Check Vercel function logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure Supabase project is active and not paused
4. Check that all database migrations have been applied