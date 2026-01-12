-- First, drop ALL versions of these functions regardless of signature
-- Run this BEFORE 005_fix_function_search_path.sql

-- Drop all hybrid_search_chunks variants
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN
        SELECT p.oid::regprocedure AS func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname IN (
            'hybrid_search_chunks',
            'search_file_chunks',
            'keyword_search_chunks',
            'cleanup_expired_files',
            'find_entities_by_name',
            'get_related_entities',
            'get_chunks_for_entities',
            'get_file_entities',
            'get_file_relationships'
        )
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_signature || ' CASCADE';
        RAISE NOTICE 'Dropped function: %', func_record.func_signature;
    END LOOP;
END $$;
