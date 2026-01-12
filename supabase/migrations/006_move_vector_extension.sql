-- Migration: Move vector extension to extensions schema
-- This improves security by keeping extensions separate from user data
-- Created: 2025-01-12
--
-- WARNING: This migration will DROP and RECREATE the embedding column!
-- All existing embeddings will be LOST. Only run this on a fresh database
-- or if you're okay re-processing all files.

-- ============================================
-- Option A: Safe approach - just grant proper permissions
-- Uncomment this section and comment out Option B if you want to keep
-- the extension in public schema
-- ============================================

-- REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- This is the minimal fix - just restrict public schema access

-- ============================================
-- Option B: Move extension to extensions schema (DESTRUCTIVE)
-- Only use on fresh database or if willing to re-process files
-- ============================================

-- Step 1: Check if we should proceed
DO $$
DECLARE
  chunk_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO chunk_count FROM public.file_chunks WHERE embedding IS NOT NULL;
  IF chunk_count > 0 THEN
    RAISE NOTICE 'WARNING: Found % chunks with embeddings. These will be lost!', chunk_count;
    RAISE NOTICE 'To proceed, manually run: DROP EXTENSION vector CASCADE;';
    RAISE NOTICE 'Then re-run this migration.';
    -- Uncomment the next line to make this a hard stop:
    -- RAISE EXCEPTION 'Aborting to prevent data loss. See notices above.';
  END IF;
END $$;

-- Step 2: Create extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;

-- Step 3: Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT USAGE ON SCHEMA extensions TO anon;

-- Step 4: If extension is already in extensions schema, we're done
-- If not, you need to manually:
--   1. DROP EXTENSION vector CASCADE;
--   2. CREATE EXTENSION vector WITH SCHEMA extensions;
--   3. Recreate the embedding column and index

-- Check current extension location
DO $$
DECLARE
  ext_schema TEXT;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE e.extname = 'vector';

  IF ext_schema = 'public' THEN
    RAISE NOTICE 'Vector extension is in public schema.';
    RAISE NOTICE 'To move it, you must manually run:';
    RAISE NOTICE '  1. DROP EXTENSION vector CASCADE;';
    RAISE NOTICE '  2. CREATE EXTENSION vector WITH SCHEMA extensions;';
    RAISE NOTICE '  3. ALTER TABLE file_chunks ADD COLUMN embedding extensions.vector(768);';
    RAISE NOTICE '  4. Recreate the index on embedding column';
    RAISE NOTICE '  5. Re-process all uploaded files to regenerate embeddings';
  ELSIF ext_schema = 'extensions' THEN
    RAISE NOTICE 'Vector extension is already in extensions schema. Good!';
  ELSE
    RAISE NOTICE 'Vector extension is in schema: %', ext_schema;
  END IF;
END $$;
