-- Athenius Docs Database Schema
-- Run this migration in the Supabase SQL Editor

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- File Uploads Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'ready', 'error'))
);

-- ============================================
-- File Chunks Table (with vector embeddings)
-- ============================================
CREATE TABLE IF NOT EXISTS public.file_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES public.file_uploads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  page_number INTEGER,
  section_title TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(file_id, chunk_index)
);

-- ============================================
-- Indexes
-- ============================================

-- Vector similarity search index (IVFFlat for approximate nearest neighbor)
CREATE INDEX IF NOT EXISTS idx_file_chunks_embedding ON public.file_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Filter indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_file_chunks_user ON public.file_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_file_chunks_file ON public.file_chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_user ON public.file_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_status ON public.file_uploads(status);
CREATE INDEX IF NOT EXISTS idx_file_uploads_expires ON public.file_uploads(expires_at);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_chunks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotent migrations)
DROP POLICY IF EXISTS "Users can manage own files" ON public.file_uploads;
DROP POLICY IF EXISTS "Users can access own chunks" ON public.file_chunks;

-- Create RLS policies
CREATE POLICY "Users can manage own files" ON public.file_uploads
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own chunks" ON public.file_chunks
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Storage Bucket
-- ============================================

-- Create bucket for document uploads (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;

-- Storage policies
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

-- ============================================
-- Optional: RPC Function for Vector Search
-- ============================================
-- This function enables efficient vector similarity search
-- The app will fall back to client-side search if this doesn't exist

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
  file_id uuid,
  filename text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.id,
    fc.content,
    fc.page_number,
    fc.section_title,
    fc.file_id,
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

-- ============================================
-- Optional: Cleanup Function
-- ============================================
-- Function to clean up expired files (run via cron or edge function)

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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION search_file_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_files TO service_role;
