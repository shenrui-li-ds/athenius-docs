# Athenius Docs - Blueprint

This document serves as the architectural blueprint and development guide for Athenius Docs, a file-based AI research assistant that complements Athenius Search.

## Project Overview

### Vision
Athenius Docs is a standalone application for AI-powered document analysis that:
1. Allows users to upload and analyze multiple documents
2. Provides grounded, citation-accurate answers from uploaded files
3. Exposes secure APIs for integration with Athenius Search (hybrid mode)
4. Shares infrastructure with Athenius Search (Supabase, auth, credits)

### Key Principles
- **Grounded responses**: Every claim must cite specific file + location
- **No hallucination**: LLM must only use information from uploaded documents
- **Multi-file support**: Handle multiple files per session with parallel processing
- **Source abstraction**: Output format compatible with Athenius Search's source format

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           User Interface                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  File Upload Area  │  Query Input  │  Results Display            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
┌────────────────────────────────┴────────────────────────────────────────┐
│                         Athenius Docs App                                │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   Upload     │  │  Extraction  │  │   Chunking   │  │  Indexing   │ │
│  │   Service    │→ │   Pipeline   │→ │   Engine     │→ │  (Vectors)  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│                                                                │         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │         │
│  │   Query      │← │  Retrieval   │← │   Semantic   │←────────┘         │
│  │   Engine     │  │  Augmented   │  │   Search     │                   │
│  └──────┬───────┘  │  Generation  │  └──────────────┘                   │
│         │          └──────────────┘                                      │
│         │                                                                │
│  ┌──────┴───────────────────────────────────────────────────────────┐   │
│  │                    Internal API (for Athenius Search)             │   │
│  │    POST /api/internal/retrieve - Get relevant chunks              │   │
│  │    POST /api/internal/sources  - Get file sources in Tavily fmt   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                    (Shared Supabase Instance)
                                 │
┌────────────────────────────────┴────────────────────────────────────────┐
│                         Athenius Search App                              │
│  • Calls /api/internal/retrieve when files attached                      │
│  • Merges file sources with web sources for hybrid mode                  │
│  • Uses same auth, credits, user system                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. UPLOAD FLOW
   Files → Upload API → Supabase Storage → Extract → Chunk → Embed → Vector DB

2. QUERY FLOW (Standalone)
   Query → Embed Query → Semantic Search → Retrieve Chunks → RAG Synthesis → Response

3. QUERY FLOW (From Athenius Search - Hybrid Mode)
   Athenius Search → /api/internal/retrieve → Chunks as "Sources" → Merge with Web → Synthesize
```

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Framework** | Next.js 15 (App Router) | Same as Athenius Search, code sharing |
| **Language** | TypeScript | Type safety, consistency |
| **Database** | Supabase PostgreSQL | Shared with Athenius Search |
| **Vector Store** | Supabase pgvector | Native PostgreSQL extension, no extra service |
| **File Storage** | Supabase Storage | Shared bucket, RLS policies |
| **Auth** | Supabase Auth | Shared with Athenius Search |
| **Embeddings** | OpenAI text-embedding-3-small | Cost-effective, good quality |
| **LLM** | Multi-provider (same as Search) | DeepSeek, OpenAI, Claude, Gemini, Grok |
| **PDF Extraction** | pdf-parse or @anthropic-ai/pdf | Server-side extraction |
| **DOCX Extraction** | mammoth | DOCX to text/HTML |
| **Deployment** | Vercel | Same platform as Search |

---

## Shared Supabase Schema

### Existing Tables (from Athenius Search)
```sql
-- Already exists - shared
auth.users              -- User accounts
public.user_credits     -- Credit balances
public.user_preferences -- User settings
public.credit_purchases -- Purchase history
```

### New Tables for Athenius Docs

```sql
-- File uploads metadata
CREATE TABLE public.file_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,  -- 'pdf', 'docx', 'txt', 'md'
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,  -- Path in Supabase Storage
  status TEXT DEFAULT 'pending',  -- 'pending', 'processing', 'ready', 'error'
  error_message TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',

  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'ready', 'error'))
);

-- File chunks with embeddings
CREATE TABLE public.file_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID REFERENCES public.file_uploads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  page_number INTEGER,  -- For PDFs
  section_title TEXT,   -- If extractable
  embedding vector(1536),  -- OpenAI text-embedding-3-small dimension
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(file_id, chunk_index)
);

-- Index for vector similarity search
CREATE INDEX ON public.file_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for filtering by user/file
CREATE INDEX idx_file_chunks_user ON public.file_chunks(user_id);
CREATE INDEX idx_file_chunks_file ON public.file_chunks(file_id);

-- File sessions (group of files for a query session)
CREATE TABLE public.file_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  file_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own files" ON public.file_uploads
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own chunks" ON public.file_chunks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own sessions" ON public.file_sessions
  FOR ALL USING (auth.uid() = user_id);
```

### Supabase Storage Bucket

```sql
-- Create bucket for file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

-- RLS: Users can only access their own files
CREATE POLICY "Users can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

---

## API Routes

### Public APIs (User-facing)

#### `POST /api/files/upload`
Upload one or more files. Called in parallel for multiple files.

```typescript
// Request: multipart/form-data
{
  file: File,  // Single file per request (parallel calls for multiple)
}

// Response
{
  fileId: string,
  filename: string,
  status: 'pending',
  message: 'File uploaded, processing started'
}
```

#### `GET /api/files/[id]/status`
Check processing status of a file.

```typescript
// Response
{
  fileId: string,
  status: 'pending' | 'processing' | 'ready' | 'error',
  chunkCount?: number,
  error?: string
}
```

#### `POST /api/files/query`
Query uploaded files with RAG.

```typescript
// Request
{
  query: string,
  fileIds: string[],  // Files to search
  mode: 'simple' | 'detailed',  // Response depth
  provider?: string  // LLM provider
}

// Response (streaming)
{
  content: string,  // Streamed markdown with citations
  sources: [{
    fileId: string,
    filename: string,
    page?: number,
    section?: string,
    excerpt: string
  }]
}
```

#### `GET /api/files`
List user's uploaded files.

```typescript
// Response
{
  files: [{
    id: string,
    filename: string,
    fileType: string,
    fileSize: number,
    status: string,
    chunkCount: number,
    createdAt: string,
    expiresAt: string
  }]
}
```

#### `DELETE /api/files/[id]`
Delete a file and its chunks.

### Internal APIs (for Athenius Search)

#### `POST /api/internal/retrieve`
Called by Athenius Search to get relevant chunks for hybrid mode.

```typescript
// Request
{
  fileIds: string[],
  query: string,
  maxChunks?: number,  // Default: 10
  serviceToken: string  // Inter-service auth
}

// Response
{
  chunks: [{
    fileId: string,
    filename: string,
    content: string,
    page?: number,
    section?: string,
    relevanceScore: number
  }]
}
```

#### `POST /api/internal/sources`
Get file chunks formatted as Athenius Search sources (Tavily-compatible format).

```typescript
// Request
{
  fileIds: string[],
  query: string,
  maxSources?: number,
  serviceToken: string
}

// Response
{
  sources: [{
    id: string,
    title: string,  // filename
    url: string,    // "file://filename#page=3"
    content: string,
    snippet: string
  }]
}
```

---

## Context Engineering: RAG Implementation

### Overview

We use Retrieval-Augmented Generation (RAG) with the following pipeline:

```
Query → Embed → Semantic Search → Re-rank → Context Assembly → LLM Generation
```

### 1. Chunking Strategy

**Approach**: Semantic chunking with overlap

```typescript
const CHUNKING_CONFIG = {
  targetChunkSize: 512,    // tokens (roughly 2000 chars)
  maxChunkSize: 1024,      // hard limit
  overlapSize: 64,         // token overlap between chunks
  minChunkSize: 100,       // don't create tiny chunks
};
```

**Chunking Rules**:
1. Prefer splitting at paragraph boundaries
2. If paragraph too long, split at sentence boundaries
3. Preserve headers with their content
4. Maintain overlap for context continuity

### 2. Embedding Model

**Model**: `text-embedding-3-small` (OpenAI)
- Dimension: 1536
- Cost: $0.00002 per 1K tokens
- Good balance of quality vs cost

**Alternative** (if cost-sensitive): Consider `nomic-embed-text` via Ollama for local embedding

### 3. Retrieval Strategy

**Hybrid Search**: Combine semantic + keyword search

```sql
-- Semantic search with pgvector
SELECT
  fc.id,
  fc.content,
  fc.page_number,
  fu.filename,
  1 - (fc.embedding <=> $1) as similarity
FROM file_chunks fc
JOIN file_uploads fu ON fc.file_id = fu.id
WHERE fc.file_id = ANY($2)  -- Filter by file IDs
ORDER BY fc.embedding <=> $1
LIMIT $3;
```

**Re-ranking** (optional, for better accuracy):
- Use Cohere Rerank or cross-encoder model
- Re-score top-k results for final ordering

### 4. Context Assembly

**Strategy**: Assemble context with source tracking

```typescript
interface ContextChunk {
  content: string;
  fileId: string;
  filename: string;
  page?: number;
  chunkIndex: number;
}

function assembleContext(chunks: ContextChunk[], maxTokens: number): string {
  let context = '';
  let tokenCount = 0;
  const usedChunks: ContextChunk[] = [];

  for (const chunk of chunks) {
    const chunkTokens = estimateTokens(chunk.content);
    if (tokenCount + chunkTokens > maxTokens) break;

    context += `\n\n[Source: ${chunk.filename}${chunk.page ? `, Page ${chunk.page}` : ''}]\n${chunk.content}`;
    tokenCount += chunkTokens;
    usedChunks.push(chunk);
  }

  return { context, usedChunks };
}
```

### 5. Generation with Grounding

**System Prompt** (Critical for preventing hallucination):

```xml
<role>
You are a document analysis assistant. You ONLY answer questions based on the provided document excerpts.
</role>

<critical-rules>
1. ONLY use information explicitly stated in the provided documents
2. Every factual claim MUST include a citation: [Filename, Page X] or [Filename, Section Y]
3. If the documents don't contain information to answer a question, say:
   "The provided documents do not contain information about [topic]."
4. Do NOT use your general knowledge - ONLY the documents
5. Do NOT infer, assume, or extrapolate beyond what's written
6. When uncertain, quote directly from the source
</critical-rules>

<citation-format>
Use inline citations: "The revenue increased by 20% [Annual Report, Page 5]."
Multiple sources: "This claim is supported [Doc1, Page 3] [Doc2, Page 7]."
</citation-format>

<documents>
{context}
</documents>
```

### 6. Advanced Techniques (Future)

| Technique | Description | When to Add |
|-----------|-------------|-------------|
| **Query Expansion** | Generate multiple query variants | When recall is low |
| **HyDE** | Hypothetical Document Embeddings | For abstract queries |
| **Multi-hop RAG** | Chain of retrieval for complex questions | For multi-part questions |
| **Contextual Compression** | Summarize chunks before sending to LLM | For very long documents |

---

## File Processing Pipeline

### Processing Flow

```
Upload
   │
   ▼
┌─────────────────────┐
│  1. Store in        │
│  Supabase Storage   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  2. Extract Text    │
│  (PDF/DOCX/TXT)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  3. Clean & Chunk   │
│  (Semantic splits)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  4. Generate        │
│  Embeddings (batch) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  5. Store Chunks    │
│  in pgvector        │
└──────────┬──────────┘
           │
           ▼
      Status: 'ready'
```

### Extraction by File Type

```typescript
const extractors: Record<string, (buffer: Buffer) => Promise<ExtractedContent>> = {
  'pdf': extractPDF,      // pdf-parse or @anthropic-ai/pdf
  'docx': extractDOCX,    // mammoth
  'txt': extractText,     // Direct UTF-8
  'md': extractMarkdown,  // Direct UTF-8, preserve structure
};

interface ExtractedContent {
  text: string;
  pages?: { pageNumber: number; content: string }[];
  metadata?: {
    title?: string;
    author?: string;
    createdAt?: string;
  };
}
```

### Parallel Processing for Multi-file

```typescript
// Client-side: Upload files in parallel
const uploadFiles = async (files: File[]) => {
  const uploads = files.map(file =>
    fetch('/api/files/upload', {
      method: 'POST',
      body: createFormData(file),
    })
  );

  const results = await Promise.all(uploads);
  return results.map(r => r.json());
};

// Server-side: Process files async (don't block upload response)
export async function POST(request: NextRequest) {
  // 1. Store file immediately
  const fileId = await storeFile(file);

  // 2. Queue processing (don't await)
  processFileAsync(fileId).catch(console.error);

  // 3. Return immediately
  return NextResponse.json({ fileId, status: 'pending' });
}
```

---

## Integration with Athenius Search

### Service-to-Service Authentication

```typescript
// Environment variable shared between apps
// INTERNAL_SERVICE_TOKEN=<random-secure-token>

// Athenius Search calling Docs
const response = await fetch(`${DOCS_API_URL}/api/internal/retrieve`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ fileIds, query }),
});

// Athenius Docs validating
if (request.headers.get('Authorization') !== `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Hybrid Mode Flow (in Athenius Search)

```typescript
// In Athenius Search's search-client.tsx or API route

const performHybridSearch = async (query: string, fileIds: string[], mode: SearchMode) => {
  // 1. Get file sources (parallel with web search)
  const [fileSourcesResponse, webResults] = await Promise.all([
    // Call Athenius Docs
    fetch(`${DOCS_API_URL}/api/internal/sources`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SERVICE_TOKEN}` },
      body: JSON.stringify({ fileIds, query, maxSources: 5 }),
    }),
    // Call Tavily/Google (existing)
    callSearchWithFallback(query, false, 'basic', 10),
  ]);

  const fileSources = await fileSourcesResponse.json();

  // 2. Merge sources (files first, then web)
  const allSources = [
    ...fileSources.sources.map(s => ({ ...s, sourceType: 'file' })),
    ...webResults.sources.map(s => ({ ...s, sourceType: 'web' })),
  ];

  // 3. Synthesize with merged sources
  return synthesize(query, allSources, mode);
};
```

### Source Format Compatibility

Athenius Docs returns sources in Tavily-compatible format:

```typescript
// Tavily format (web)
{
  id: "abc123",
  title: "Article Title",
  url: "https://example.com/article",
  content: "Full content...",
  snippet: "Brief excerpt..."
}

// Athenius Docs format (file) - same structure
{
  id: "file-chunk-uuid",
  title: "Q3 Financial Report.pdf",
  url: "file://Q3 Financial Report.pdf#page=5",
  content: "Full chunk content...",
  snippet: "First 200 chars..."
}
```

---

## Credit System

### Credit Costs (Lower than Web Search)

| Mode | Web Credits | File Credits | Rationale |
|------|-------------|--------------|-----------|
| Simple Query | 1 | 0.5 | Single retrieval + synthesis |
| Detailed Analysis | 4 | 2 | Multi-pass analysis |
| Deep Analysis | 8 | 4 | Comprehensive multi-file |

### Credit Flow

```typescript
// Check credits before processing
const checkCredits = async (mode: FileQueryMode) => {
  const creditsNeeded = FILE_CREDIT_COSTS[mode];
  const { data } = await supabase.rpc('check_credits_available', {
    p_credits_needed: creditsNeeded,
  });
  return data.available >= creditsNeeded;
};

// Deduct after successful query
const deductCredits = async (mode: FileQueryMode) => {
  await supabase.rpc('use_credits', {
    p_credits: FILE_CREDIT_COSTS[mode],
    p_source: 'docs',
  });
};
```

---

## Security Considerations

### File Security
1. **Storage**: Files stored in private Supabase bucket with RLS
2. **Path structure**: `documents/{user_id}/{file_id}/{filename}`
3. **Expiration**: Files auto-expire after 24 hours (configurable)
4. **Size limits**: 50MB per file, 200MB total per user

### API Security
1. **Authentication**: All endpoints require Supabase auth
2. **Rate limiting**: 10 uploads/min, 60 queries/min per user
3. **Internal APIs**: Protected by service token
4. **Input validation**: File type, size, content validation

### Data Privacy
1. **No training**: User files never used for model training
2. **Encryption**: Files encrypted at rest (Supabase default)
3. **Deletion**: Hard delete on user request or expiration
4. **Logging**: No file content in logs, only metadata

---

## Directory Structure

```
athenius-docs/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── files/
│   │   │   │   ├── upload/route.ts
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── route.ts         # GET, DELETE
│   │   │   │   │   └── status/route.ts
│   │   │   │   ├── query/route.ts
│   │   │   │   └── route.ts             # GET list
│   │   │   └── internal/
│   │   │       ├── retrieve/route.ts
│   │   │       └── sources/route.ts
│   │   ├── page.tsx                     # Main UI
│   │   ├── library/page.tsx             # File library
│   │   └── layout.tsx
│   ├── components/
│   │   ├── FileUploader.tsx
│   │   ├── FileList.tsx
│   │   ├── QueryInput.tsx
│   │   ├── ResultDisplay.tsx
│   │   └── SourceCitation.tsx
│   ├── lib/
│   │   ├── extraction/
│   │   │   ├── pdf.ts
│   │   │   ├── docx.ts
│   │   │   └── text.ts
│   │   ├── chunking/
│   │   │   ├── chunker.ts
│   │   │   └── strategies.ts
│   │   ├── embeddings/
│   │   │   └── openai.ts
│   │   ├── retrieval/
│   │   │   ├── semantic-search.ts
│   │   │   └── reranker.ts
│   │   ├── generation/
│   │   │   ├── prompts.ts
│   │   │   └── synthesizer.ts
│   │   ├── supabase/
│   │   │   ├── client.ts                # Shared with Search
│   │   │   ├── server.ts
│   │   │   └── storage.ts
│   │   └── types.ts
│   └── i18n/                            # Shared translation structure
├── supabase/
│   └── migrations/
│       └── add-docs-tables.sql
├── CLAUDE.md                            # This file
├── package.json
└── ...
```

---

## Athenius Search Context

### About Athenius Search

Athenius Search is the companion web search application. Key things to know:

**Tech Stack**: Next.js 15, TypeScript, Tailwind CSS, Supabase, Multi-provider LLM support

**Search Modes**:
- **Web**: Single query → Tavily search → LLM summarization
- **Pro/Research**: Multi-angle research with planning → parallel searches → synthesis
- **Deep**: Two-round research with gap analysis
- **Brainstorm**: Lateral thinking with cross-domain inspiration

**Agentic Pipeline**:
```
Query → Refiner → Router → Planner → Search → Extractor → Synthesizer → Proofreader
```

**Key API Routes** (that Docs may interact with):
- `/api/check-limit` - Credit checking
- `/api/finalize-credits` - Credit finalization
- `/api/summarize` - LLM summarization (streaming)
- `/api/research/synthesize` - Research synthesis

**Source Format**: All sources use this interface:
```typescript
interface Source {
  id: string;
  title: string;
  url: string;
  content: string;
  snippet?: string;
  iconUrl?: string;
}
```

**Streaming**: Uses SSE (Server-Sent Events) for streaming responses.

**Provider Support**: DeepSeek, OpenAI, Grok, Claude, Gemini - all available in Docs too.

---

## Development Phases

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Set up Next.js project with shared Supabase config
- [ ] Implement file upload to Supabase Storage
- [ ] PDF and TXT extraction
- [ ] Basic chunking (fixed-size)
- [ ] OpenAI embedding generation
- [ ] pgvector storage and search
- [ ] Simple query endpoint (no streaming)

### Phase 2: RAG Pipeline (Week 2-3)
- [ ] Semantic chunking with overlap
- [ ] Hybrid search (semantic + keyword)
- [ ] Context assembly with source tracking
- [ ] Streaming synthesis with citations
- [ ] Grounded prompt engineering
- [ ] Basic UI (upload + query + results)

### Phase 3: Integration (Week 3-4)
- [ ] Internal APIs for Athenius Search
- [ ] Service-to-service auth
- [ ] Credit system integration
- [ ] Multi-file session support
- [ ] File library UI

### Phase 4: Polish (Week 4+)
- [ ] DOCX support
- [ ] Re-ranking for better retrieval
- [ ] File expiration cleanup job
- [ ] Error handling and retry logic
- [ ] Performance optimization
- [ ] i18n (EN/ZH)

---

## Environment Variables

```bash
# Shared with Athenius Search
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# LLM Providers (shared)
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
GROK_API_KEY=

# Docs-specific
INTERNAL_SERVICE_TOKEN=          # For Athenius Search integration
DOCS_API_URL=                    # This app's URL (for Search to call)

# Optional
COHERE_API_KEY=                  # For re-ranking (optional)
```

---

## Commands

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Run migrations (Supabase)
supabase db push

# Generate types from Supabase
supabase gen types typescript --local > src/lib/supabase/types.ts
```

---

## Open Questions

1. **File persistence**: 24hr TTL vs permanent library?
2. **Embedding model**: OpenAI vs local (Ollama)?
3. **Re-ranking**: Worth the latency/cost?
4. **Max files per session**: 5? 10? Unlimited?
5. **Supported languages**: English only or multilingual?
