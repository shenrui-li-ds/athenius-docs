-- Migration: Add entity tables for Progressive HybridRAG
-- Phase 3: Entity extraction and relationship tracking for multi-hop reasoning
-- Created: 2025-01-12

-- ============================================
-- Add entity extraction flag to file_uploads
-- ============================================

ALTER TABLE public.file_uploads
ADD COLUMN IF NOT EXISTS entities_enabled BOOLEAN DEFAULT false;

ALTER TABLE public.file_uploads
ADD COLUMN IF NOT EXISTS entities_status TEXT DEFAULT NULL;

-- Add constraint for entities_status
ALTER TABLE public.file_uploads
DROP CONSTRAINT IF EXISTS valid_entities_status;

ALTER TABLE public.file_uploads
ADD CONSTRAINT valid_entities_status CHECK (
  entities_status IS NULL OR
  entities_status IN ('pending', 'processing', 'ready', 'error')
);

-- ============================================
-- Document Entities Table
-- ============================================
-- Stores extracted entities (characters, locations, objects, events, organizations)

CREATE TABLE IF NOT EXISTS public.document_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES public.file_uploads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  description TEXT,
  first_mention_chunk INTEGER,
  mention_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_entity_type CHECK (
    entity_type IN ('character', 'location', 'object', 'event', 'organization')
  )
);

-- ============================================
-- Entity Relationships Table
-- ============================================
-- Stores relationships between entities (e.g., "Tom drives yellow car")

CREATE TABLE IF NOT EXISTS public.entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES public.file_uploads(id) ON DELETE CASCADE,
  source_entity_id UUID REFERENCES public.document_entities(id) ON DELETE CASCADE,
  target_entity_id UUID REFERENCES public.document_entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  evidence_chunk_ids UUID[] DEFAULT '{}',
  confidence REAL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

-- ============================================
-- Entity Mentions Table
-- ============================================
-- Tracks which chunks mention which entities (for fast lookup during query)

CREATE TABLE IF NOT EXISTS public.entity_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES public.document_entities(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES public.file_chunks(id) ON DELETE CASCADE,
  mention_text TEXT,
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

-- Entity lookup indexes
CREATE INDEX IF NOT EXISTS idx_entities_file ON public.document_entities(file_id);
CREATE INDEX IF NOT EXISTS idx_entities_user ON public.document_entities(user_id);
CREATE INDEX IF NOT EXISTS idx_entities_name ON public.document_entities(name);
CREATE INDEX IF NOT EXISTS idx_entities_type ON public.document_entities(entity_type);

-- Relationship lookup indexes
CREATE INDEX IF NOT EXISTS idx_relationships_file ON public.entity_relationships(file_id);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON public.entity_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON public.entity_relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON public.entity_relationships(relationship_type);

-- Mention lookup indexes
CREATE INDEX IF NOT EXISTS idx_mentions_entity ON public.entity_mentions(entity_id);
CREATE INDEX IF NOT EXISTS idx_mentions_chunk ON public.entity_mentions(chunk_id);

-- File uploads entity flag index
CREATE INDEX IF NOT EXISTS idx_file_uploads_entities ON public.file_uploads(entities_enabled)
WHERE entities_enabled = true;

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE public.document_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_mentions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotent migrations)
DROP POLICY IF EXISTS "Users can manage own entities" ON public.document_entities;
DROP POLICY IF EXISTS "Users can manage own relationships" ON public.entity_relationships;
DROP POLICY IF EXISTS "Users can access own mentions" ON public.entity_mentions;

-- Create RLS policies
CREATE POLICY "Users can manage own entities" ON public.document_entities
  FOR ALL USING (auth.uid() = user_id);

-- For relationships, check via source entity ownership
CREATE POLICY "Users can manage own relationships" ON public.entity_relationships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.document_entities
      WHERE id = source_entity_id AND user_id = auth.uid()
    )
  );

-- For mentions, check via entity ownership
CREATE POLICY "Users can access own mentions" ON public.entity_mentions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.document_entities
      WHERE id = entity_id AND user_id = auth.uid()
    )
  );

-- ============================================
-- RPC Functions for Entity Search
-- ============================================

-- Find entities by name (with alias matching)
CREATE OR REPLACE FUNCTION find_entities_by_name(
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
  FROM document_entities de
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

-- Get related entities (via relationships)
CREATE OR REPLACE FUNCTION get_related_entities(
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
AS $$
BEGIN
  RETURN QUERY
  -- Outgoing relationships (source -> target)
  SELECT
    de.id,
    de.name,
    de.entity_type,
    er.relationship_type,
    'outgoing'::TEXT as direction,
    er.confidence
  FROM entity_relationships er
  JOIN document_entities de ON er.target_entity_id = de.id
  WHERE
    er.source_entity_id = ANY(entity_ids)
    AND de.user_id = auth.uid()

  UNION ALL

  -- Incoming relationships (target <- source)
  SELECT
    de.id,
    de.name,
    de.entity_type,
    er.relationship_type,
    'incoming'::TEXT as direction,
    er.confidence
  FROM entity_relationships er
  JOIN document_entities de ON er.source_entity_id = de.id
  WHERE
    er.target_entity_id = ANY(entity_ids)
    AND de.user_id = auth.uid()

  ORDER BY confidence DESC;
END;
$$;

-- Get chunks mentioning entities
CREATE OR REPLACE FUNCTION get_chunks_for_entities(
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
  FROM entity_mentions em
  JOIN document_entities de ON em.entity_id = de.id
  JOIN file_chunks fc ON em.chunk_id = fc.id
  JOIN file_uploads fu ON fc.file_id = fu.id
  WHERE
    em.entity_id = ANY(entity_ids)
    AND de.user_id = auth.uid()
  GROUP BY fc.id, fc.content, fc.page_number, fc.section_title, fc.file_id, fu.filename
  ORDER BY fc.page_number, fc.chunk_index;
END;
$$;

-- Get all entities for a file
CREATE OR REPLACE FUNCTION get_file_entities(
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
  FROM document_entities de
  WHERE
    de.file_id = target_file_id
    AND de.user_id = auth.uid()
  ORDER BY de.mention_count DESC, de.name;
END;
$$;

-- Get relationships for a file
CREATE OR REPLACE FUNCTION get_file_relationships(
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    er.id,
    source_entity.name as source_name,
    target_entity.name as target_name,
    er.relationship_type,
    er.confidence
  FROM entity_relationships er
  JOIN document_entities source_entity ON er.source_entity_id = source_entity.id
  JOIN document_entities target_entity ON er.target_entity_id = target_entity.id
  WHERE
    er.file_id = target_file_id
    AND source_entity.user_id = auth.uid()
  ORDER BY er.confidence DESC, source_entity.name;
END;
$$;

-- ============================================
-- Grant Permissions
-- ============================================

GRANT EXECUTE ON FUNCTION find_entities_by_name TO authenticated;
GRANT EXECUTE ON FUNCTION get_related_entities TO authenticated;
GRANT EXECUTE ON FUNCTION get_chunks_for_entities TO authenticated;
GRANT EXECUTE ON FUNCTION get_file_entities TO authenticated;
GRANT EXECUTE ON FUNCTION get_file_relationships TO authenticated;

-- ============================================
-- Rollback (commented out)
-- ============================================
-- DROP FUNCTION IF EXISTS get_file_relationships;
-- DROP FUNCTION IF EXISTS get_file_entities;
-- DROP FUNCTION IF EXISTS get_chunks_for_entities;
-- DROP FUNCTION IF EXISTS get_related_entities;
-- DROP FUNCTION IF EXISTS find_entities_by_name;
-- DROP TABLE IF EXISTS public.entity_mentions;
-- DROP TABLE IF EXISTS public.entity_relationships;
-- DROP TABLE IF EXISTS public.document_entities;
-- ALTER TABLE public.file_uploads DROP CONSTRAINT IF EXISTS valid_entities_status;
-- ALTER TABLE public.file_uploads DROP COLUMN IF EXISTS entities_status;
-- ALTER TABLE public.file_uploads DROP COLUMN IF EXISTS entities_enabled;
