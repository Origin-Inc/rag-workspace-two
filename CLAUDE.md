# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Production-ready Retrieval-Augmented Generation (RAG) application with a Notion/Coda-style block editor currently being rebuilt.

**Tech Stack:**
- **Frontend**: Remix + React + TypeScript + Tailwind CSS + Framer Motion
- **Backend**: Node.js + Prisma ORM + PostgreSQL (pgvector extension)
- **Infrastructure**: Supabase (local) + Redis + BullMQ
- **AI/ML**: OpenAI embeddings + vector search
- **Editor**: Tiptap-based block editor with virtual scrolling + Lexical editor components
- **Testing**: Vitest + Testing Library

## Quick Reference Commands

### Development
```bash
npm run dev                    # Start app on http://localhost:3001
npm test                       # Run all Vitest tests
npm run test:ui               # Run tests with UI
npm run test:coverage         # Generate coverage report
npm run typecheck             # TypeScript checking
npm run lint                  # ESLint

# Single test file
npm test app/services/auth/auth.server.test.ts

# Watch mode for TDD
npm test -- --watch

# Background workers
npm run worker                # Start indexing worker
npm run worker:dev            # Start worker with auto-reload
```

### Database
```bash
npx prisma db push            # Apply schema changes (dev)
npx prisma migrate dev        # Create and apply migrations
npx prisma studio            # Visual database editor
npx prisma generate          # Regenerate Prisma client
```

### Supabase (Local Development)
```bash
npx supabase start           # Start local Supabase (port 54341)
npx supabase stop            # Stop Supabase
npx supabase status          # Check service status
npx supabase db reset        # Reset database
```

## Architecture

### Multi-Tenant Data Model
```
Workspaces → Projects → Pages → Blocks
    ↓           ↓         ↓        ↓
  Users     Documents  Content  JSONB data
```

### Core Domain Models
- **User**: Auth, email verification, 2FA, password reset
- **Workspace**: Multi-tenant isolation, slug-based routing
- **Page**: Block-based content, version history, permissions
- **Block**: JSONB content, position ordering, type polymorphism
- **Document**: File storage, embeddings, indexing status
- **Query**: Search history, results caching

### Service Layer Architecture

#### Authentication (`app/services/auth/`)
- JWT-based with refresh tokens
- Workspace-based RBAC with role permissions
- Session management via cookies
- Dev login: `/auth/dev-login?redirectTo=/app`
- 2FA support with TOTP

#### RAG Pipeline
- Document chunking with sliding window overlap
- OpenAI embeddings generation (text-embedding-3-small)
- pgvector similarity search with cosine distance
- BullMQ background processing with Redis
- Real-time indexing with database triggers

#### Database Block System (`app/services/database-block-*.server.ts`)
- **database-block-core.server.ts**: CRUD operations
- **database-block-enhanced.server.ts**: Advanced features
- **database-block-indexes.server.ts**: Query optimization
- **database-block-pagination.server.ts**: Virtual scrolling
- **database-block-cache.server.ts**: Redis caching layer

#### AI Services (`app/services/`)
- **ai-controller.server.ts**: Command parsing and action execution
- **ai-block-service.server.ts**: Block-specific AI operations
- **openai.server.ts**: OpenAI API integration
- **streaming/ai-streaming.server.ts**: Server-sent events for streaming

## Routes Structure

### Public Routes
- `/` - Landing page
- `/auth/login` - User authentication
- `/auth/signup` - User registration
- `/auth/dev-login` - Development-only quick login

### Protected Routes (requires auth)
- `/app` - Main dashboard
- `/app/workspaces` - Workspace management
- `/app/projects` - Project listing
- `/app/editor/$editorId` - **Main production editor** (ALWAYS modify this, never create demos)
- `/app/rag` - RAG search interface
- `/app/database-blocks` - Database block management

## Environment Setup

### Required Environment Variables
```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:54342/postgres?schema=public

# Supabase (local) - IMPORTANT: Use port 54341 for API
SUPABASE_URL=http://localhost:54341
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Redis (required for caching/queues)
REDIS_URL=redis://localhost:6379

# OpenAI (required for embeddings and AI features)
OPENAI_API_KEY=your_key_here

# Session (generate with: openssl rand -hex 32)
SESSION_SECRET=your_session_secret

# App
APP_URL=http://localhost:3001
```

### Port Configuration
- **App**: 3001 (configured in `vite.config.ts`)
- **Supabase Studio**: 54340
- **Supabase API**: 54341
- **PostgreSQL**: 54342
- **Redis**: 6379

## Testing Strategy

### Test Organization
- Unit tests: Colocated with source files (`*.test.ts`)
- Integration tests: In `__tests__` directories
- E2E tests: In `e2e/` directory (when implemented)

### Key Test Patterns
```typescript
// Always mock external services
vi.mock('~/services/openai.server');
vi.mock('~/utils/supabase.server');

// Use test database transactions
const prisma = new PrismaClient();
await prisma.$transaction(async (tx) => {
  // Test operations
});
```

## CRITICAL RULES - NO EXCEPTIONS

### NEVER CREATE DEMOS OR TEST ROUTES
- **DO NOT** create routes like `/app.demo.tsx`, `/app.test-*.tsx`, or `/app.*-demo.tsx`
- **DO NOT** create "example" or "playground" implementations
- **DO NOT** build isolated proof-of-concepts
- **ALWAYS** integrate directly into existing production routes and components
- **ALWAYS** modify the actual user-facing editor at `/app/editor/$editorId.tsx`
- If you're creating a new file instead of modifying an existing one, STOP and reconsider

### PRODUCTION-ONLY MINDSET
- Every line of code must be immediately usable by end users
- If it's not shipping value to users TODAY, don't write it
- Take the risk of breaking existing code rather than creating safe demos
- Read and understand existing components BEFORE creating new ones
- Integration is harder than isolation - do the hard work

### Code Quality Standards
- TypeScript strict mode - no `any` types without justification
- All database operations must use Prisma (no raw SQL)
- API routes must validate input with Zod schemas
- Components must handle loading and error states
- Services must include proper error handling and logging

### SECURITY - CRITICAL RULES
**NEVER commit sensitive credentials to git:**
- NEVER put real API keys, passwords, or secrets in any file that gets committed
- ALWAYS use placeholder values in .env.example files (e.g., `sk-...your-key-here`, `REPLACE_WITH_ACTUAL_KEY`)
- NEVER commit .env files with real credentials (they should be in .gitignore)
- ALWAYS verify no secrets are exposed before committing by checking:
  - API keys (OpenAI, Supabase, etc.) 
  - Database passwords
  - JWT secrets
  - Service role keys
  - Any authentication tokens
- If you need to show example values, use clearly fake placeholders
- Real credentials should only exist in:
  - Local .env files (gitignored)
  - Vercel/deployment platform environment variables
  - NEVER in committed code or configuration files

### DATABASE SCHEMA CHANGES - CRITICAL
**NEVER modify database schema without proper migrations:**

1. **For ANY database changes (tables, columns, indexes, etc.):**
   ```bash
   # ALWAYS create a migration - NEVER use db push for schema changes
   npx prisma migrate dev --name descriptive_migration_name
   ```

2. **Migration Requirements:**
   - ALWAYS update the Prisma schema first (`prisma/schema.prisma`)
   - ALWAYS create a migration before applying changes
   - NEVER use `prisma db push` for production schema changes (only for initial prototyping)
   - ALWAYS ensure migrations are committed to git (they are NOT gitignored)

3. **Process for Database Changes:**
   ```bash
   # 1. Modify prisma/schema.prisma with your changes
   
   # 2. Create migration
   npx prisma migrate dev --name add_user_avatar_column
   
   # 3. Migration will auto-apply to your local database
   
   # 4. Commit BOTH schema.prisma AND the new migration folder
   git add prisma/schema.prisma prisma/migrations/
   git commit -m "feat: Add avatar column to users table"
   ```

4. **Common Scenarios:**
   - **Adding a table**: Update schema → Create migration → Commit both
   - **Adding a column**: Update schema → Create migration → Commit both  
   - **Removing a column**: Update schema → Create migration (handles data loss warning) → Commit both
   - **Adding indexes**: Update schema → Create migration → Commit both
   - **Changing column types**: Update schema → Create migration (may need manual SQL) → Commit both

5. **What NOT to do:**
   - ❌ NEVER manually create/alter tables via SQL without updating Prisma schema
   - ❌ NEVER use `prisma db push` for anything except initial prototyping
   - ❌ NEVER forget to commit migration files
   - ❌ NEVER edit existing migration files after they're committed
   - ❌ NEVER delete migrations that have been applied to any environment

6. **If you accidentally used `db push`:**
   ```bash
   # Generate a migration from current database state
   npx prisma migrate dev --name sync_database_state --create-only
   # Review the migration, then mark as applied
   npx prisma migrate resolve --applied [migration_name]
   ```

**WHY THIS MATTERS:** Other developers need to replicate the exact database structure when they pull the repository. Without migrations, they cannot set up the application correctly.

## Common Patterns

### Remix Action Pattern
```typescript
export const action: ActionFunction = async ({ request }) => {
  const user = await requireUser(request);
  const formData = await request.formData();
  
  // Validate with Zod
  const result = schema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return json({ errors: result.error.flatten() }, { status: 400 });
  }
  
  // Process action
  // Return json response
};
```

### Service Layer Pattern
```typescript
export class ServiceName {
  private logger = new DebugLogger('ServiceName');
  
  async method(): Promise<Result> {
    this.logger.trace('method', [args]);
    try {
      // Implementation
    } catch (error) {
      this.logger.error('method failed', error);
      throw error;
    }
  }
}
```

### Prisma Transaction Pattern
```typescript
await prisma.$transaction(async (tx) => {
  // Multiple operations
  const user = await tx.user.create({ ... });
  const workspace = await tx.workspace.create({ ... });
  return { user, workspace };
});
```

## Do Not
- Manually edit `.taskmaster/tasks/tasks.json`
- Manually edit `.taskmaster/config.json`
- Create documentation unless explicitly requested
- Add comments unless specifically asked
- Use emojis unless requested
- Commit changes unless explicitly asked
- Create new demo/test routes (see CRITICAL RULES above)