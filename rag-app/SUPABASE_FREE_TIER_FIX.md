# 🚨 CRITICAL: Supabase Free Tier Connection Limit Issue

## The Real Problem
**Supabase's free tier IGNORES the `connection_limit` parameter!** The pooler has a hard-coded limit that cannot be changed. That's why it always shows `connection limit: 3` regardless of your DATABASE_URL settings.

## Immediate Workaround - Use Direct Connection

### Change DATABASE_URL in Vercel to:
```
postgresql://postgres:PASSWORD-REDACTED@db.PROJECT-REDACTED.supabase.co:5432/postgres?schema=public&connection_limit=5
```

This:
- Bypasses the pooler completely (uses db.PROJECT-REDACTED instead of pooler.supabase.com)
- Connects directly to the database
- Should work for low-traffic apps

### Why This Works
- Direct connections aren't limited by the pooler's hard-coded restrictions
- Free tier allows up to 60 direct connections
- Vercel serverless functions will use fewer connections without the pooler overhead

## Alternative Solutions

### Option 1: Use Minimal Connection Pool
If direct connection doesn't work, try:
```
postgresql://postgres.PROJECT-REDACTED:PASSWORD-REDACTED@aws-1-us-east-2.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1&pool_timeout=0
```
- Sets connection_limit=1 (what Prisma recommends for serverless)
- Sets pool_timeout=0 (waits indefinitely instead of timing out)

### Option 2: Add Retry Logic
Create a file `prisma/client.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Add connection retry
prisma.$connect().catch(async (e) => {
  console.error('Initial connection failed, retrying...', e);
  await new Promise(resolve => setTimeout(resolve, 1000));
  return prisma.$connect();
});
```

### Option 3: Upgrade Supabase (Long-term)
The only permanent fix is to upgrade to Supabase Pro ($25/month) which provides:
- Configurable connection limits
- Better pooler performance
- No hard-coded restrictions

## Test Order

1. **First**: Try the direct connection URL above
2. **If that fails**: Try Option 1 with minimal pooler settings
3. **If still failing**: Implement retry logic (Option 2)
4. **Last resort**: Consider upgrading Supabase

## Verification

After changing DATABASE_URL and redeploying:
- Sign-in should work
- No more "connection limit: 3" errors
- May see different connection limits or no limit message at all

## Important Notes

- **Direct connections use more resources** but work better for low-traffic apps
- **Pooler is better for high traffic** but limited on free tier
- **This is a Supabase free tier limitation**, not a bug in your code

**Change the DATABASE_URL NOW to the direct connection!**