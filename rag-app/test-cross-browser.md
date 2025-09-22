# Cross-Browser File Persistence Test Plan

## Test Scenarios

### 1. File Upload and Sign Out Test
1. Open app in Chrome at http://localhost:3001
2. Sign in with test credentials
3. Navigate to a chat page
4. Upload a CSV file
5. Verify file appears with cloud sync indicator (green checkmark)
6. Sign out
7. Open app in Incognito/Private mode
8. Sign in with same credentials
9. Navigate to same chat page
10. **Expected**: File should be present with all data intact

### 2. Cross-Browser Test
1. Open app in Chrome
2. Upload files and verify sync status
3. Open same account in Firefox/Safari
4. **Expected**: All files should be available

### 3. Deployment Persistence Test
1. Upload files in local development
2. Deploy to Vercel/production
3. Sign in to production
4. **Expected**: Files should persist (if using same Supabase instance)

## Verification Points
- [ ] Files show sync status indicator (green checkmark when synced)
- [ ] Files persist after sign out/sign in
- [ ] Files available across different browsers
- [ ] DuckDB tables are correctly restored with all data
- [ ] File metadata (row count, size) is preserved
- [ ] Query functionality works on restored files

## Known Limitations
- Files are workspace-specific (won't appear in different workspaces)
- Large files may take longer to sync
- Initial load may be slower as files download from cloud