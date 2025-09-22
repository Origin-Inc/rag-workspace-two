# 🚨 URGENT: Database Connection Pool Timeout

## The Problem
Your app can't connect to the database. Users can't sign in. The connection pool is exhausted.

## Quick Fix Required in Vercel

### Add Missing DIRECT_URL Environment Variable

You need to add `DIRECT_URL` in Vercel environment variables:

```
DIRECT_URL=postgresql://postgres.PROJECT-REDACTED:PASSWORD-REDACTED@db.PROJECT-REDACTED.supabase.co:5432/postgres
```

Note: This uses the direct connection (db.PROJECT-REDACTED.supabase.co) not the pooler.

### Verify DATABASE_URL is Correct

Make sure this is still set correctly:
```
DATABASE_URL=postgresql://postgres.PROJECT-REDACTED:PASSWORD-REDACTED@aws-1-us-east-2.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1
```

## Why This Happened

Prisma requires two database URLs:
1. **DATABASE_URL** - For application queries (uses connection pooler)
2. **DIRECT_URL** - For migrations and schema introspection (direct connection)

Without DIRECT_URL, Prisma tries to use DATABASE_URL for everything, exhausting the limited connection pool.

## Steps to Fix

1. **Go to Vercel Dashboard** → Project Settings → Environment Variables
2. **Add `DIRECT_URL`** with the value above
3. **Redeploy** (will happen automatically after saving)
4. **Test sign in** - Should work immediately after deployment

## Connection Limits

The error shows:
- Connection pool timeout: 10 seconds
- Connection limit: 3 connections

This is very low. After adding DIRECT_URL, consider updating DATABASE_URL to:
```
DATABASE_URL=postgresql://postgres.PROJECT-REDACTED:PASSWORD-REDACTED@aws-1-us-east-2.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=5&pool_timeout=20
```

This increases:
- connection_limit from 1 to 5
- pool_timeout to 20 seconds

## Verification

After deployment, check:
1. Sign in works
2. File uploads work
3. No more timeout errors

This is the #1 priority - without database connections, nothing works!