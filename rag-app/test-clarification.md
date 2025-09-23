# Testing Clarification Feature

## Test Cases

### 1. Very Low Confidence (< 0.3) - Should Show "Not Found" Prompt
- Query: "analyze xyz random data" (no matching files)
- Expected: FileNotFoundPrompt appears with available files listed

### 2. Low Confidence (0.3-0.5) - Should Show Clarification Prompt  
- Query: "show me some data" (vague, could match any file)
- Expected: FileClarificationPrompt appears asking to confirm best match

### 3. Medium Confidence (0.5-0.8) - Should Auto-Select
- Query: "economic data" (should match economic file with ~0.8 confidence)
- Expected: Query proceeds without clarification

### 4. High Confidence (> 0.8) - Should Auto-Select
- Query: "global_economic_indicators" (exact match)
- Expected: Query proceeds immediately

## How to Test

1. Open http://localhost:3001/app/editor/[editorId]
2. Upload at least 2-3 CSV files with different names
3. Try the queries above in the chat sidebar
4. Verify the appropriate prompts appear based on confidence levels

## Console Logs to Watch

Look for these in browser console:
- `[ChatSidebar] File matching results:` - Shows confidence scores
- `[ChatSidebar] No suitable file match found` - Triggers not-found prompt
- `[ChatSidebar] Low confidence match, requesting clarification` - Triggers clarification
- `[ChatSidebar] Using fuzzy match:` - Auto-selects file

## User Actions to Test

When clarification appears:
1. **"Yes, use this file"** - Should proceed with suggested file
2. **"No, different file"** - Should show file browser
3. **"Browse all files"** - Should show all available files
4. **"Query All Files"** (in not-found) - Should query all loaded files