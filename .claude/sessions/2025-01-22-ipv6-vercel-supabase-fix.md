# Session: IPv6 Incompatibility Between Vercel and Supabase
**Date**: January 22, 2025  
**Duration**: ~3 hours  
**Severity**: CRITICAL - Complete authentication failure in production  
**Resolution**: SOLVED - Using IPv4-proxied transaction pooler  

## 🔴 The Problem

### Initial Symptoms
- Users unable to sign in on production (Vercel deployment)
- Error: `"Can't reach database server at db.PROJECT-REDACTED.supabase.co:5432"`
- Secondary error: `"Timed out fetching a new connection from the connection pool. (Current connection pool timeout: 10, connection limit: 3)"`
- Authentication worked locally but failed on Vercel

### Root Cause Discovery Process
1. **Initial hypothesis**: Connection pool exhaustion
   - Tried increasing `connection_limit` from 3 to 10
   - Failed: Supabase free tier ignores this parameter (hard-coded to 3 max)

2. **Second hypothesis**: Pooler configuration issues
   - Tried various pooler modes (session vs transaction)
   - Tried different ports (5432 vs 6543)
   - Still failed with same timeout errors

3. **Breakthrough**: Discovered IPv6/IPv4 incompatibility
   - Vercel only supports IPv4 connections
   - Supabase direct connections (`db.*.supabase.co`) only provide IPv6 addresses
   - Since January 15, 2024, Supabase stopped assigning IPv4 to free tier projects

## 🔍 Why This Happened

### Technical Details
```
Vercel Infrastructure:     IPv4-only
Supabase Direct Connection: IPv6-only
Result:                     Network unreachable
```

### The Connection Chain
1. Vercel serverless function tries to connect to database
2. DNS resolves `db.PROJECT-REDACTED.supabase.co` to IPv6 address
3. Vercel's IPv4-only network cannot route to IPv6 address
4. Connection times out with "Can't reach database server"

### Why It Worked Locally
- Local development machines support both IPv4 and IPv6
- Direct connection worked fine from developer machines
- Issue only manifested in Vercel's IPv4-only environment

## ✅ The Solution

### Immediate Fix
Changed DATABASE_URL from direct connection to transaction pooler:

**Before** (IPv6-only, broken):
```
postgresql://postgres:PASSWORD-REDACTED@db.PROJECT-REDACTED.supabase.co:5432/postgres
```

**After** (IPv4-proxied, working):
```
postgresql://postgres.PROJECT-REDACTED:PASSWORD-REDACTED@aws-1-us-east-2.pooler.supabase.com:6543/postgres
```

### Why This Works
- Supabase provides **FREE IPv4 proxy** for pooler connections
- Transaction pooler (port 6543) is ideal for serverless
- No additional cost (IPv4 add-on not needed)
- Better performance for short-lived connections

## 📝 Code Changes Made

### 1. Database Pooling Configuration (`app/utils/db-pooling.server.ts`)
```typescript
// Optimized for Supabase free tier + Vercel
return {
  connectionLimit: 1,        // Minimal to avoid hitting free tier limit (3 max)
  poolTimeout: 0,           // No timeout to avoid connection drops
  connectTimeout: 300,      // Extended timeout for IPv4 pooler
  statementCacheSize: 0,    // No statement caching in transaction mode
  pgbouncer: true,
  port: 6543,              // Transaction pooler port
};
```

### 2. Environment Variables (`.env.example`)
- Added IPv4 transaction pooler as primary recommended option
- Documented IPv6 incompatibility issue
- Clear warnings about Vercel limitations

### 3. Documentation Created
- `VERCEL_DEPLOYMENT_FIX.md` - Complete deployment guide
- `IPV6_FIX_URGENT.md` - Critical fix documentation

## 🎯 Lessons Learned

### 1. Platform Compatibility
- Always verify network protocol compatibility (IPv4 vs IPv6)
- Serverless platforms may have networking limitations
- Test in actual deployment environment, not just locally

### 2. Supabase Free Tier Limitations
- Connection pool limited to 3 (hard-coded, cannot override)
- No IPv4 for direct connections without paid add-on
- Pooler connections include free IPv4 proxy

### 3. Connection Modes
| Mode | Port | IPv4 Support | Best For |
|------|------|--------------|----------|
| Direct | 5432 | ❌ Paid add-on | Long-lived connections |
| Session Pooler | 5432 | ✅ Free proxy | IPv4 networks |
| Transaction Pooler | 6543 | ✅ Free proxy | Serverless/Vercel |

## 🔧 Troubleshooting Guide

### If You See "Can't reach database server"
1. Check if using direct connection URL (`db.*.supabase.co`)
2. Switch to pooler URL (`*.pooler.supabase.com`)
3. Use port 6543 for transaction mode (best for serverless)

### If You See "Connection pool timeout"
1. Reduce `connection_limit` to 1
2. Remove `pool_timeout` or set to 0
3. Ensure using transaction pooler (port 6543)

### Quick Test
```bash
# Test if your deployment platform supports IPv6
curl -6 https://ipv6.google.com
# If this fails, you need IPv4-proxied connections
```

## 📚 References

### Supabase Connection Types
- **Direct**: `db.PROJECT.supabase.co` (IPv6-only on free tier)
- **Transaction Pooler**: `aws-REGION.pooler.supabase.com:6543` (IPv4 proxy free)
- **Session Pooler**: `aws-REGION.pooler.supabase.com:5432` (IPv4 proxy free)

### Official Documentation
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooling)
- [Vercel Networking](https://vercel.com/docs/concepts/functions/networking)
- [IPv4 Add-on](https://supabase.com/docs/guides/platform/ipv4-address) ($4/month)

## ✨ Final Status

**Problem**: RESOLVED  
**Solution**: Use IPv4-proxied transaction pooler  
**Cost**: $0 (free IPv4 proxy included)  
**Performance Impact**: Minimal (actually better for serverless)  
**User Impact**: Full functionality restored  

## 🎉 Victory Conditions Met
- ✅ Authentication working
- ✅ No connection timeouts
- ✅ No additional costs
- ✅ Optimized for serverless architecture
- ✅ File persistence fully functional

---

*This session document serves as a reference for future IPv6/IPv4 compatibility issues between Vercel and Supabase. The transaction pooler with free IPv4 proxy is the recommended solution for all Vercel deployments.*