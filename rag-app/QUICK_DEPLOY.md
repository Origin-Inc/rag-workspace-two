# Quick Deployment Steps

## 1. Apply Database Migrations (Required!)

```bash
# Replace YOUR-PASSWORD with your Supabase database password
export DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@db.afqibcfcornmwppxjbyk.supabase.co:5432/postgres"
npx prisma migrate deploy
npx prisma generate
```

## 2. Add Your OpenAI API Key

Edit `.env.production` and replace `sk-YOUR_OPENAI_API_KEY_HERE` with your actual OpenAI API key.

## 3. Push to GitHub

```bash
# If not already initialized
git init
git add .
git commit -m "Ready for deployment"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR-USERNAME/rag-workspace.git
git branch -M main
git push -u origin main
```

## 4. Deploy to Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Select `rag-app` as root directory
4. Add ALL environment variables from `.env.production`

## 5. After Deployment - Create Database Indexes

Run in Supabase SQL Editor:

```sql
-- Performance indexes
CREATE INDEX idx_pages_workspace_id ON pages(workspace_id);
CREATE INDEX idx_blocks_page_id ON blocks(page_id);
CREATE INDEX idx_page_embeddings_workspace ON page_embeddings(workspace_id);
CREATE INDEX idx_block_embeddings_workspace ON block_embeddings(workspace_id);

-- Vector indexes for similarity search
CREATE INDEX idx_page_embeddings_vector ON page_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX idx_block_embeddings_vector ON block_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

## Your Credentials Summary

### Supabase
- Project ID: `afqibcfcornmwppxjbyk`
- URL: `https://afqibcfcornmwppxjbyk.supabase.co`
- Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmcWliY2Zjb3JubXdwcHhqYnlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5Mjg5MTQsImV4cCI6MjA3MjUwNDkxNH0.0Pji-aMXxKKD7AbbQUpxLKxVCDb1LpuvI083wEDBxxo`

### Redis (Upstash)
- Endpoint: `probable-mackerel-19354.upstash.io`
- Connection: `rediss://default:AUuaAAIncDFhOGVjNTBiYzIxZGU0ZGVjYjVmZDc0YjM1MTZjMzkyY3AxMTkzNTQ@probable-mackerel-19354.upstash.io:6379`

### Security Keys (Generated)
- JWT_SECRET: `401f2f185fe90fb79e4a643eb2ff5ef520c27c95f4cae0d76ccaa2bf2e3025d2`
- SESSION_SECRET: `0678d75d8dbf95b522a2e0f0b2a0f618c52163871a022197938f664a0f1ffa73`
- ENCRYPTION_SECRET: `L3CSGfvghZ33VTT1jNgPfCTvt6GQkm3bAMp3jIQ1RdY=`
- CRON_SECRET: `6b665887a35935e8da9ea6cd1b0eb73c`

## Still Need:
1. Your Supabase database password (for migrations)
2. Your OpenAI API key (for AI features)