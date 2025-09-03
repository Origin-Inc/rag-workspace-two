# Production Deployment Checklist

Use this checklist to ensure your RAG Workspace application is properly configured for production deployment.

## Pre-Deployment Requirements

### ✅ Accounts & Services
- [ ] Vercel account created and verified
- [ ] Supabase project created
- [ ] Upstash Redis database created (or alternative Redis service)
- [ ] OpenAI API key with billing enabled
- [ ] GitHub repository created and code pushed
- [ ] Domain name configured (optional)

### ✅ Local Testing
- [ ] Application runs locally without errors
- [ ] All tests pass (`npm test`)
- [ ] TypeScript compilation successful (`npm run typecheck`)
- [ ] No linting errors (`npm run lint`)
- [ ] Build completes successfully (`npm run build`)

## Database Configuration

### ✅ Supabase Setup
- [ ] pgvector extension enabled
- [ ] uuid-ossp extension enabled
- [ ] All migrations applied (`npx prisma migrate deploy`)
- [ ] Connection pooling enabled (Supavisor/PgBouncer)
- [ ] Connection string includes `?pgbouncer=true&connection_limit=1`
- [ ] Database indexes created for performance
- [ ] Backup schedule configured

### ✅ Database Schema
- [ ] All tables created correctly
- [ ] Vector columns properly configured
- [ ] search_embeddings function exists
- [ ] unified_embeddings view created
- [ ] Proper indexes on foreign keys
- [ ] IVFFlat indexes on vector columns

## Environment Variables

### ✅ Required Variables Set in Vercel
- [ ] `DATABASE_URL` - With connection pooling parameters
- [ ] `SUPABASE_URL` - https://[project].supabase.co
- [ ] `SUPABASE_ANON_KEY` - From Supabase API settings
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Keep secure!
- [ ] `REDIS_URL` - Full connection string with auth
- [ ] `OPENAI_API_KEY` - Production API key
- [ ] `JWT_SECRET` - Minimum 32 characters, unique
- [ ] `SESSION_SECRET` - Different from JWT_SECRET
- [ ] `ENCRYPTION_SECRET` - Base64 encoded 32-byte key
- [ ] `CRON_SECRET` - For authenticating cron jobs
- [ ] `NODE_ENV` - Set to "production"
- [ ] `APP_URL` - Your production URL
- [ ] `WS_URL` - WebSocket URL (wss://...)

### ✅ Security Validation
- [ ] All secrets are unique and randomly generated
- [ ] No default or example values used
- [ ] Service role key not exposed to client code
- [ ] API keys have appropriate rate limits
- [ ] CORS configured for production domain

## Vercel Configuration

### ✅ Project Setup
- [ ] GitHub repository connected to Vercel
- [ ] Build settings configured (Framework: Remix)
- [ ] Root directory set correctly (./rag-app)
- [ ] Node.js version specified (18.x or higher)

### ✅ vercel.json Configuration
- [ ] Build command specified
- [ ] Output directory correct
- [ ] Function timeout configured
- [ ] Cron jobs defined
- [ ] Regions selected appropriately

### ✅ Deployment Settings
- [ ] Environment variables added for production
- [ ] Preview deployments configured
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate provisioned

## Redis Configuration

### ✅ Upstash Setup (or alternative)
- [ ] Redis instance created
- [ ] Same region as Vercel deployment
- [ ] Connection string includes authentication
- [ ] SSL/TLS enabled
- [ ] Eviction policy configured
- [ ] Memory limits appropriate for usage

## Application Configuration

### ✅ Feature Flags & Settings
- [ ] `ENABLE_INDEXING_WORKER` set to true
- [ ] Rate limiting configured appropriately
- [ ] File upload limits set
- [ ] Vector similarity threshold configured
- [ ] Queue concurrency optimized

### ✅ Monitoring & Logging
- [ ] Log level set appropriately (info/warn)
- [ ] Error tracking configured (Sentry optional)
- [ ] Vercel Analytics enabled
- [ ] Health endpoints accessible

## Security Review

### ✅ Authentication & Authorization
- [ ] JWT expiry configured
- [ ] Session timeout appropriate
- [ ] Password requirements enforced
- [ ] Rate limiting on auth endpoints
- [ ] CSRF protection enabled

### ✅ Data Protection
- [ ] Sensitive data encrypted at rest
- [ ] SSL/TLS for all connections
- [ ] Input validation on all endpoints
- [ ] SQL injection protection (via Prisma)
- [ ] XSS protection headers set

### ✅ API Security
- [ ] API routes require authentication
- [ ] Rate limiting configured
- [ ] Request size limits set
- [ ] Timeout configurations appropriate
- [ ] Error messages don't leak sensitive info

## Performance Optimization

### ✅ Database Performance
- [ ] Connection pooling configured
- [ ] Proper indexes created
- [ ] Query optimization reviewed
- [ ] N+1 queries eliminated
- [ ] Pagination implemented

### ✅ Caching Strategy
- [ ] Redis caching implemented
- [ ] Cache TTLs configured
- [ ] Cache invalidation logic correct
- [ ] Static assets cached
- [ ] CDN configured (Vercel Edge)

### ✅ Application Performance
- [ ] Bundle size optimized
- [ ] Lazy loading implemented
- [ ] Image optimization enabled
- [ ] Server-side rendering working
- [ ] WebSocket connections optimized

## Testing & Validation

### ✅ Functional Testing
- [ ] User registration works
- [ ] Login/logout functions correctly
- [ ] Password reset works
- [ ] Email verification works
- [ ] Workspace creation/switching works

### ✅ Core Features
- [ ] Page creation and editing works
- [ ] Block editor functions properly
- [ ] AI assistant responds correctly
- [ ] Command bar works
- [ ] Database blocks create/update
- [ ] Search functionality works
- [ ] RAG pipeline indexes content
- [ ] Embeddings generated correctly

### ✅ Integration Testing
- [ ] Database connections stable
- [ ] Redis operations work
- [ ] OpenAI API calls successful
- [ ] File uploads work
- [ ] WebSocket connections stable
- [ ] Cron jobs execute

## Deployment Execution

### ✅ Initial Deployment
- [ ] Code pushed to main branch
- [ ] Vercel deployment triggered
- [ ] Build completes successfully
- [ ] Deployment live and accessible
- [ ] Custom domain working (if applicable)

### ✅ Post-Deployment Verification
- [ ] Health endpoint returns 200
- [ ] All services show "up" status
- [ ] Database connectivity confirmed
- [ ] Redis connection verified
- [ ] OpenAI integration working
- [ ] Cron jobs running

### ✅ Smoke Testing
- [ ] Landing page loads
- [ ] Can create new account
- [ ] Can log in successfully
- [ ] Can create workspace
- [ ] Can create and edit page
- [ ] AI features respond
- [ ] Search returns results

## Monitoring Setup

### ✅ Operational Monitoring
- [ ] Vercel dashboard accessible
- [ ] Function logs visible
- [ ] Cron job status visible
- [ ] Error rates acceptable (<1%)
- [ ] Response times acceptable (<500ms p95)

### ✅ Resource Monitoring
- [ ] Database connections monitored
- [ ] Redis memory usage tracked
- [ ] API rate limits monitored
- [ ] Disk usage tracked
- [ ] Bandwidth usage monitored

### ✅ Cost Monitoring
- [ ] Vercel usage tracked
- [ ] Supabase usage monitored
- [ ] Redis costs tracked
- [ ] OpenAI API usage monitored
- [ ] Budget alerts configured

## Documentation

### ✅ Technical Documentation
- [ ] README updated
- [ ] API documentation current
- [ ] Database schema documented
- [ ] Environment variables documented
- [ ] Deployment process documented

### ✅ Operational Documentation
- [ ] Runbook created
- [ ] Incident response plan
- [ ] Rollback procedures documented
- [ ] Scaling guidelines written
- [ ] Maintenance procedures defined

## Final Validation

### ✅ Production Readiness
- [ ] All checklist items completed
- [ ] Team trained on deployment
- [ ] Support channels established
- [ ] Monitoring alerts configured
- [ ] Backup/recovery tested
- [ ] Load testing completed (optional)
- [ ] Security scan performed (optional)

## Go-Live

### ✅ Launch Steps
- [ ] Final backup taken
- [ ] Team notified
- [ ] DNS propagated (if custom domain)
- [ ] SSL certificate valid
- [ ] Announcement prepared
- [ ] Support ready

### ✅ Post-Launch (First 24 Hours)
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Review user feedback
- [ ] Address critical issues
- [ ] Document lessons learned

---

## Quick Commands Reference

```bash
# Verify environment locally
npm run build

# Deploy to Vercel
vercel --prod

# Check deployment status
vercel ls

# View logs
vercel logs

# Rollback if needed
vercel rollback

# Run migrations on production
DATABASE_URL="prod_url" npx prisma migrate deploy
```

## Emergency Contacts

- Vercel Support: https://vercel.com/support
- Supabase Support: https://supabase.com/support  
- Upstash Support: https://upstash.com/support
- OpenAI Status: https://status.openai.com

---

**Remember**: Take your time with deployment. It's better to be thorough than to rush and miss critical configuration.