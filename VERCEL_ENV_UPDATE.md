# Vercel Environment Variables - CRITICAL UPDATE

## Redis Fix (Railway)
The Redis URL in Vercel needs to be updated to the correct endpoint:

```
REDIS_URL=redis://default:TNSPqIwXlcoZLekWzIscPftfFFVfgJim@switchback.proxy.rlwy.net:17908
```

The old URL using `monorail.proxy.rlwy.net:54939` is INCORRECT and causing timeouts.

## Alternative: Disable Redis
If Redis continues to fail, set:
```
REDIS_PROVIDER=none
```

This will disable caching but the app will still work.