# 🚨 URGENT: Vercel Deployment Fix

## Quick Fix (Do This Now!)

### 1. Update DATABASE_URL in Vercel Dashboard

Go to: **Settings → Environment Variables → DATABASE_URL**

Replace with this **IPv4 Pooler URL** (port 6543 for transaction mode):
```
postgresql://postgres.PROJECT-REDACTED:PASSWORD-REDACTED@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=0&connect_timeout=300
```

### 2. Verify DIRECT_URL is Set
```
postgresql://postgres:PASSWORD-REDACTED@db.PROJECT-REDACTED.supabase.co:5432/postgres
```

### 3. Redeploy with Cache Cleared
1. Go to **Deployments** tab
2. Click **...** on latest deployment
3. Choose **Redeploy**
4. **UNCHECK "Use existing Build Cache"** ← CRITICAL!
5. Click **Redeploy**

## Why This Works

### The Problem
- **Vercel**: Only supports IPv4 addresses
- **Supabase Direct**: Only provides IPv6 addresses (`db.*.supabase.co`)
- **Result**: Connection timeout errors

### The Solution
- **IPv4 Pooler**: `aws-0-us-east-1.pooler.supabase.com` resolves to IPv4
- **Port 6543**: Transaction mode - optimal for serverless
- **Minimal Connections**: Using only 1 connection (free tier limit is 3)

## Connection String Breakdown

```
postgresql://postgres.PROJECT-REDACTED:PASSWORD-REDACTED@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=0&connect_timeout=300
```

- **Host**: `aws-0-us-east-1.pooler.supabase.com` (IPv4 compatible)
- **Port**: `6543` (transaction pooler mode)
- **Parameters**:
  - `pgbouncer=true` - Required for pooler
  - `connection_limit=1` - Minimal connections (free tier safe)
  - `pool_timeout=0` - No timeout (prevents drops)
  - `connect_timeout=300` - Extended timeout for stability

## Alternative Options (If Above Fails)

### Option 1: Session Mode Pooler (Port 5432)
```
postgresql://postgres.PROJECT-REDACTED:PASSWORD-REDACTED@aws-0-us-east-1.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1&pool_timeout=0
```

### Option 2: Direct Connection (If IPv4 Add-on Enabled)
```
postgresql://postgres:PASSWORD-REDACTED@db.PROJECT-REDACTED.supabase.co:5432/postgres?schema=public
```

## Verification Checklist

After deployment, verify:

✅ **Authentication Works**
- Sign in/out functions properly
- No timeout errors in logs

✅ **File Persistence Works**
- Files upload successfully
- Files appear in list
- Files persist after refresh
- Delete functionality works

✅ **Database Operations**
- Queries execute without errors
- No "can't reach database" errors
- No "connection pool" timeout errors

## Common Issues & Solutions

### "Still getting timeout errors"
1. Verify DATABASE_URL was updated (check Vercel dashboard)
2. Ensure you unchecked "Use existing Build Cache" when redeploying
3. Try Option 1 (Session Mode) connection string

### "Authentication works but files don't persist"
- This is likely RLS policy issue, not connection issue
- Files should still save metadata to database
- Check Supabase logs for storage errors

### "Getting prepared statement errors"
- Normal for transaction mode
- Our code automatically retries these
- Should not affect functionality

## Long-term Solutions

### For Production (Recommended)
1. **Supabase Pro** ($25/month)
   - Configurable connection pools
   - No hard-coded limits
   - Better performance

2. **IPv4 Add-on** ($4/month)
   - Enables IPv4 for direct connections
   - Bypasses pooler entirely
   - Settings → Network → IPv4 Add-on

## Code Changes Applied

We've optimized the Prisma client configuration to:
- Use minimal connections (1 instead of 10)
- Extended timeouts for IPv4 pooler
- Automatic retry logic for prepared statement errors
- Smart detection of pooler mode

## Summary

**The Fix**: Update DATABASE_URL to the IPv4 pooler URL and redeploy with cache cleared. This immediately resolves the IPv6 incompatibility between Vercel and Supabase.

---

**Last Updated**: January 2025
**Status**: Ready for deployment