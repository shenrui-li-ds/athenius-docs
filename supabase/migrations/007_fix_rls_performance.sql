-- Migration: Fix RLS policy performance
-- Wraps auth.uid() in subquery to prevent re-evaluation per row
-- Created: 2025-01-12

-- ============================================
-- Fix file_uploads RLS policy
-- ============================================
DROP POLICY IF EXISTS "Users can manage own files" ON public.file_uploads;

CREATE POLICY "Users can manage own files" ON public.file_uploads
  FOR ALL USING ((select auth.uid()) = user_id);

-- ============================================
-- Fix file_chunks RLS policy
-- ============================================
DROP POLICY IF EXISTS "Users can access own chunks" ON public.file_chunks;

CREATE POLICY "Users can access own chunks" ON public.file_chunks
  FOR ALL USING ((select auth.uid()) = user_id);

-- ============================================
-- Fix document_entities RLS policy
-- ============================================
DROP POLICY IF EXISTS "Users can manage own entities" ON public.document_entities;

CREATE POLICY "Users can manage own entities" ON public.document_entities
  FOR ALL USING ((select auth.uid()) = user_id);

-- ============================================
-- Fix entity_relationships RLS policy
-- ============================================
DROP POLICY IF EXISTS "Users can manage own relationships" ON public.entity_relationships;

CREATE POLICY "Users can manage own relationships" ON public.entity_relationships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.document_entities
      WHERE id = source_entity_id AND user_id = (select auth.uid())
    )
  );

-- ============================================
-- Fix entity_mentions RLS policy
-- ============================================
DROP POLICY IF EXISTS "Users can access own mentions" ON public.entity_mentions;

CREATE POLICY "Users can access own mentions" ON public.entity_mentions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.document_entities
      WHERE id = entity_id AND user_id = (select auth.uid())
    )
  );
