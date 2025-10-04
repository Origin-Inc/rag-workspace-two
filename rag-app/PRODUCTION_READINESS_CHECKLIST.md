# Production Readiness Checklist for File Persistence

## Current Status: 🟡 Partially Ready

### ✅ What's Working (Locally)
- [x] File upload to Supabase Storage (`user-uploads` bucket)
- [x] DuckDB table creation from CSV/Excel files  
- [x] DuckDB table serialization to JSON
- [x] JSON export to Supabase Storage (`duckdb-tables` bucket)
- [x] Storage buckets created with proper RLS policies
- [x] Database schema includes `data_files` table
- [x] API endpoints implemented for file metadata
- [x] Client-side sync service for loading files

### ❌ What Needs Fixing (On Vercel)
- [ ] **DATABASE_URL** - Using wrong pooler (port 6543 instead of 5432)
- [ ] **SUPABASE_SERVICE_ROLE_KEY** - Contains typo making it invalid
- [ ] **APP_URL** - Not set to actual Vercel URL

## Quick Fix Guide

### 1. Open Vercel Dashboard
Go to: https://vercel.com/dashboard → Select your project → Settings → Environment Variables

### 2. Update These Variables

#### DATABASE_URL
```
# Change FROM:
postgresql://[PROJECT_ID]:[PASSWORD]@[HOST]:6543/postgres

# Change TO:
postgresql://[PROJECT_ID]:[PASSWORD]@[HOST]:5432/postgres?pgbouncer=true&connection_limit=1
```

**Note**: 
- Replace `[PROJECT_ID]` with your Supabase project ID
- Replace `[PASSWORD]` with your database password
- Replace `[HOST]` with your database host (e.g., aws-0-us-east-1.pooler.supabase.com)
- Port should be 5432 for direct connection, not 6543

#### SUPABASE_SERVICE_ROLE_KEY
1. Go to: https://supabase.com/dashboard
2. Select your project
3. Settings → API
4. Copy the `service_role` key (NOT the anon key)
5. Replace in Vercel

#### APP_URL
```
# Change FROM:
https://your-app.vercel.app

# Change TO (your actual URL):
https://[YOUR-PROJECT-NAME].vercel.app
```

### 3. Redeploy
After saving all changes, trigger a new deployment.

## Testing Production

### Test Upload Flow
1. Sign in at your Vercel URL
2. Navigate to editor page
3. Upload a CSV file via sidebar
4. Check browser console:
   - Should see "File uploaded to Supabase storage"
   - Should see "Parquet exported and uploaded" 
   - Should see "File metadata saved to database"
   - No 500 errors

### Test Persistence
1. After uploading in Chrome, sign out
2. Open Firefox/Safari in incognito
3. Sign in with same account
4. Navigate to same editor page
5. Files should auto-load with message: "Loading X files from cloud storage"

### Verify in Supabase Dashboard
1. Go to Storage → Browse files
2. Check `user-uploads` → files/[workspaceId]/
3. Check `duckdb-tables` → tables/[workspaceId]/
4. Both should have your uploaded files

## Architecture Overview

```
User uploads CSV → Browser
         ↓
    Parse CSV data
         ↓
    Upload to Supabase Storage
    (user-uploads bucket)
         ↓
    Create DuckDB table locally
         ↓
    Export table as JSON
         ↓
    Upload JSON to Storage
    (duckdb-tables bucket)
         ↓
    Save metadata to PostgreSQL
    (data_files table)
         
On page load:
    Fetch metadata from API
         ↓
    Download JSON from Storage
         ↓
    Restore DuckDB tables
         ↓
    Display in UI
```

## Security Notes
- All storage buckets use RLS policies
- Users can only access files in their workspace
- Service role key required for admin operations
- Session pooler required for Prisma prepared statements

## Monitoring
Once deployed, monitor:
- Vercel Functions logs for errors
- Supabase Dashboard → Logs → API logs
- Browser console for client-side errors
- Network tab for failed API calls

## Success Metrics
- Zero 500 errors in production
- Files persist across browser sessions
- Files survive deployments
- Sub-second file metadata loading
- <3 second DuckDB table restoration

---

**Remember**: The code is complete and working. Only the Vercel environment variables need to be corrected!