-- Migration: Update embedding dimensions for Gemini
-- Changes from OpenAI (1536 dimensions) to Gemini (768 dimensions)
-- Created: 2025-01-12

-- IMPORTANT: This migration will delete existing embeddings!
-- You will need to re-upload and re-process files after running this.

-- ============================================
-- Step 1: Drop existing vector index
-- ============================================
DROP INDEX IF EXISTS idx_file_chunks_embedding;

-- ============================================
-- Step 2: Alter embedding column to new dimensions
-- ============================================
-- First, drop the column and recreate with new dimensions
ALTER TABLE public.file_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.file_chunks ADD COLUMN embedding vector(768);

-- ============================================
-- Step 3: Recreate vector index with new dimensions
-- ============================================
CREATE INDEX IF NOT EXISTS idx_file_chunks_embedding ON public.file_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================
-- Step 4: Update the RPC function for new dimensions
-- ============================================
CREATE OR REPLACE FUNCTION search_file_chunks(
  query_embedding vector(768),
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_file_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION search_file_chunks TO service_role;

-- ============================================
-- Note: After running this migration
-- ============================================
-- 1. All existing file chunks will have NULL embeddings
-- 2. You need to delete existing files and re-upload them
-- 3. Or run a script to re-generate embeddings for existing chunks

-- ============================================
-- Rollback (to revert to OpenAI 1536 dimensions)
-- ============================================
-- DROP INDEX IF EXISTS idx_file_chunks_embedding;
-- ALTER TABLE public.file_chunks DROP COLUMN IF EXISTS embedding;
-- ALTER TABLE public.file_chunks ADD COLUMN embedding vector(1536);
-- CREATE INDEX IF NOT EXISTS idx_file_chunks_embedding ON public.file_chunks
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);
-- Then recreate the search_file_chunks function with vector(1536)
