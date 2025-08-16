# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a production-ready Retrieval-Augmented Generation (RAG) application with a broken page editor that needs to be rebuilt with Notion/Coda-style block architecture (Task 20).

**Tech Stack:**
- **Frontend**: Remix + React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Prisma ORM + PostgreSQL (with pgvector)
- **Infrastructure**: Supabase (local) + Redis + BullMQ
- **AI/ML**: OpenAI embeddings + vector search
- **Current Editor**: Broken drag-and-drop canvas (needs complete rebuild)

## Essential Commands

### Development Workflow
```bash
# Start development (requires Docker running)
npm run dev                    # Starts on http://localhost:3001

# Database operations
npx prisma db push            # Apply schema changes
npx prisma studio             # Visual database editor
npx prisma migrate dev        # Create migrations

# Testing
npm test                      # Run all tests
npm run test:ui              # Tests with UI
npm run test:coverage        # Coverage report

# Code quality
npm run typecheck            # TypeScript checking
npm run lint                 # ESLint

# Supabase (local development)
npx supabase start           # Start local Supabase (port 54341)
npx supabase stop            # Stop Supabase
npx supabase status          # Check service status
```

### Task Management (Task Master)
```bash
task-master list             # Show all tasks
task-master next             # Get next task to work on
task-master show <id>        # View task details
task-master set-status --id=<id> --status=in-progress
task-master set-status --id=<id> --status=done
```

**Current Priority: Task 20 - Rebuild Page Editor with Notion/Coda-style Block Architecture**

## Architecture & Key Patterns

### Database Schema
- **Multi-tenant**: Workspaces → Projects → Pages → Blocks
- **JSONB Storage**: Page content and block data stored as JSONB
- **Vector Search**: pgvector extension for embeddings
- **Real-time**: Triggers for content indexing queue

### Authentication Flow
1. Dev login: `/auth/dev-login?redirectTo=/app`
2. JWT tokens with refresh mechanism
3. Workspace-based RBAC with roles/permissions
4. Session management via cookies

### Content Indexing Pipeline (Task 19 - Completed)
```
Page Update → DB Trigger → indexing_queue → Realtime Indexer → Vector Embeddings
```
- Real-time indexing via Supabase triggers
- Debounced batch processing (500ms)
- Incremental updates with change tracking

### Current Page Editor Issues (Task 20 - CRITICAL)
- **Problem**: Drag-and-drop canvas is broken, preventing content creation
- **Solution**: Complete rebuild with Tiptap + virtual scrolling
- **Blocks RAG**: Task 16 (RAG Infrastructure) - editor must work first

## Environment Configuration

### Critical Environment Variables
```env
# Supabase (local) - IMPORTANT: Use port 54341, not 54321
SUPABASE_URL=http://localhost:54341
DATABASE_URL=postgresql://postgres:postgres@localhost:54342/postgres?schema=public

# Redis (required for caching/queues)
REDIS_URL=redis://localhost:6379

# OpenAI (for embeddings)
OPENAI_API_KEY=your_key_here
```

### Known Port Configurations
- **App**: 3001 (configured in vite.config.ts)
- **Supabase Studio**: 54340
- **Supabase API**: 54341
- **PostgreSQL**: 54342

## Key File Locations

### Page Editor (needs rebuild)
- `app/components/editor/PageEditor.tsx` - Main editor component (broken)
- `app/components/editor/BlockEditor.tsx` - Block system (to be replaced)
- `app/routes/editor.$pageId.tsx` - Editor route

### Core Services
- `app/services/auth/auth.server.ts` - Authentication
- `app/services/rag.server.ts` - RAG implementation
- `app/services/indexing/realtime-indexer.ts` - Real-time indexing
- `app/services/ai-controller.server.ts` - AI chat/commands

### Database
- `prisma/schema.prisma` - Database schema
- `app/utils/db.server.ts` - Prisma client

## Common Issues & Solutions

### Docker/Supabase Not Running
```bash
open -a Docker           # Start Docker on macOS
npx supabase start      # Start Supabase after Docker is running
```

### Database Connection Errors
1. Check Docker is running
2. Verify Supabase is running: `npx supabase status`
3. Ensure DATABASE_URL uses port 54342

### Vite Dependency Errors
```bash
rm -rf node_modules/.vite
npm run dev
```

### Page Creation Failures
- Check `workspace_id` and `created_by` are included
- Verify pages table has required columns (slug, metadata)

## Testing Strategy

### For Page Editor Rebuild (Task 20)
1. Virtual scrolling with 10,000+ blocks at 60fps
2. Slash commands appear < 50ms
3. Keyboard navigation (arrows, Tab, Cmd+Enter)
4. Auto-save with 500ms debounce
5. Block transformations preserve content
6. Real-time collaboration via Supabase

### General Testing
```bash
# Run specific test file
npm test app/services/auth/auth.server.test.ts

# Watch mode for TDD
npm test -- --watch

# Update snapshots
npm test -- -u
```

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md