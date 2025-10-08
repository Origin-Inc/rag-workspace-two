# Supabase Authentication Fix

## Problem
"Invalid Compact JWS" error (403) when uploading files to Supabase Storage in production.

## Root Cause
The FileStorageService uses `createSupabaseServerClient` which expects JWT tokens from cookies, but in production these might not be properly set or passed.

## Solution Options

### Option 1: Use Service Role Key (Admin Access)
For file uploads, we should use the service role key which has full access:

```typescript
// In FileStorageService constructor
constructor(request: Request, response: Response) {
  // For production, use admin client for storage operations
  if (process.env.NODE_ENV === 'production') {
    this.supabase = createSupabaseAdmin();
  } else {
    this.supabase = createSupabaseServerClient(request, response);
  }
}
```

### Option 2: Fix JWT Token Passing
Ensure the JWT token from our custom auth is properly passed to Supabase:

```typescript
// In createSupabaseServerClient
const accessToken = await getAccessTokenFromSession(request);
if (accessToken) {
  options.global.headers['Authorization'] = `Bearer ${accessToken}`;
}
```

## Recommendation
Use Option 1 (Service Role Key) for file storage operations since:
1. File uploads are server-side operations
2. We control access through our own auth system
3. Service role has guaranteed permissions

## Implementation