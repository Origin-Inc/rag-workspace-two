# Testing Enhanced Block Editor Slash Commands

## Test Instructions

1. Open the editor page: http://localhost:3001/editor/4d345792-d36a-4045-b510-034b5d288c8f

2. Test the following slash commands:

### Basic Block Commands
- Type `/` to open command menu
- Type `/paragraph` or `/p` for paragraph block
- Type `/heading1` or `/h1` for heading 1
- Type `/heading2` or `/h2` for heading 2
- Type `/heading3` or `/h3` for heading 3
- Type `/bullet` or `/ul` for bullet list
- Type `/number` or `/ol` for numbered list
- Type `/quote` for blockquote
- Type `/code` for code block

### Advanced Block Commands
- Type `/database` to insert a database table block
- Type `/ai` to insert an AI analysis block
- Type `/divider` or `/---` for horizontal rule
- Type `/todo` for task list

### Keyboard Shortcuts
- `Enter` - Create new block
- `Backspace` (at start) - Delete block
- `Tab` - Indent block
- `Shift+Tab` - Outdent block
- `Cmd/Ctrl+Z` - Undo
- `Cmd/Ctrl+Shift+Z` - Redo
- `Cmd/Ctrl+K` - Open command palette

## Current Status

✅ **Blocks Saving**: Confirmed working - blocks save to PostgreSQL JSONB column
✅ **Enhanced Editor**: Integrated into production at `/editor/$pageId`
✅ **Block Types**: Supports paragraph, headings, database, AI blocks
✅ **Command Palette**: Fixed React hook error with ClientOnly wrapper

## Testing Database Block

When you insert a database block with `/database`:
1. You should see an editable table
2. Can add/remove columns
3. Can add/remove rows
4. Can edit cell values
5. Can switch views (table, kanban, calendar, etc.)
6. AI analysis button should be visible

## Testing AI Block

When you insert an AI block with `/ai`:
1. Enter a prompt/question
2. Optionally add context from other blocks
3. Click "Analyze" to get AI response
4. Response should appear below the prompt

## Verification

The page currently has these blocks saved in the database:
```json
[
  {
    "id": "block1",
    "type": "paragraph",
    "content": "This is a regular paragraph block"
  },
  {
    "id": "block2",
    "type": "heading1",
    "content": "Database Block Test"
  },
  {
    "id": "block3",
    "type": "database",
    "content": {
      "viewType": "table",
      "columns": [
        { "id": "col1", "name": "Name", "type": "text" },
        { "id": "col2", "name": "Status", "type": "select" }
      ],
      "rows": [
        { "id": "row1", "cells": { "col1": "Task 1", "col2": "Done" } }
      ]
    }
  },
  {
    "id": "block4",
    "type": "ai",
    "content": {
      "prompt": "Analyze the tasks",
      "response": null
    }
  }
]
```

These should be visible when you load the page!