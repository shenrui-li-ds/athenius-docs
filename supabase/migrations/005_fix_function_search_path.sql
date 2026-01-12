-- Migration: Fix function search_path security warnings
-- Sets search_path to '' for all functions to prevent SQL injection
-- Created: 2025-01-12

-- ============================================
-- IMPORTANT: Run 005a_drop_all_functions.sql FIRST if you get
-- "function name is not unique" errors
-- ============================================

-- Drop all function variants dynamically
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
    END LOOP;
END $$;

-- ============================================
-- Create search_file_chunks
-- ============================================
CREATE OR REPLACE FUNCTION public.search_file_chunks(
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
SET search_path = ''
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
  FROM public.file_chunks fc
  JOIN public.file_uploads fu ON fc.file_id = fu.id
  WHERE
    fc.file_id = ANY(file_ids)
    AND fc.user_id = auth.uid()
  ORDER BY fc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- Fix cleanup_expired_files
-- ============================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_files()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.file_uploads
  WHERE expires_at < NOW();
END;
$$;

-- ============================================
-- Fix keyword_search_chunks
-- ============================================
CREATE OR REPLACE FUNCTION public.keyword_search_chunks(
  search_query text,
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
  rank real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  or_query tsquery;
BEGIN
  SELECT string_agg(lexeme || ':*', ' | ')::tsquery
  INTO or_query
  FROM unnest(to_tsvector('english', search_query)) AS t(lexeme, positions, weights);

  IF or_query IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    fc.id,
    fc.content,
    fc.page_number,
    fc.section_title,
    fc.file_id,
    fu.filename,
    ts_rank(to_tsvector('english', fc.content), or_query) as rank
  FROM public.file_chunks fc
  JOIN public.file_uploads fu ON fc.file_id = fu.id
  WHERE
    fc.file_id = ANY(file_ids)
    AND to_tsvector('english', fc.content) @@ or_query
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;

-- ============================================
-- Fix hybrid_search_chunks (if exists)
-- ============================================
CREATE OR REPLACE FUNCTION public.hybrid_search_chunks(
  query_text text,
  query_embedding vector(768),
  file_ids uuid[],
  match_count int DEFAULT 10,
  semantic_weight float DEFAULT 0.5,
  keyword_weight float DEFAULT 0.5,
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  content text,
  page_number int,
  section_title text,
  file_id uuid,
  filename text,
  semantic_score float,
  keyword_score float,
  combined_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  or_query tsquery;
BEGIN
  SELECT string_agg(lexeme || ':*', ' | ')::tsquery
  INTO or_query
  FROM unnest(to_tsvector('english', query_text)) AS t(lexeme, positions, weights);

  RETURN QUERY
  WITH semantic_results AS (
    SELECT
      fc.id,
      fc.content,
      fc.page_number,
      fc.section_title,
      fc.file_id,
      fu.filename,
      1 - (fc.embedding <=> query_embedding) as score,
      ROW_NUMBER() OVER (ORDER BY fc.embedding <=> query_embedding) as rank
    FROM public.file_chunks fc
    JOIN public.file_uploads fu ON fc.file_id = fu.id
    WHERE fc.file_id = ANY(file_ids)
    ORDER BY fc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword_results AS (
    SELECT
      fc.id,
      ts_rank(to_tsvector('english', fc.content), or_query) as score,
      ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('english', fc.content), or_query) DESC) as rank
    FROM public.file_chunks fc
    WHERE
      fc.file_id = ANY(file_ids)
      AND or_query IS NOT NULL
      AND to_tsvector('english', fc.content) @@ or_query
    ORDER BY score DESC
    LIMIT match_count * 2
  ),
  combined AS (
    SELECT
      COALESCE(s.id, k.id) as id,
      s.content,
      s.page_number,
      s.section_title,
      s.file_id,
      s.filename,
      COALESCE(s.score, 0) as semantic_score,
      COALESCE(k.score, 0) as keyword_score,
      (semantic_weight * (1.0 / (rrf_k + COALESCE(s.rank, match_count * 3)))) +
      (keyword_weight * (1.0 / (rrf_k + COALESCE(k.rank, match_count * 3)))) as combined_score
    FROM semantic_results s
    FULL OUTER JOIN keyword_results k ON s.id = k.id
    WHERE s.id IS NOT NULL
  )
  SELECT
    c.id,
    c.content,
    c.page_number,
    c.section_title,
    c.file_id,
    c.filename,
    c.semantic_score,
    c.keyword_score,
    c.combined_score
  FROM combined c
  ORDER BY c.combined_score DESC
  LIMIT match_count;
END;
$$;

-- ============================================
-- Fix find_entities_by_name
-- ============================================
CREATE OR REPLACE FUNCTION public.find_entities_by_name(
  search_name TEXT,
  file_ids UUID[]
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  entity_type TEXT,
  aliases TEXT[],
  description TEXT,
  mention_count INTEGER,
  file_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.name,
    de.entity_type,
    de.aliases,
    de.description,
    de.mention_count,
    de.file_id
  FROM public.document_entities de
  WHERE
    de.file_id = ANY(file_ids)
    AND de.user_id = auth.uid()
    AND (
      LOWER(de.name) = LOWER(search_name)
      OR LOWER(search_name) = ANY(SELECT LOWER(unnest(de.aliases)))
    )
  ORDER BY de.mention_count DESC;
END;
$$;

-- ============================================
-- Fix get_related_entities
-- ============================================
CREATE OR REPLACE FUNCTION public.get_related_entities(
  entity_ids UUID[],
  max_depth INTEGER DEFAULT 1
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  entity_type TEXT,
  relationship_type TEXT,
  direction TEXT,
  confidence REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.name,
    de.entity_type,
    er.relationship_type,
    'outgoing'::TEXT as direction,
    er.confidence
  FROM public.entity_relationships er
  JOIN public.document_entities de ON er.target_entity_id = de.id
  WHERE
    er.source_entity_id = ANY(entity_ids)
    AND de.user_id = auth.uid()

  UNION ALL

  SELECT
    de.id,
    de.name,
    de.entity_type,
    er.relationship_type,
    'incoming'::TEXT as direction,
    er.confidence
  FROM public.entity_relationships er
  JOIN public.document_entities de ON er.source_entity_id = de.id
  WHERE
    er.target_entity_id = ANY(entity_ids)
    AND de.user_id = auth.uid()

  ORDER BY confidence DESC;
END;
$$;

-- ============================================
-- Fix get_chunks_for_entities
-- ============================================
CREATE OR REPLACE FUNCTION public.get_chunks_for_entities(
  entity_ids UUID[]
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  page_number INTEGER,
  section_title TEXT,
  file_id UUID,
  filename TEXT,
  entity_names TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.id as chunk_id,
    fc.content,
    fc.page_number,
    fc.section_title,
    fc.file_id,
    fu.filename,
    ARRAY_AGG(DISTINCT de.name) as entity_names
  FROM public.entity_mentions em
  JOIN public.document_entities de ON em.entity_id = de.id
  JOIN public.file_chunks fc ON em.chunk_id = fc.id
  JOIN public.file_uploads fu ON fc.file_id = fu.id
  WHERE
    em.entity_id = ANY(entity_ids)
    AND de.user_id = auth.uid()
  GROUP BY fc.id, fc.content, fc.page_number, fc.section_title, fc.file_id, fu.filename
  ORDER BY fc.page_number, fc.chunk_index;
END;
$$;

-- ============================================
-- Fix get_file_entities
-- ============================================
CREATE OR REPLACE FUNCTION public.get_file_entities(
  target_file_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  entity_type TEXT,
  aliases TEXT[],
  description TEXT,
  mention_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.name,
    de.entity_type,
    de.aliases,
    de.description,
    de.mention_count
  FROM public.document_entities de
  WHERE
    de.file_id = target_file_id
    AND de.user_id = auth.uid()
  ORDER BY de.mention_count DESC, de.name;
END;
$$;

-- ============================================
-- Fix get_file_relationships
-- ============================================
CREATE OR REPLACE FUNCTION public.get_file_relationships(
  target_file_id UUID
)
RETURNS TABLE (
  id UUID,
  source_name TEXT,
  target_name TEXT,
  relationship_type TEXT,
  confidence REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    er.id,
    source_entity.name as source_name,
    target_entity.name as target_name,
    er.relationship_type,
    er.confidence
  FROM public.entity_relationships er
  JOIN public.document_entities source_entity ON er.source_entity_id = source_entity.id
  JOIN public.document_entities target_entity ON er.target_entity_id = target_entity.id
  WHERE
    er.file_id = target_file_id
    AND source_entity.user_id = auth.uid()
  ORDER BY er.confidence DESC, source_entity.name;
END;
$$;

-- ============================================
-- Re-grant permissions
-- ============================================
GRANT EXECUTE ON FUNCTION public.search_file_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_file_chunks TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_files TO service_role;
GRANT EXECUTE ON FUNCTION public.keyword_search_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION public.keyword_search_chunks TO service_role;
GRANT EXECUTE ON FUNCTION public.hybrid_search_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION public.hybrid_search_chunks TO service_role;
GRANT EXECUTE ON FUNCTION public.find_entities_by_name TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_related_entities TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chunks_for_entities TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_file_entities TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_file_relationships TO authenticated;
