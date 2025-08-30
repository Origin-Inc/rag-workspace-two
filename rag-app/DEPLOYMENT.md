# Production Deployment Guide

## Deployment Architecture

- **Frontend & API**: Vercel (Serverless)
- **Database**: Supabase PostgreSQL with pgvector
- **Background Jobs**: Vercel Cron Jobs + BullMQ
- **Redis**: Upstash Redis (Vercel-optimized) or Supabase Redis
- **File Storage**: Supabase Storage

## Pre-Deployment Setup

### 1. Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Enable pgvector extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Run database migrations:
   ```bash
   npx prisma migrate deploy
   ```

### 2. Redis Setup

#### Option A: Upstash Redis (Recommended for Vercel)
1. Create account at https://upstash.com
2. Create a Redis database in the same region as your Vercel deployment
3. Copy the Redis URL from the dashboard

#### Option B: Supabase Redis (if available in your plan)
1. Enable Redis addon in Supabase dashboard
2. Copy the Redis connection string

### 3. Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?pgbouncer=true&connection_limit=1
REDIS_URL=redis://default:password@endpoint.upstash.io:port
OPENAI_API_KEY=sk-...
JWT_SECRET=[generate 32+ char random string]
SESSION_SECRET=[generate 32+ char random string]
CRON_SECRET=[generate random string for cron auth]
```

### 4. Generate Secrets

```bash
# Generate secure random strings
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deployment Steps

### 1. Install Vercel CLI
```bash
npm i -g vercel
```

### 2. Deploy to Vercel
```bash
# From the rag-app directory
cd rag-app

# Login to Vercel
vercel login

# Deploy (first time)
vercel --prod

# Or connect to existing project
vercel link
vercel --prod
```

### 3. Configure Cron Jobs

Vercel will automatically detect `vercel.json` and set up the cron job for indexing.

The indexing cron runs every minute and:
- Processes pending indexing jobs
- Auto-scales based on queue size
- Respects rate limits
- Has built-in error recovery

### 4. Verify Deployment

1. Check cron job is running:
   - Vercel Dashboard → Functions → Cron tab
   - Should show `/api/cron/indexing` running every minute

2. Test health endpoint:
   ```bash
   curl -X POST https://your-app.vercel.app/api/cron/indexing \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "action=health"
   ```

3. Monitor logs:
   - Vercel Dashboard → Functions → Logs
   - Filter by `api/cron/indexing` to see indexing jobs

## Production Optimizations

### Database Connection Pooling

The production `DATABASE_URL` includes:
- `?pgbouncer=true` - Uses Supabase's connection pooler
- `&connection_limit=1` - Serverless-friendly connection limit

### Redis Configuration

Upstash Redis is optimized for serverless with:
- HTTP-based connections (no persistent connections)
- Auto-scaling
- Global replication options

### Rate Limiting

Built-in rate limiting for:
- OpenAI API calls: 10/minute
- Indexing jobs: 10/minute
- Concurrent jobs: 3 max

### Error Tracking (Optional)

Add Sentry for production error tracking:

1. Create account at https://sentry.io
2. Create a new project
3. Add `SENTRY_DSN` to environment variables
4. Errors will auto-report to Sentry dashboard

## Monitoring

### Key Metrics to Monitor

1. **Cron Job Health**
   - Success rate (should be >95%)
   - Execution time (should be <25s)
   - Queue depth

2. **Database**
   - Connection pool usage
   - Query performance
   - Storage usage

3. **Redis**
   - Memory usage
   - Command latency
   - Queue sizes

4. **OpenAI API**
   - Token usage
   - API errors
   - Rate limit hits

### Monitoring Tools

- **Vercel Analytics**: Built-in performance monitoring
- **Supabase Dashboard**: Database metrics and logs
- **Upstash Console**: Redis metrics and monitoring
- **OpenAI Usage**: API usage dashboard

## Troubleshooting

### Indexing Not Working

1. Check cron job logs in Vercel dashboard
2. Verify Redis connection:
   ```bash
   curl -X POST https://your-app.vercel.app/api/cron/indexing \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "action=health"
   ```
3. Check OpenAI API key is valid
4. Verify database has vector extension enabled

### Slow Performance

1. Check Vercel function logs for timeouts
2. Verify database connection pooling is enabled
3. Consider upgrading Vercel plan for longer function duration
4. Check Redis memory usage

### High Costs

1. Monitor OpenAI token usage
2. Implement caching for repeated queries
3. Optimize chunk sizes for embeddings
4. Consider rate limiting per user

## Scaling Considerations

### When to Scale

- Queue depth consistently >100 jobs
- Cron job execution time approaching 30s limit
- Database connections maxing out

### How to Scale

1. **Increase Cron Frequency**
   - Change from `* * * * *` to `*/30 * * * * *` (every 30 seconds)
   - Note: Requires Vercel Pro plan

2. **Optimize Job Processing**
   - Increase `MAX_CONCURRENT_INDEXING_JOBS`
   - Batch embed multiple chunks in single API call

3. **Database Scaling**
   - Upgrade Supabase plan for more connections
   - Enable read replicas for search queries

4. **Redis Scaling**
   - Upgrade Upstash plan for more memory
   - Enable global replication for multi-region

## Security Checklist

- [ ] All secrets are in environment variables (not in code)
- [ ] CRON_SECRET is set and verified
- [ ] Database URL uses SSL (`?sslmode=require`)
- [ ] API routes verify authentication
- [ ] Rate limiting is configured
- [ ] CORS is properly configured
- [ ] Input validation on all endpoints

## Post-Deployment

1. Test user registration and login
2. Create a test page with content
3. Verify AI block can search and answer questions
4. Check indexing is happening automatically
5. Monitor first 24 hours for any issues

## Support

- Vercel Support: https://vercel.com/support
- Supabase Support: https://supabase.com/support
- Upstash Support: https://upstash.com/support