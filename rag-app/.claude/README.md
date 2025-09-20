# Claude Sessions - Development Context Management

This directory contains custom Claude commands for managing development sessions. These commands help track progress, issues, and solutions across conversations with Claude.

## Installation

The commands are already installed in `.claude/commands/`. Claude will automatically recognize these slash commands.

## Available Commands

Use these commands directly in your Claude conversation:

- `/project:session-start [name]` - Start a new development session
- `/project:session-update [notes]` - Add progress notes to current session
- `/project:session-end` - End session with comprehensive summary
- `/project:session-list` - List all session files
- `/project:session-current` - Show current session status
- `/project:session-help` - Show help for session commands

## How It Works

1. **Session Files**: Stored in `.claude/sessions/` as markdown files
2. **Naming Format**: `YYYY-MM-DD-HHMM-name.md`
3. **Active Session**: Tracked in `.claude/sessions/.current-session`
4. **Automatic Tracking**: Git status, commits, todo progress

## Example Usage

```
User: /project:session-start fixing-infinite-loop
Claude: ✅ Started session: 2024-11-20-1430-fixing-infinite-loop.md

User: I found the issue in the Zustand hooks
/project:session-update Found infinite loop caused by unstable references

User: /project:session-end
Claude: Session ended with summary...
```

## Benefits

- **Context Preservation**: Never lose track of development progress
- **Automatic Documentation**: Git changes, todos, and decisions tracked
- **Future Reference**: Easily resume work or understand past changes
- **AI Continuity**: New Claude conversations can read session history

## Directory Structure

```
.claude/
├── commands/           # Command definitions
│   ├── session-start.md
│   ├── session-update.md
│   ├── session-end.md
│   ├── session-current.md
│   ├── session-list.md
│   └── session-help.md
└── sessions/          # Session files
    ├── .current-session
    └── YYYY-MM-DD-HHMM-*.md
```

## Tips

1. Start sessions for significant features or bug fixes
2. Update regularly with findings and solutions
3. End with comprehensive summary for future reference
4. Review past sessions before similar work

Based on: https://github.com/iannuttall/claude-sessions