-- Athenius Docs Phase 2: Full-Text Search Support
-- Run this migration in the Supabase SQL Editor

-- ============================================
-- Full-Text Search Index
-- ============================================

-- Add GIN index for full-text search on chunk content
CREATE INDEX IF NOT EXISTS idx_file_chunks_content_fts
ON file_chunks USING GIN (to_tsvector('english', content));

-- ============================================
-- Keyword Search RPC Function
-- ============================================

-- Function for keyword-based search using PostgreSQL full-text search
-- Converts query words to OR logic for broader matching
CREATE OR REPLACE FUNCTION keyword_search_chunks(
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
AS $$
DECLARE
  or_query tsquery;
BEGIN
  -- Convert query to OR logic: split words and join with |
  -- Filter out common stop words and short words
  SELECT string_agg(lexeme || ':*', ' | ')::tsquery
  INTO or_query
  FROM unnest(to_tsvector('english', search_query)) AS t(lexeme, positions, weights);

  -- If no valid terms, return empty
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
  FROM file_chunks fc
  JOIN file_uploads fu ON fc.file_id = fu.id
  WHERE
    fc.file_id = ANY(file_ids)
    AND to_tsvector('english', fc.content) @@ or_query
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION keyword_search_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION keyword_search_chunks TO service_role;

-- ============================================
-- Hybrid Search RPC Function (Optional)
-- ============================================

-- Combined semantic + keyword search with Reciprocal Rank Fusion
-- This is an alternative to doing RRF in application code
CREATE OR REPLACE FUNCTION hybrid_search_chunks(
  query_embedding vector(1536),
  search_query text,
  file_ids uuid[],
  match_count int DEFAULT 10,
  semantic_weight real DEFAULT 0.6,
  keyword_weight real DEFAULT 0.4,
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  content text,
  page_number int,
  section_title text,
  file_id uuid,
  filename text,
  semantic_similarity real,
  keyword_rank real,
  combined_score real
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH semantic_results AS (
    SELECT
      fc.id,
      fc.content,
      fc.page_number,
      fc.section_title,
      fc.file_id,
      fu.filename,
      1 - (fc.embedding <=> query_embedding) as similarity,
      ROW_NUMBER() OVER (ORDER BY fc.embedding <=> query_embedding) as sem_rank
    FROM file_chunks fc
    JOIN file_uploads fu ON fc.file_id = fu.id
    WHERE fc.file_id = ANY(file_ids)
    ORDER BY fc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword_results AS (
    SELECT
      fc.id,
      ts_rank(to_tsvector('english', fc.content), websearch_to_tsquery('english', search_query)) as kw_rank,
      ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('english', fc.content), websearch_to_tsquery('english', search_query)) DESC) as kw_position
    FROM file_chunks fc
    WHERE
      fc.file_id = ANY(file_ids)
      AND to_tsvector('english', fc.content) @@ websearch_to_tsquery('english', search_query)
    LIMIT match_count * 2
  ),
  combined AS (
    SELECT
      sr.id,
      sr.content,
      sr.page_number,
      sr.section_title,
      sr.file_id,
      sr.filename,
      sr.similarity as semantic_similarity,
      COALESCE(kr.kw_rank, 0) as keyword_rank,
      -- RRF formula: 1/(k + rank)
      (semantic_weight * (1.0 / (rrf_k + sr.sem_rank))) +
      (keyword_weight * (1.0 / (rrf_k + COALESCE(kr.kw_position, match_count * 3)))) as combined_score
    FROM semantic_results sr
    LEFT JOIN keyword_results kr ON sr.id = kr.id
  )
  SELECT
    c.id,
    c.content,
    c.page_number,
    c.section_title,
    c.file_id,
    c.filename,
    c.semantic_similarity,
    c.keyword_rank,
    c.combined_score
  FROM combined c
  ORDER BY c.combined_score DESC
  LIMIT match_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION hybrid_search_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION hybrid_search_chunks TO service_role;

-- ============================================
-- Rollback (if needed)
-- ============================================
-- DROP INDEX IF EXISTS idx_file_chunks_content_fts;
-- DROP FUNCTION IF EXISTS keyword_search_chunks;
-- DROP FUNCTION IF EXISTS hybrid_search_chunks;
