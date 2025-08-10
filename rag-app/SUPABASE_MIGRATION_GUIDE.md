# Supabase Integration Migration Guide

## Overview

This guide outlines the migration from custom infrastructure to Supabase services while keeping our custom authentication system.

## Architecture Changes

### Before (Custom Stack)
- PostgreSQL with Docker
- Redis for caching/queues
- Custom WebSocket server
- BullMQ for background jobs
- Custom file storage
- Manual pgvector setup

### After (Supabase Stack)
- Supabase PostgreSQL (local/cloud)
- Supabase Realtime for live features
- Supabase Edge Functions for processing
- Supabase Storage for files
- Built-in pgvector support
- Supabase RPC for complex queries

## Setup Local Supabase

### 1. Install Supabase CLI
```bash
brew install supabase/tap/supabase
```

### 2. Initialize Supabase Project
```bash
cd rag-app
supabase init
```

### 3. Start Local Supabase
```bash
supabase start
```

This will give you:
- Local PostgreSQL on port 54322
- Supabase Studio on http://localhost:54323
- API Gateway on http://localhost:54321
- Realtime on ws://localhost:54321

### 4. Update Environment Variables
```env
# Keep existing auth
JWT_SECRET=your-super-secret-jwt-key
SESSION_SECRET=your-session-secret

# Add Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-local-anon-key
SUPABASE_SERVICE_KEY=your-local-service-key
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

## Migration Steps

### Step 1: Install Supabase Client
```bash
npm install @supabase/supabase-js
```

### Step 2: Create Supabase Client Utility
```typescript
// app/utils/supabase.server.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
})

// For client-side (browser)
export const supabaseClient = (anonKey: string) => 
  createClient(supabaseUrl, anonKey)
```

### Step 3: Keep Existing Auth, Update Database Operations

Our custom JWT auth remains, but database operations migrate:

**Before (Prisma):**
```typescript
const user = await prisma.user.findUnique({
  where: { email }
})
```

**After (Supabase):**
```typescript
const { data: user, error } = await supabase
  .from('users')
  .select()
  .eq('email', email)
  .single()
```

### Step 4: Migrate Tables to Supabase

Create migration file `supabase/migrations/001_initial_schema.sql`:

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Keep existing user tables for custom auth
-- (Already created by our auth system)

-- Add Supabase-specific tables
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES users(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT,
  content JSONB DEFAULT '{}',
  parent_id UUID REFERENCES pages(id),
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  position JSONB NOT NULL DEFAULT '{"x": 0, "y": 0}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies (integrate with our custom auth)
CREATE POLICY "Users can view their workspaces" ON workspaces
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Users can manage their workspaces" ON workspaces
  FOR ALL USING (owner_id = auth.uid());
```

### Step 5: Set Up Realtime

Replace WebSocket with Supabase Realtime:

```typescript
// app/services/realtime.client.ts
import { supabaseClient } from '~/utils/supabase.client'

export function subscribeToPage(pageId: string, onUpdate: (payload: any) => void) {
  const channel = supabaseClient
    .channel(`page:${pageId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'blocks',
        filter: `page_id=eq.${pageId}`
      },
      onUpdate
    )
    .subscribe()

  return () => {
    supabaseClient.removeChannel(channel)
  }
}
```

### Step 6: Set Up Storage

Replace file system with Supabase Storage:

```typescript
// app/services/storage.server.ts
import { supabase } from '~/utils/supabase.server'

export async function uploadDocument(file: File, userId: string) {
  const fileName = `${userId}/${Date.now()}-${file.name}`
  
  const { data, error } = await supabase.storage
    .from('documents')
    .upload(fileName, file)
    
  if (error) throw error
  
  const { data: { publicUrl } } = supabase.storage
    .from('documents')
    .getPublicUrl(fileName)
    
  return publicUrl
}
```

### Step 7: Create Edge Functions

Create `supabase/functions/process-document/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { documentId } = await req.json()
  
  // Process document, generate embeddings
  // Store in pgvector column
  
  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } }
  )
})
```

## Testing Migration

### 1. Run Tests with Local Supabase
```bash
supabase start
npm test
```

### 2. Test Realtime Features
```bash
# In one terminal
npm run dev

# In another terminal
supabase realtime logs
```

### 3. Test Storage
```bash
# Upload a file through the app
# Check in Supabase Studio: http://localhost:54323
```

## Deployment to Production Supabase

### 1. Create Supabase Project
- Go to https://app.supabase.com
- Create new project
- Note the URL and keys

### 2. Push Schema
```bash
supabase link --project-ref your-project-ref
supabase db push
```

### 3. Deploy Edge Functions
```bash
supabase functions deploy process-document
```

### 4. Update Production Environment
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-production-anon-key
SUPABASE_SERVICE_KEY=your-production-service-key
```

## Rollback Plan

If issues arise, you can rollback by:

1. Keep Prisma schema as backup
2. Maintain Docker compose file
3. Export data before migration:
```bash
supabase db dump > backup.sql
```

## Benefits After Migration

✅ **Reduced Infrastructure Complexity**
- No need to manage PostgreSQL, Redis, WebSocket servers
- Automatic backups and scaling

✅ **Better Developer Experience**
- Supabase Studio for database management
- Built-in monitoring and logs
- Automatic API generation

✅ **Cost Optimization**
- Pay only for what you use
- Free tier includes generous limits
- No need for separate hosting for different services

✅ **Performance Improvements**
- Built-in connection pooling
- CDN for storage
- Edge Functions run close to users

## Next Steps

1. Complete Task 3 with Supabase integration
2. Migrate existing data to Supabase tables
3. Update frontend components to use Supabase Realtime
4. Deploy Edge Functions for document processing
5. Configure production Supabase project