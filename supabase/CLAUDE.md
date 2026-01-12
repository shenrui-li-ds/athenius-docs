# CLAUDE.md - Supabase & Database

This directory contains database migrations and Supabase configuration.

## Overview

Athenius Docs shares a Supabase instance with Athenius Search. This directory contains migrations specific to Docs functionality.

## Directory Structure

```
supabase/
├── migrations/
│   └── YYYYMMDDHHMMSS_add_docs_tables.sql
└── CLAUDE.md
```

## Database Schema

### Existing Tables (from Athenius Search)

These tables are already in the shared Supabase instance:

```sql
auth.users              -- User accounts (managed by Supabase Auth)
public.user_credits     -- Credit balances
public.user_preferences -- User settings
public.credit_purchases -- Purchase history
```

### New Tables for Athenius Docs

#### file_uploads

Stores metadata for uploaded files.

```sql
CREATE TABLE public.file_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,          -- 'pdf', 'docx', 'txt', 'md'
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,        -- Path in Supabase Storage
  status TEXT DEFAULT 'pending',     -- 'pending', 'processing', 'ready', 'error'
  error_message TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',

  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'ready', 'error'))
);
```

#### file_chunks

Stores document chunks with vector embeddings.

```sql
CREATE TABLE public.file_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID REFERENCES public.file_uploads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  page_number INTEGER,              -- For PDFs
  section_title TEXT,               -- If extractable
  embedding vector(1536),           -- OpenAI text-embedding-3-small
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(file_id, chunk_index)
);

-- Vector similarity search index
CREATE INDEX ON public.file_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Filter indexes
CREATE INDEX idx_file_chunks_user ON public.file_chunks(user_id);
CREATE INDEX idx_file_chunks_file ON public.file_chunks(file_id);
```

#### file_sessions

Groups files for a query session (optional, for multi-file queries).

```sql
CREATE TABLE public.file_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  file_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ DEFAULT NOW()
);
```

## Row Level Security (RLS)

All tables MUST have RLS enabled. Users can only access their own data.

```sql
-- Enable RLS
ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_sessions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage own files" ON public.file_uploads
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own chunks" ON public.file_chunks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own sessions" ON public.file_sessions
  FOR ALL USING (auth.uid() = user_id);
```

## Storage Bucket

File storage configuration:

```sql
-- Create bucket for document uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

-- RLS policies for storage
CREATE POLICY "Users can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

**File Path Structure:** `documents/{user_id}/{file_id}/{filename}`

## Vector Search

### Similarity Search Query

```sql
-- Find similar chunks for a query embedding
SELECT
  fc.id,
  fc.content,
  fc.page_number,
  fc.section_title,
  fu.filename,
  1 - (fc.embedding <=> $1) as similarity
FROM file_chunks fc
JOIN file_uploads fu ON fc.file_id = fu.id
WHERE
  fc.file_id = ANY($2)  -- Filter by file IDs
  AND fu.status = 'ready'
ORDER BY fc.embedding <=> $1
LIMIT $3;
```

### RPC Function (Optional)

Create a stored procedure for vector search:

```sql
CREATE OR REPLACE FUNCTION search_file_chunks(
  query_embedding vector(1536),
  file_ids uuid[],
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  content text,
  page_number int,
  section_title text,
  filename text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.id,
    fc.content,
    fc.page_number,
    fc.section_title,
    fu.filename,
    1 - (fc.embedding <=> query_embedding) as similarity
  FROM file_chunks fc
  JOIN file_uploads fu ON fc.file_id = fu.id
  WHERE
    fc.file_id = ANY(file_ids)
    AND fc.user_id = auth.uid()
  ORDER BY fc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

## Migration Guidelines

### Creating Migrations

```bash
# Generate new migration
npx supabase migration new add_feature_name

# Apply migrations locally
npx supabase db push

# Generate TypeScript types
npx supabase gen types typescript --local > src/lib/supabase/types.ts
```

### Migration Naming

Use descriptive names: `YYYYMMDDHHMMSS_description.sql`

Examples:
- `20240115120000_add_docs_tables.sql`
- `20240120150000_add_file_sessions.sql`

### Migration Best Practices

1. **Always include rollback** - Comment the rollback SQL at the bottom
2. **Test locally first** - Use `supabase db push` to test
3. **Idempotent when possible** - Use `IF NOT EXISTS`
4. **Small, focused migrations** - One feature per migration

Example migration file:

```sql
-- Migration: Add file expiration tracking
-- Created: 2024-01-20

-- Add expires_at column
ALTER TABLE public.file_uploads
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours';

-- Create index for cleanup job
CREATE INDEX IF NOT EXISTS idx_file_uploads_expires
ON public.file_uploads(expires_at)
WHERE status != 'error';

-- Rollback:
-- DROP INDEX IF EXISTS idx_file_uploads_expires;
-- ALTER TABLE public.file_uploads DROP COLUMN IF EXISTS expires_at;
```

## Cleanup Job

For file expiration, create a database function:

```sql
CREATE OR REPLACE FUNCTION cleanup_expired_files()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete expired files (cascades to chunks)
  DELETE FROM public.file_uploads
  WHERE expires_at < NOW();
END;
$$;

-- Schedule with pg_cron (if available) or call from API/Edge Function
```

## Performance Considerations

### Vector Index Tuning

The IVFFlat index `lists` parameter affects search accuracy vs speed:

```sql
-- More lists = more accurate but slower for small datasets
-- Fewer lists = faster but less accurate
-- Rule of thumb: lists = sqrt(row_count)

-- For ~10,000 chunks:
CREATE INDEX ON public.file_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- For ~100,000 chunks:
CREATE INDEX ON public.file_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 316);
```

### Query Optimization

- Always filter by `file_id` or `user_id` before vector search
- Use `LIMIT` to avoid scanning entire index
- Consider partitioning by user_id for large deployments
