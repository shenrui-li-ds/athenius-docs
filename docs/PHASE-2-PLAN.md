# Phase 2: Enhanced RAG Pipeline

## Overview

Enhance the RAG pipeline with semantic chunking, hybrid search, streaming responses, and improved source tracking for better retrieval accuracy and user experience.

## Status: COMPLETED (with caveats)

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
- `keyword_search_chunks()` RPC function for keyword search (OR logic)
- `hybrid_search_chunks()` RPC function with built-in RRF

### 3. Hybrid Search (Semantic + Keyword) - DISABLED

**File**: `src/lib/retrieval/semantic-search.ts`

**Status**: Implemented but **disabled** due to quality issues.

Combined search using Reciprocal Rank Fusion (RRF):
- `keywordSearch()` - PostgreSQL full-text search with OR logic
- `hybridSearch()` - Combines semantic + keyword with RRF
- Configurable weights (tested 60/40 and 80/20)

**Issues discovered**:
- OR-based keyword search is too broad for complex questions
- Boosts irrelevant chunks containing common words ("car", "think", "drive")
- Pure semantic search produces better results for nuanced queries
- Multi-hop reasoning questions (requiring info from multiple chunks) still fail

**Current state**: `useHybridSearch = false` in route.ts

**Conclusion**: Simple keyword hybrid doesn't solve multi-hop reasoning. Need entity-based retrieval (see Phase 3 HybridRAG).

### 4. Enhanced Source Tracking

**File**: `src/lib/types.ts`

Extended `RetrievedChunk` interface:
- `chunkIndex` - Position in document
- `retrievalMethod` - 'semantic' | 'keyword' | 'hybrid'
- `keywordScore` - Full-text search rank
- `combinedScore` - RRF combined score

Rich citations in `assembleContext()`:
- Format: `[Source: filename, Page X, Section: "Title", Chunk N]`

### 5. Streaming Responses (SSE) - DISABLED

**File**: `src/lib/generation/synthesizer.ts`

**Status**: Implemented but **disabled** for debugging.

Server-Sent Events streaming:
- `synthesizeStream()` async generator
- Uses `gpt-5-mini-2025-08-07` (thinking model)
- Events: `sources`, `token`, `done`, `error`

**Current state**: `acceptsStream = false` in route.ts (using non-streaming JSON responses)

### 6. Streaming API Route

**File**: `src/app/api/files/query/route.ts`

SSE endpoint (disabled):
- Detects `Accept: text/event-stream` header
- Returns streaming response for SSE requests
- Falls back to JSON for non-streaming requests

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

## Current Configuration

### Search Mode Behavior

| Mode | Search Method | Top-K | Model |
|------|--------------|-------|-------|
| Simple | Semantic only | 10 | gpt-5-mini-2025-08-07 |
| Detailed | Semantic only | 25 | gpt-5-mini-2025-08-07 |

### Token Limits (for thinking model)

| Mode | max_completion_tokens |
|------|----------------------|
| Simple | 4000 |
| Detailed | 8000 |

Note: Thinking models use tokens for reasoning + output, so limits are higher than typical.

## Lessons Learned

1. **Keyword search with OR is too broad** - Matches any chunk with common words, hurting precision
2. **RRF can hurt results** - Boosts chunks found in both searches, but those aren't always the best
3. **Multi-hop reasoning requires entity relationships** - Vector similarity alone can't connect "Myrtle saw yellow car" → "Tom drove yellow car" → "Myrtle thought Tom was driving"
4. **Thinking models need more tokens** - `max_completion_tokens` includes reasoning, not just output

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/chunking/chunker.ts` | Section detection, semantic chunking |
| `src/lib/retrieval/semantic-search.ts` | Keyword search, hybrid search, RRF |
| `src/lib/generation/synthesizer.ts` | `synthesizeStream()`, increased token limits |
| `src/lib/generation/prompts.ts` | Enhanced citation format |
| `src/lib/types.ts` | Streaming types, extended RetrievedChunk, HybridSearchConfig |
| `src/app/api/files/query/route.ts` | SSE streaming support (disabled), hybrid toggle |
| `src/components/DocsApp.tsx` | Streaming fetch handler |
| `src/components/ResultDisplay.tsx` | Streaming UI with cursor |
| `supabase/migrations/002_add_fts_index.sql` | Full-text search index, OR-based keyword search |

## Next Steps (Phase 3)

The key insight from Phase 2: **simple hybrid search doesn't solve multi-hop reasoning**. Phase 3 will implement **Progressive HybridRAG** with entity extraction to handle complex questions over narratives and long documents.
