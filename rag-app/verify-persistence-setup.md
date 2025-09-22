# File Persistence Verification Checklist

## 🔴 CRITICAL: Fix These First in Vercel Dashboard

### 1. DATABASE_URL - MUST CHANGE NOW
```
# WRONG (current - using transaction pooler port 6543):
DATABASE_URL=postgresql://postgres.PROJECT-REDACTED:PASSWORD-REDACTED@aws-1-us-east-2.pooler.supabase.com:6543/postgres

# CORRECT (use session pooler port 5432):
DATABASE_URL=postgresql://postgres.PROJECT-REDACTED:PASSWORD-REDACTED@aws-1-us-east-2.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1
```

### 2. SUPABASE_SERVICE_ROLE_KEY - GET FROM DASHBOARD
The current key has a typo. Get the correct one:
1. Go to https://supabase.com/dashboard
2. Select your project
3. Settings → API
4. Copy the `service_role` key (under "Project API keys")
5. Replace in Vercel

### 3. APP_URL - UPDATE TO YOUR VERCEL URL
```
# Change from:
APP_URL=https://your-app.vercel.app

# To your actual URL:
APP_URL=https://rag-workspace-i7ko0wtpn-joeys-projects-5f82499b.vercel.app
```

## ✅ Verification Steps

### Step 1: Check Supabase Buckets
1. Go to Supabase Dashboard → Storage
2. Verify these buckets exist:
   - `user-uploads` (for original CSV files)
   - `duckdb-tables` (for JSON table exports)

### Step 2: Test Local Development
```bash
# Start local Supabase
npx supabase start

# Check migrations applied
npx supabase db reset

# Start dev server
npm run dev
```

1. Upload a CSV file
2. Check browser console for:
   - "File uploaded to Supabase storage"
   - "Table created with X rows"
   - "Parquet exported and uploaded"
   - "File metadata saved to database"

### Step 3: Deploy and Test Production
After fixing Vercel env vars:

```bash
# Deploy to Vercel
git push origin main
```

Wait for deployment, then test:
1. Open production URL in Chrome
2. Sign in and upload a CSV
3. Check Network tab - no 500 errors
4. Sign out
5. Open in Firefox/Safari incognito
6. Sign in with same account
7. Files should load automatically

## 🔍 Debugging Commands

### Check Database Connection
```sql
-- Run in Supabase SQL Editor
SELECT * FROM user_workspaces WHERE user_id = 'YOUR_USER_ID';
SELECT * FROM data_files ORDER BY created_at DESC LIMIT 10;
```

### Check Storage Files
```sql
-- List files in storage
SELECT * FROM storage.objects 
WHERE bucket_id IN ('user-uploads', 'duckdb-tables')
ORDER BY created_at DESC LIMIT 20;
```

### Monitor Vercel Logs
1. Go to Vercel Dashboard
2. Select your project
3. Functions tab → View logs
4. Look for auth/database errors

## 📊 Expected Flow

### Upload Flow:
1. User uploads CSV → Browser
2. CSV → Supabase Storage (`user-uploads` bucket)
3. CSV → DuckDB table (client-side)
4. DuckDB table → JSON export
5. JSON → Supabase Storage (`duckdb-tables` bucket)
6. Metadata → PostgreSQL database

### Load Flow:
1. Page loads → Fetch file metadata from API
2. For each file:
   - Download JSON from `duckdb-tables` bucket
   - Restore DuckDB table from JSON
   - Show in UI

## 🚨 Common Issues & Solutions

### Issue: 500 errors on API calls
**Solution**: Fix DATABASE_URL to use port 5432 (session pooler)

### Issue: "Bucket not found" error
**Solution**: Run migrations to create buckets
```bash
npx supabase db reset
```

### Issue: Files don't persist across browsers
**Causes**:
1. DATABASE_URL using wrong pooler ✅ (we know this)
2. SERVICE_ROLE_KEY invalid ✅ (we know this)
3. Auth session not persisting (check SESSION_SECRET)
4. CORS issues (check APP_URL)

### Issue: "Failed to save file metadata"
**Solution**: Check all three env vars are fixed in Vercel

## 📝 Test Data

Use this CSV for testing:
```csv
product,category,price,quantity
Laptop,Electronics,999.99,50
Phone,Electronics,599.99,100
Desk,Furniture,299.99,25
Chair,Furniture,149.99,40
```

Save as `test-products.csv` and upload.

## ✅ Success Indicators

When everything works:
1. No 500 errors in console/network
2. Files appear in Supabase Storage dashboard
3. Database has entries in `data_files` table
4. Files persist across browsers
5. Files survive deployments
6. Sync status shows "✓ Synced" in UI

## 🎯 Final Verification

After fixing Vercel env vars, run this test:
1. Upload file in Chrome
2. Check Supabase Storage - file exists ✅
3. Open Firefox incognito
4. Sign in - file loads automatically ✅
5. Success! 🎉

---

**Remember**: The code is working. Only the Vercel environment variables need fixing!