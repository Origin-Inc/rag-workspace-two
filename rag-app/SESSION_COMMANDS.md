# Claude Sessions - Development Session Management

Claude Sessions helps you maintain context and track progress across your development sessions. It creates timestamped markdown files that document your work, making it easy to resume where you left off.

## Quick Start

### Start a new session
```bash
npm run session:start "fixing infinite loop bug"
# Creates: sessions/2024-11-20-1430-fixing-infinite-loop-bug.md
```

### Update progress during work
```bash
npm run session:update "Fixed Zustand hooks, testing now"
# Adds timestamped update to current session
```

### End session with summary
```bash
npm run session:end
# Generates summary with duration, commits, and accomplishments
```

### View sessions
```bash
npm run session                    # List all sessions
npm run session:view                # List all sessions  
npm run session:view [filename]     # View specific session content
```

## Features

### Automatic Tracking
- Git branch and status
- Changed files count
- Commit history
- Session duration
- Update timestamps

### Session Files
Sessions are stored in `sessions/` directory with format:
- `YYYY-MM-DD-HHMM-name.md` (with name)
- `YYYY-MM-DD-HHMM.md` (without name)

### Current Session
The active session is tracked in `sessions/.current-session`

## Usage Examples

### Starting a focused session
```bash
npm run session:start "implementing DuckDB persistence"
```

### Quick progress updates
```bash
npm run session:update  # Auto-generates update from git status
```

### Detailed progress notes
```bash
npm run session:update "Completed IndexedDB integration, all tests passing"
```

### Reviewing past work
```bash
npm run session:view 2024-11-20-1430-fixing-infinite-loop-bug.md
```

## Integration with AI

The session files are markdown formatted and designed to be easily consumed by AI assistants like Claude. When starting a new conversation, you can share your recent session file to provide full context.

### Session Structure
- **Header**: Session name, start time, git context
- **Objectives**: Task checklist (manually editable)
- **Session Log**: Timestamped updates with git status
- **Summary**: Auto-generated with commits, duration, and tasks

## Tips

1. **Start sessions for focused work**: Begin a session when tackling a specific feature or bug
2. **Update regularly**: Add updates when you complete subtasks or make significant progress
3. **Use descriptive names**: Help your future self by naming sessions clearly
4. **Review before resuming**: Check the last session to quickly get back into context
5. **Share with AI**: Provide session files to AI assistants for better context

## Directory Structure
```
rag-app/
├── commands/           # Session command scripts
│   ├── session-start.js
│   ├── session-update.js
│   ├── session-end.js
│   └── session-view.js
└── sessions/          # Session files
    ├── .current-session
    └── *.md files
```

## Git Integration

Sessions automatically capture:
- Current branch
- Last commit hash
- File change statistics  
- Commits made during session
- Staged/unstaged changes

This helps maintain a complete picture of your development progress.