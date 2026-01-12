# CLAUDE.md - Athenius Docs Development Guide

This file provides context and guidelines for AI assistants helping develop Athenius Docs.

## Project Overview

Athenius Docs is a file-based AI research assistant that:
1. Allows users to upload and analyze multiple documents (PDF, DOCX, TXT, MD)
2. Provides grounded, citation-accurate answers using RAG (Retrieval-Augmented Generation)
3. Exposes secure APIs for integration with Athenius Search (hybrid mode)
4. Shares infrastructure with Athenius Search (Supabase, auth, credits)

**See `ATHENIUS-DOCS-BLUEPRINT.md` for full architectural details.**

## Key Principles

### 1. Grounded Responses
- Every factual claim MUST cite specific file + page/section
- LLM must ONLY use information from uploaded documents
- No hallucination - if information isn't in the documents, say so

### 2. Source Abstraction
- Output format must be compatible with Athenius Search's source format
- File sources use same interface as Tavily web sources:
```typescript
interface Source {
  id: string;
  title: string;      // filename
  url: string;        // "file://filename#page=3"
  content: string;
  snippet?: string;
}
```

### 3. Multi-file Support
- Handle multiple files per session with parallel processing
- Files are uploaded in parallel, processed asynchronously
- Queries can span multiple files simultaneously

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: Supabase PostgreSQL with pgvector extension
- **Auth**: Supabase Auth (shared with Athenius Search)
- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions)
- **File Extraction**: pdf-parse (PDF), mammoth (DOCX)
- **Deployment**: Vercel

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
npx supabase db push # Apply database migrations
```

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── api/
│   │   ├── files/         # Public file management APIs
│   │   └── internal/      # Internal APIs for Athenius Search
│   ├── page.tsx           # Main upload & query UI
│   └── library/           # File library/management page
├── components/            # React components
├── lib/                   # Core business logic
│   ├── extraction/        # File content extraction (PDF, DOCX, TXT)
│   ├── chunking/          # Text chunking strategies
│   ├── embeddings/        # Vector embedding generation
│   ├── retrieval/         # Semantic search & retrieval
│   ├── generation/        # LLM synthesis & prompts
│   └── supabase/          # Database client & utilities
└── i18n/                  # Internationalization
```

## Database Schema

### Key Tables

1. **file_uploads**: Metadata for uploaded files
   - `id`, `user_id`, `filename`, `file_type`, `status`, `storage_path`
   - Status: 'pending' → 'processing' → 'ready' | 'error'

2. **file_chunks**: Document chunks with embeddings
   - `id`, `file_id`, `chunk_index`, `content`, `page_number`, `embedding`
   - Vector column: `embedding vector(1536)`

3. **file_sessions**: Groups of files for a query session

### Vector Search Query Pattern
```sql
SELECT fc.*, 1 - (fc.embedding <=> $1) as similarity
FROM file_chunks fc
WHERE fc.file_id = ANY($2)
ORDER BY fc.embedding <=> $1
LIMIT $3;
```

## RAG Pipeline

### 1. Chunking Configuration
```typescript
const CHUNKING_CONFIG = {
  targetChunkSize: 512,    // tokens
  maxChunkSize: 1024,
  overlapSize: 64,
  minChunkSize: 100,
};
```

### 2. Chunking Rules
- Prefer splitting at paragraph boundaries
- If paragraph too long, split at sentence boundaries
- Preserve headers with their content
- Maintain overlap for context continuity

### 3. Retrieval Strategy
- Embed query using OpenAI text-embedding-3-small
- Semantic search via pgvector cosine similarity
- Optional: Re-rank with Cohere for better accuracy

### 4. Generation Prompt (Critical)
```xml
<role>
You are a document analysis assistant. You ONLY answer questions based on the provided document excerpts.
</role>

<critical-rules>
1. ONLY use information explicitly stated in the provided documents
2. Every factual claim MUST include a citation: [Filename, Page X]
3. If documents don't contain information, say so explicitly
4. Do NOT use general knowledge - ONLY the documents
5. Do NOT infer or extrapolate beyond what's written
</critical-rules>
```

## API Routes

### Internal APIs (Web UI)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/files/upload` | POST | Upload single file (multipart/form-data) |
| `/api/files/[id]/status` | GET | Check processing status |
| `/api/files/query` | POST | Query files with RAG |
| `/api/files` | GET | List user's files |
| `/api/files/[id]` | DELETE | Delete file and chunks |

### External APIs (for Athenius Search integration)

Secure API under `/api/v1/*` for service-to-service communication.

**Authentication**: All requests require:
- `Authorization: Bearer <ATHENIUS_API_KEY>` header
- `X-User-ID: <user-uuid>` header

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/v1/files` | GET | List user's files with pagination |
| `/api/v1/files` | POST | Upload file (multipart/form-data) |
| `/api/v1/files/[id]` | GET | Get file details |
| `/api/v1/files/[id]` | DELETE | Delete file and all data |
| `/api/v1/files/query` | POST | Query documents (streaming supported) |
| `/api/v1/files/[id]/entities` | GET | Get entity extraction status/stats |
| `/api/v1/files/[id]/entities` | POST | Enable entity extraction |
| `/api/v1/files/[id]/entities` | DELETE | Disable entity extraction |

See [API.md](API.md) for full documentation with examples.

## Integration with Athenius Search

### Hybrid Mode Flow
1. Athenius Search receives query with attached files
2. Calls `/api/v1/files/query` with file IDs and query
3. Receives response with sources in Tavily-compatible format
4. Merges file sources with web sources
5. Synthesizes combined response

### Source Format Compatibility
```typescript
// File source (same structure as web source)
{
  id: "file-chunk-uuid",
  title: "Q3 Report.pdf",
  url: "file://Q3 Report.pdf#page=5",
  content: "Full chunk content...",
  snippet: "First 200 chars..."
}
```

## Credit System

File queries cost fewer credits than web searches:

| Mode | File Credits | Web Credits |
|------|--------------|-------------|
| Simple | 0.5 | 1 |
| Detailed | 2 | 4 |
| Deep | 4 | 8 |

## Security Requirements

1. **RLS Policies**: All tables must have Row Level Security
2. **File Paths**: Use `documents/{user_id}/{file_id}/{filename}` structure
3. **External API Auth**: Validate `ATHENIUS_API_KEY` + `X-User-ID` headers
4. **File Limits**: 10MB per file
5. **Expiration**: Files auto-expire after 24 hours (configurable)

### Generating an API Key

```bash
# OpenSSL (recommended)
openssl rand -hex 32

# Python
python3 -c "import secrets; print(secrets.token_hex(32))"

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Development Guidelines

### When Adding New Features
1. Check ATHENIUS-DOCS-BLUEPRINT.md for architectural guidance
2. Follow existing patterns in the codebase
3. Ensure TypeScript strict mode compliance
4. Add proper error handling and validation
5. Update relevant CLAUDE.md files if adding new patterns

### Code Style
- Use async/await for all asynchronous operations
- Prefer named exports over default exports
- Use descriptive variable names
- Add JSDoc comments for public functions
- Keep functions focused and single-purpose

### Testing New Endpoints
```bash
# Upload file
curl -X POST -F "file=@test.pdf" http://localhost:3000/api/files/upload

# Check status
curl http://localhost:3000/api/files/{fileId}/status

# Query files
curl -X POST -H "Content-Type: application/json" \
  -d '{"query":"...", "fileIds":["..."]}' \
  http://localhost:3000/api/files/query
```

## Common Patterns

### Supabase Client Usage
```typescript
// Server-side (API routes)
import { createClient } from '@/lib/supabase/server';
const supabase = createClient();

// Client-side (components)
import { createClient } from '@/lib/supabase/client';
const supabase = createClient();
```

### Streaming Response Pattern
```typescript
import { StreamingTextResponse } from 'ai';

export async function POST(req: Request) {
  const stream = await generateStreamingResponse();
  return new StreamingTextResponse(stream);
}
```

### Error Response Pattern
```typescript
return NextResponse.json(
  { error: 'Description of error' },
  { status: 400 }
);
```

## Current Development Phase

**Phase 4: Polish** (Current)
- Phases 1-3 complete: Core infrastructure, RAG pipeline, and integration done
- Focus on: DOCX support, re-ranking, cleanup jobs, i18n

See README.md for full phase breakdown and progress tracking.
