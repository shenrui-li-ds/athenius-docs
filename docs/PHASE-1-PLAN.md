# Phase 1: Core RAG Pipeline

## Overview

Build a file-based RAG (Retrieval-Augmented Generation) system that allows users to upload documents, have them processed into searchable chunks with embeddings, and query them using natural language.

## Status: COMPLETED

## Features Implemented

### 1. File Upload & Storage

- **Supported formats**: PDF, TXT, MD
- **Max file size**: 50MB
- **Storage**: Supabase Storage (`documents` bucket)
- **File path structure**: `documents/{user_id}/{file_id}/{filename}`

### 2. Document Processing Pipeline

- **PDF extraction**: Using `pdf-parse` library
- **Text extraction**: Direct file reading
- **Chunking**: Character-based with overlap
  - Target chunk size: 2000 characters (~512 tokens)
  - Max chunk size: 4000 characters
  - Overlap: 200 characters
  - Minimum chunk size: 400 characters

### 3. Embedding Generation

- **Model**: OpenAI `text-embedding-3-small`
- **Dimensions**: 1536
- **Storage**: PostgreSQL with pgvector extension

### 4. Semantic Search

- **Vector index**: IVFFlat with cosine distance
- **Default top-K**: 10 results
- **Similarity calculation**: Cosine similarity

### 5. Response Synthesis

- **Model**: `gpt-5-mini-2025-08-07` (thinking model)
- **Query modes**: Simple, Detailed, Deep
- **Grounding**: Strict prompt engineering to prevent hallucination

### 6. User Interface

- File upload with drag-and-drop
- File list with status indicators
- Multi-file selection for queries
- Query input with mode selection
- Result display with collapsible sources

## Database Schema

### file_uploads

```sql
CREATE TABLE file_uploads (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);
```

### file_chunks

```sql
CREATE TABLE file_chunks (
  id UUID PRIMARY KEY,
  file_id UUID REFERENCES file_uploads(id),
  user_id UUID REFERENCES auth.users(id),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  page_number INTEGER,
  section_title TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/files` | GET | List user's files |
| `/api/files/upload` | POST | Upload a file |
| `/api/files/[id]` | DELETE | Delete a file |
| `/api/files/[id]/status` | GET | Get file processing status |
| `/api/files/query` | POST | Query uploaded files |

## Key Files

- `src/lib/extraction/` - PDF and text extractors
- `src/lib/chunking/chunker.ts` - Document chunking
- `src/lib/embeddings/openai.ts` - Embedding generation
- `src/lib/retrieval/semantic-search.ts` - Vector search
- `src/lib/generation/synthesizer.ts` - Response synthesis
- `src/lib/generation/prompts.ts` - System prompts
- `src/components/DocsApp.tsx` - Main UI component

## Testing

- 52 unit tests passing
- Test coverage for extraction, chunking, embeddings

## Known Limitations (Addressed in Phase 2)

1. Basic chunking doesn't respect paragraph/sentence boundaries
2. Section titles not extracted or used
3. No keyword search fallback
4. Non-streaming responses only
5. TXT files always show "Page 1" in citations
