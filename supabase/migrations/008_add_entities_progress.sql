-- Migration: Add entity extraction progress tracking
-- Allows showing progress percentage during extraction
-- Created: 2025-01-12

-- Add progress column (0-100 percentage)
ALTER TABLE public.file_uploads
ADD COLUMN IF NOT EXISTS entities_progress INTEGER DEFAULT NULL;

-- Add constraint to ensure valid percentage
ALTER TABLE public.file_uploads
ADD CONSTRAINT entities_progress_range
CHECK (entities_progress IS NULL OR (entities_progress >= 0 AND entities_progress <= 100));

-- Index for filtering files by extraction status
CREATE INDEX IF NOT EXISTS idx_file_uploads_entities_status
ON public.file_uploads (entities_status)
WHERE entities_status IS NOT NULL;
