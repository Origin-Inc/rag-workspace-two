# Phase 1: Critical API Error Fix

## Problem
`messages.slice(-10)` is called when messages might be undefined or not an array.

## Solution

### 1. Fix ChatSidebarPerformant.tsx
Replace line 255:
```javascript
// OLD - BROKEN
conversationHistory: messages.slice(-10),

// NEW - SAFE
conversationHistory: Array.isArray(messages) ? messages.slice(-10) : [],
```

### 2. Fix api.chat-query.tsx
Add validation at line 69:
```javascript
// After destructuring
const { query, files, pageId, workspaceId, conversationHistory } = body;

// Add validation
const safeConversationHistory = Array.isArray(conversationHistory) ? conversationHistory : [];
```

### 3. Fix all .slice() calls with null checks
Search and replace all unsafe slice operations.

## Implementation