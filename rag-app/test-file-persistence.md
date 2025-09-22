# File Persistence Test Plan

## Current Status
✅ Files upload to Supabase Storage  
✅ DuckDB tables export as JSON  
⚠️ API endpoints may have auth issues  
⚠️ Cloud sync not fully tested  

## Test Steps

### 1. Test Local Upload
1. Open app in Chrome
2. Upload a CSV file
3. Check browser console for:
   - "Table created with X rows"
   - "Parquet exported and uploaded" (should work now)
   - "File metadata saved to database" (may fail if auth issue)

### 2. Check Supabase Storage
1. Open Supabase dashboard
2. Go to Storage → Buckets
3. Verify files exist in:
   - `user-uploads` - Original CSV files
   - `duckdb-tables` - JSON export of tables

### 3. Test Cross-Browser
1. Sign out from Chrome
2. Open in Firefox/Safari
3. Sign in with same account
4. Navigate to same page
5. Check if files load automatically

## Known Issues

### Auth/Database Errors
If you see 500 errors in the console:
- The auth system may not be properly configured on Vercel
- Check Vercel environment variables:
  - `DATABASE_URL` - Must point to production database
  - `SESSION_SECRET` - Must be set for auth
  - `SUPABASE_URL` and keys must match production

### Debugging Tips
1. Check browser console for detailed errors
2. Check Network tab for failed API calls
3. Check Vercel logs for server-side errors

## What Should Work Now
- ✅ CSV uploads to Supabase Storage
- ✅ DuckDB tables created locally
- ✅ Tables persisted to IndexedDB
- ✅ JSON export of tables (fixed)
- ⚠️ Save metadata to database (if auth works)
- ⚠️ Load files from cloud on page load (if auth works)

## Next Steps If Not Working
1. Verify Vercel environment variables
2. Check if user session persists across requests
3. Verify database connection on Vercel
4. Check Supabase bucket permissions