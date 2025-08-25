# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Production-ready Retrieval-Augmented Generation (RAG) application with a Notion/Coda-style block editor currently being rebuilt (Task 20).

**Tech Stack:**
- **Frontend**: Remix + React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Prisma ORM + PostgreSQL (pgvector)
- **Infrastructure**: Supabase (local) + Redis + BullMQ
- **AI/ML**: OpenAI embeddings + vector search
- **Editor**: Tiptap-based block editor with virtual scrolling (in progress)

## Quick Reference Commands

### Development
```bash
npm run dev                    # Start app on http://localhost:3001
npm test                       # Run all tests
npm run typecheck             # TypeScript checking
npm run lint                  # ESLint

# Single test file
npm test app/services/auth/auth.server.test.ts

# Watch mode for TDD
npm test -- --watch
```

### Database
```bash
npx prisma db push            # Apply schema changes
npx prisma migrate dev        # Create migrations
npx prisma studio            # Visual database editor
```

### Supabase (Local)
```bash
npx supabase start           # Start local Supabase (port 54341)
npx supabase stop            # Stop Supabase
npx supabase status          # Check service status
```

### Task Management
```bash
task-master next             # Get next task to work on
task-master show <id>        # View task details
task-master set-status --id=<id> --status=in-progress
task-master set-status --id=<id> --status=done
```

## Architecture

### Multi-Tenant Data Model
```
Workspaces → Projects → Pages → Blocks
    ↓           ↓         ↓        ↓
  Users     Documents  Content  JSONB data
```

### Core Services Architecture

#### Authentication (`app/services/auth/`)
- JWT-based with refresh tokens
- Workspace-based RBAC
- Dev login: `/auth/dev-login?redirectTo=/app`
- Session management via cookies

#### RAG Pipeline (`app/services/rag.server.ts`)
- Document chunking with sliding window
- OpenAI embeddings generation
- pgvector similarity search
- BullMQ background processing

#### Real-time Indexing (`app/services/indexing/`)
```
Page Update → DB Trigger → indexing_queue → Batch Processor → Embeddings
                                               (500ms debounce)
```

#### Database Block System (`app/services/database-block-*.server.ts`)
- Core CRUD operations
- Formula engine with expression evaluation
- Performance monitoring
- Pagination with virtual scrolling support
- Schema validation

## Current Priority: Task 20 - Page Editor Rebuild

### Problem
Drag-and-drop canvas editor is broken, blocking content creation.

### Solution in Progress
Complete rebuild using:
- Tiptap for rich text editing
- Virtual scrolling for performance (10,000+ blocks)
- Slash commands (< 50ms response)
- Block transformations
- Auto-save with 500ms debounce

### Key Files
- `app/components/editor/TiptapBlockEditor.tsx` - New Tiptap implementation
- `app/components/editor/EnhancedBlockEditor.tsx` - Enhanced editor wrapper
- `app/hooks/useDatabaseBlock.ts` - Block state management
- `app/routes/app.editor-demo.tsx` - Editor demo route

## Environment Setup

### Required Environment Variables
```env
# Supabase (local) - IMPORTANT: Use port 54341
SUPABASE_URL=http://localhost:54341
DATABASE_URL=postgresql://postgres:postgres@localhost:54342/postgres?schema=public

# Redis (required for caching/queues)
REDIS_URL=redis://localhost:6379

# OpenAI (for embeddings)
OPENAI_API_KEY=your_key_here
```

### Port Configuration
- **App**: 3001 (configured in `vite.config.ts`)
- **Supabase Studio**: 54340
- **Supabase API**: 54341
- **PostgreSQL**: 54342

## Development Workflow

### Starting a New Task
1. `task-master next` - Find next available task
2. `task-master show <id>` - Review requirements
3. `task-master set-status --id=<id> --status=in-progress`
4. Implement following existing patterns
5. Run tests and lint: `npm test && npm run lint`
6. `task-master set-status --id=<id> --status=done`

### Before Committing
```bash
npm run typecheck       # Ensure no TypeScript errors
npm run lint           # Fix any linting issues
npm test              # All tests must pass
```

### Common Issues & Solutions

#### Docker/Supabase Not Running
```bash
open -a Docker           # Start Docker on macOS
npx supabase start      # Start Supabase after Docker
```

#### Database Connection Errors
1. Check Docker is running
2. Verify Supabase: `npx supabase status`
3. Ensure DATABASE_URL uses port 54342

#### Vite Dependency Errors
```bash
rm -rf node_modules/.vite
npm run dev
```

## Task Master Integration

### MCP Tools Available
- `get_tasks` - List all tasks
- `next_task` - Get next task
- `get_task` - Show task details
- `set_task_status` - Update task status
- `expand_task` - Break into subtasks
- `update_subtask` - Add implementation notes

### Task ID Format
- Main tasks: `1`, `2`, `3`
- Subtasks: `1.1`, `1.2`, `2.1`
- Sub-subtasks: `1.1.1`, `1.1.2`

### Task Status Values
- `pending` - Ready to work on
- `in-progress` - Currently working
- `done` - Completed
- `blocked` - Waiting on dependencies

## Testing Strategy

### Editor Performance Requirements (Task 20)
1. Virtual scrolling: 10,000+ blocks at 60fps
2. Slash commands: < 50ms response
3. Keyboard navigation: arrows, Tab, Cmd+Enter
4. Auto-save: 500ms debounce
5. Block transformations preserve content

### Running Tests
```bash
npm test                      # All tests
npm run test:coverage        # Coverage report
npm test -- --watch          # Watch mode
```

## Important Patterns

### Follow Existing Code Conventions
- Check neighboring files for framework usage
- Use existing utilities and libraries
- Match naming conventions and file structure
- Preserve exact indentation when editing

### Database Operations
- Always use Prisma for database access
- Include proper error handling
- Use transactions for multi-step operations
- Add indexes for frequently queried fields

### Component Development
- Use TypeScript with strict types
- Follow React best practices
- Implement proper loading and error states
- Use Tailwind for styling

## Key Directories

```
rag-app/
├── app/
│   ├── components/        # React components
│   │   ├── editor/       # Editor components (rebuild in progress)
│   │   └── database-block/ # Database block views
│   ├── services/         # Backend business logic
│   │   ├── auth/        # Authentication services
│   │   └── indexing/    # Content indexing
│   ├── routes/          # Remix routes
│   ├── hooks/           # React hooks
│   ├── utils/           # Utility functions
│   └── types/           # TypeScript types
├── prisma/
│   └── schema.prisma    # Database schema
└── .taskmaster/         # Task management files
```

## Do Not
- Manually edit `.taskmaster/tasks/tasks.json`
- Manually edit `.taskmaster/config.json`
- Create documentation unless explicitly requested
- Add comments unless specifically asked
- Use emojis unless requested
- Commit changes unless explicitly asked