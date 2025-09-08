# Enable pgvector Extension in Supabase Production

## Problem
The production database is showing `ERROR: type "vector" does not exist` because the pgvector extension is not enabled.

## Solution

### Option 1: Through Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to Database → Extensions
3. Search for "vector"
4. Click "Enable" on the pgvector extension
5. Wait for the extension to be enabled

### Option 2: Through SQL Editor

Run this SQL in the Supabase SQL Editor:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Verify it's enabled
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### Option 3: Through Supabase CLI

```bash
# Connect to your project
supabase db remote set postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# Run the migration
supabase db push --include-all
```

## After Enabling pgvector

Once the extension is enabled, run the migrations to add vector columns:

```sql
-- Add vector columns to page_embeddings table
ALTER TABLE page_embeddings 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_page_embeddings_embedding_hnsw 
ON page_embeddings USING hnsw (embedding vector_cosine_ops);

-- Verify the columns exist
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'page_embeddings'
  AND column_name = 'embedding';
```

## Verification

Test that vector operations work:

```sql
-- Test vector type
SELECT '[-0.1, 0.2, 0.3]'::vector(3);

-- Test similarity search (should not error)
SELECT id, content
FROM page_embeddings
WHERE embedding IS NOT NULL
ORDER BY embedding <=> '[-0.1, 0.2, 0.3]'::vector(1536)
LIMIT 1;
```

## Environment Variables to Verify

Make sure these are set in Vercel:

```
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

## Notes

- Supabase Free tier supports pgvector
- The extension must be in the `extensions` schema for Supabase
- After enabling, you may need to restart your application
- Migrations should be applied automatically on next deploy