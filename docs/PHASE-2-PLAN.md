# Phase 2: Enhanced RAG Pipeline

## Overview

Enhance the RAG pipeline with semantic chunking, hybrid search, streaming responses, and improved source tracking for better retrieval accuracy and user experience.

## Status: COMPLETED

## Features Implemented

### 1. Semantic Chunking with Section Extraction

**File**: `src/lib/chunking/chunker.ts`

Enhanced chunking that respects document structure:
- Detects markdown headers (`#`, `##`, `###`)
- Detects Chapter/Section patterns (`Chapter 1`, `Section 1.2`)
- Detects numbered headers (`1. Introduction`, `1.2 Methods`)
- Detects ALL CAPS headers
- Never splits mid-sentence
- Populates `sectionTitle` field in chunks

**Key functions**:
- `detectSections(text)` - Extract headers and their positions
- `splitIntoParagraphs(text)` - Paragraph-aware splitting
- `chunkTextSemantic()` - Build chunks respecting boundaries

### 2. Full-Text Search Database Migration

**File**: `supabase/migrations/002_add_fts_index.sql`

PostgreSQL full-text search support:
- GIN index on chunk content for fast text search
- `keyword_search_chunks()` RPC function for keyword search
- `hybrid_search_chunks()` RPC function with built-in RRF

### 3. Hybrid Search (Semantic + Keyword)

**File**: `src/lib/retrieval/semantic-search.ts`

Combined search using Reciprocal Rank Fusion (RRF):
- `keywordSearch()` - PostgreSQL full-text search
- `hybridSearch()` - Combines semantic + keyword with RRF
- Default weights: 60% semantic, 40% keyword
- RRF constant k=60

**RRF Formula**:
```
score(d) = Σ weight_i * (1 / (k + rank_i))
```

### 4. Enhanced Source Tracking

**File**: `src/lib/types.ts`

Extended `RetrievedChunk` interface:
- `chunkIndex` - Position in document
- `retrievalMethod` - 'semantic' | 'keyword' | 'hybrid'
- `keywordScore` - Full-text search rank
- `combinedScore` - RRF combined score

Rich citations in `assembleContext()`:
- Format: `[Source: filename, Page X, Section: "Title", Chunk N]`

### 5. Streaming Responses (SSE)

**File**: `src/lib/generation/synthesizer.ts`

Server-Sent Events streaming:
- `synthesizeStream()` async generator
- Uses `gpt-5-mini-2025-08-07` for streaming (thinking models don't support streaming)
- Events: `sources`, `token`, `done`, `error`

**Event types**:
```typescript
type QueryStreamEvent =
  | { type: 'sources'; sources: Source[] }
  | { type: 'token'; content: string }
  | { type: 'done'; usage?: { completionTokens?: number } }
  | { type: 'error'; message: string };
```

### 6. Streaming API Route

**File**: `src/app/api/files/query/route.ts`

SSE endpoint:
- Detects `Accept: text/event-stream` header
- Returns streaming response for SSE requests
- Falls back to JSON for non-streaming requests
- Uses hybrid search for detailed/deep modes

### 7. Client-Side Streaming Handler

**File**: `src/components/DocsApp.tsx`

Real-time streaming UI:
- `isStreaming` state for UI feedback
- Progressive content rendering
- Sources displayed before content arrives
- Proper error handling in stream

### 8. Streaming UI Components

**File**: `src/components/ResultDisplay.tsx`

Enhanced result display:
- Blinking cursor during streaming
- Auto-expand sources when they arrive
- Section display in source cards
- "Retrieved" indicator during streaming

### 9. Enhanced Prompts

**File**: `src/lib/generation/prompts.ts`

Better citation guidance:
- Section-aware citation format
- Source prioritization rules
- Conflict handling guidance
- TXT/MD file citation format

## Database Migration

Run in Supabase SQL Editor:

```sql
-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_file_chunks_content_fts
ON file_chunks USING GIN (to_tsvector('english', content));

-- Keyword search RPC
CREATE OR REPLACE FUNCTION keyword_search_chunks(
  search_query text,
  file_ids uuid[],
  match_count int DEFAULT 10
) RETURNS TABLE (...) LANGUAGE plpgsql;

-- Hybrid search RPC (optional)
CREATE OR REPLACE FUNCTION hybrid_search_chunks(
  query_embedding vector(1536),
  search_query text,
  file_ids uuid[],
  ...
) RETURNS TABLE (...) LANGUAGE plpgsql;
```

## Configuration

### Hybrid Search Config

```typescript
const DEFAULT_HYBRID_CONFIG = {
  semanticWeight: 0.6,  // 60% semantic
  keywordWeight: 0.4,   // 40% keyword
  rrf_k: 60,            // RRF constant
};
```

### Search Mode Behavior

| Mode | Search Method | Top-K | Streaming Model |
|------|--------------|-------|-----------------|
| Simple | Semantic only | 10 | gpt-5-mini-2025-08-07 |
| Detailed | Hybrid | 15 | gpt-5-mini-2025-08-07 |
| Deep | Hybrid | 15 | gpt-5-mini-2025-08-07 |

## Verification Checklist

- [ ] Run database migration `002_add_fts_index.sql`
- [ ] Upload a markdown file with headers
- [ ] Verify `section_title` is populated in database
- [ ] Test hybrid search with specific keywords
- [ ] Verify streaming with network tab showing `text/event-stream`
- [ ] Check citations include section titles when available

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/chunking/chunker.ts` | Section detection, semantic chunking |
| `src/lib/retrieval/semantic-search.ts` | Keyword search, hybrid search, RRF |
| `src/lib/generation/synthesizer.ts` | `synthesizeStream()` function |
| `src/lib/generation/prompts.ts` | Enhanced citation format |
| `src/lib/types.ts` | Streaming types, extended RetrievedChunk |
| `src/app/api/files/query/route.ts` | SSE streaming support |
| `src/components/DocsApp.tsx` | Streaming fetch handler |
| `src/components/ResultDisplay.tsx` | Streaming UI with cursor |
| `supabase/migrations/002_add_fts_index.sql` | Full-text search index |
