# Athenius Docs

A file-based AI research assistant that provides grounded, citation-accurate answers from uploaded documents. Designed to work standalone or integrate with Athenius Search for hybrid web+document queries.

## Features

- **Multi-file Upload**: Upload PDF, DOCX, TXT, and Markdown files
- **RAG-powered Q&A**: Ask questions and get answers grounded in your documents
- **Citation Tracking**: Every claim cites specific file + page/section
- **Hybrid Mode**: Integrate with Athenius Search for combined web + document queries
- **Multi-provider LLM**: Support for DeepSeek, OpenAI, Claude, Gemini, and Grok

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | Supabase PostgreSQL |
| Vector Store | Supabase pgvector |
| File Storage | Supabase Storage |
| Auth | Supabase Auth |
| Embeddings | OpenAI text-embedding-3-small |
| LLM | Multi-provider |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account (shared with Athenius Search)
- OpenAI API key (for embeddings)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/athenius-docs.git
cd athenius-docs

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Run database migrations
npx supabase db push

# Start development server
npm run dev
```

### Environment Variables

Create a `.env.local` file with the following:

```bash
# Supabase (shared with Athenius Search)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# LLM Providers
OPENAI_API_KEY=your_openai_key
DEEPSEEK_API_KEY=your_deepseek_key
ANTHROPIC_API_KEY=your_anthropic_key
GEMINI_API_KEY=your_gemini_key
GROK_API_KEY=your_grok_key

# External API (for Athenius Search integration)
ATHENIUS_API_KEY=your_secure_api_key
DOCS_API_URL=https://docs.athenius.ai
```

### Generating an API Key

Generate a secure 256-bit API key using any of these methods:

```bash
# Option 1: OpenSSL (recommended)
openssl rand -hex 32

# Option 2: Python
python3 -c "import secrets; print(secrets.token_hex(32))"

# Option 3: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the same key in both Athenius Docs and Athenius Search environments.

## Project Structure

```
athenius-docs/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   ├── files/         # File management APIs
│   │   │   └── internal/      # Internal APIs for Athenius Search
│   │   ├── page.tsx           # Main UI
│   │   └── library/           # File library page
│   ├── components/            # React components
│   ├── lib/                   # Core libraries
│   │   ├── extraction/        # File content extraction
│   │   ├── chunking/          # Text chunking strategies
│   │   ├── embeddings/        # Vector embedding generation
│   │   ├── retrieval/         # Semantic search & retrieval
│   │   ├── generation/        # LLM synthesis & prompts
│   │   └── supabase/          # Database utilities
│   └── i18n/                  # Internationalization
├── supabase/
│   └── migrations/            # Database migrations
└── public/                    # Static assets
```

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test         # Run tests in watch mode
npm run test:run     # Run tests once
npm run test:coverage # Run tests with coverage
```

## Development Phases

### Phase 1: Core Infrastructure
- [x] Project setup with Next.js 15
- [x] Supabase integration (auth, storage)
- [x] File upload to Supabase Storage
- [x] PDF and TXT extraction
- [x] Basic chunking with overlap
- [x] OpenAI embedding generation
- [x] pgvector storage and semantic search
- [x] Query endpoint with RAG
- [x] Basic UI (upload, query, results)
- [x] Unit tests (52 tests passing)

### Phase 2: RAG Pipeline
- [x] Semantic chunking with overlap
- [x] Hybrid search (semantic + keyword)
- [x] Context assembly with source tracking
- [x] Streaming synthesis with citations
- [x] Grounded prompt engineering
- [x] Basic UI (upload + query + results)

### Phase 3: Integration
- [x] External APIs for Athenius Search (`/api/v1/*`)
- [x] Service-to-service authentication (API key + User ID)
- [x] Entity extraction for deep analysis
- [x] Multi-file session support
- [x] File library UI

### Phase 4: Polish
- [ ] DOCX support
- [ ] Re-ranking for better retrieval
- [ ] File expiration cleanup job
- [ ] Error handling and retry logic
- [ ] Performance optimization
- [ ] Internationalization (EN/ZH)

## API Reference

### Internal APIs (Web UI)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/files/upload` | POST | Upload a file |
| `/api/files/[id]/status` | GET | Check file processing status |
| `/api/files/query` | POST | Query uploaded files |
| `/api/files` | GET | List user's files |
| `/api/files/[id]` | DELETE | Delete a file |

### External API (for Athenius Search)

Secure API for service-to-service communication. See [API.md](API.md) for full documentation.

**Authentication:** All requests require:
- `Authorization: Bearer <ATHENIUS_API_KEY>`
- `X-User-ID: <user-uuid>`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/files` | GET | List user's files |
| `/api/v1/files` | POST | Upload a file |
| `/api/v1/files/[id]` | GET | Get file details |
| `/api/v1/files/[id]` | DELETE | Delete a file |
| `/api/v1/files/query` | POST | Query documents (streaming supported) |
| `/api/v1/files/[id]/entities` | GET | Get entity extraction status |
| `/api/v1/files/[id]/entities` | POST | Enable entity extraction |
| `/api/v1/files/[id]/entities` | DELETE | Disable entity extraction |

## Architecture

```
User Query → Embed → Semantic Search → Re-rank → Context Assembly → LLM Generation
                          ↓
                     pgvector DB
                          ↑
File Upload → Extract → Chunk → Embed → Store
```

## Contributing

1. Read `CLAUDE.md` for development guidelines
2. Check the relevant `CLAUDE.md` in subdirectories for context-specific guidance
3. Follow the established patterns in the codebase
4. Ensure all code is properly typed with TypeScript
5. Test your changes before submitting

## License

Proprietary - All rights reserved
