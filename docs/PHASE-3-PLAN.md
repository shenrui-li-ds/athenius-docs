# Phase 3: Advanced Features

## Overview

Advanced RAG features with a focus on **Progressive HybridRAG** for multi-hop reasoning, plus multi-turn conversations, document comparison, DOCX support, and analytics.

## Status: PHASE 3A COMPLETE (Progressive HybridRAG)

---

## Priority 0: Progressive HybridRAG (NEW)

### Problem Statement

Phase 2 revealed that simple vector + keyword hybrid search fails for **multi-hop reasoning** questions like:
> "At the time of the accident, who did Myrtle think was driving the car?"

This requires connecting:
1. Tom drove the yellow car earlier
2. Myrtle recognized the yellow car
3. Myrtle ran out thinking it was Tom
4. But Daisy was actually driving

Vector similarity finds semantically similar chunks but **cannot traverse relationships**.

### Solution: Progressive HybridRAG

A flexible approach that:
- Works for all document types (vector fallback)
- Excels at narratives/legal docs when entity extraction is enabled
- Uses existing Supabase (no new graph database required)

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Document Upload                        │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Step 1: Always                                          │
│  - Chunk document (semantic chunking)                    │
│  - Generate embeddings                                   │
│  - Store in vector DB (existing)                         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Step 2: Document Type Detection                         │
│  - Narrative/Novel? → Enable entity extraction           │
│  - Legal/Contract? → Enable entity extraction            │
│  - Technical docs? → Skip (vector sufficient)            │
│  - User toggle: "Deep Analysis" checkbox                 │
└─────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐    ┌──────────────────────┐
│  Entity Extraction   │    │  Skip (vector only)  │
│  - Characters        │    │                      │
│  - Locations         │    │                      │
│  - Objects           │    │                      │
│  - Events            │    │                      │
│  - Relationships     │    │                      │
└──────────────────────┘    └──────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     Query Time                           │
└─────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐    ┌──────────────────────┐
│  Simple Query        │    │  Complex Query       │
│  → Vector search     │    │  → Entity lookup     │
│  → Return results    │    │  → Find related      │
│                      │    │  → Expand search     │
│                      │    │  → Vector + entities │
└──────────────────────┘    └──────────────────────┘
```

### Database Schema (Supabase)

```sql
-- Entity types: character, location, object, event, organization
CREATE TABLE document_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID REFERENCES file_uploads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  aliases TEXT[], -- Alternative names/spellings
  description TEXT,
  first_mention_chunk INTEGER,
  mention_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relationships between entities
CREATE TABLE entity_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID REFERENCES file_uploads(id) ON DELETE CASCADE,
  source_entity_id UUID REFERENCES document_entities(id) ON DELETE CASCADE,
  target_entity_id UUID REFERENCES document_entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- "drives", "loves", "works_at", etc.
  evidence_chunk_ids UUID[], -- Chunks that support this relationship
  confidence REAL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Entity mentions in chunks (for fast lookup)
CREATE TABLE entity_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID REFERENCES document_entities(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES file_chunks(id) ON DELETE CASCADE,
  mention_text TEXT,
  context TEXT, -- Surrounding text
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_entities_file ON document_entities(file_id);
CREATE INDEX idx_entities_name ON document_entities(name);
CREATE INDEX idx_relationships_source ON entity_relationships(source_entity_id);
CREATE INDEX idx_relationships_target ON entity_relationships(target_entity_id);
CREATE INDEX idx_mentions_entity ON entity_mentions(entity_id);
CREATE INDEX idx_mentions_chunk ON entity_mentions(chunk_id);
```

### TypeScript Types

```typescript
interface DocumentEntity {
  id: string;
  fileId: string;
  name: string;
  entityType: 'character' | 'location' | 'object' | 'event' | 'organization';
  aliases: string[];
  description?: string;
  firstMentionChunk: number;
  mentionCount: number;
}

interface EntityRelationship {
  id: string;
  fileId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  evidenceChunkIds: string[];
  confidence: number;
}

interface EntityMention {
  entityId: string;
  chunkId: string;
  mentionText: string;
  context: string;
}
```

### Entity Extraction (during upload)

```typescript
// src/lib/entities/extractor.ts
export async function extractEntities(
  chunks: Chunk[],
  fileId: string
): Promise<{ entities: DocumentEntity[], relationships: EntityRelationship[] }> {
  // Use LLM to extract entities from each chunk
  // Batch process to reduce API calls
  // Deduplicate entities across chunks
  // Identify relationships between entities
}
```

**LLM Prompt for Entity Extraction**:
```
Extract all named entities and their relationships from this text chunk.

For each entity, provide:
- name: The primary name used
- type: character, location, object, event, or organization
- aliases: Other names/references to the same entity

For each relationship, provide:
- source: Entity name
- target: Entity name
- type: The relationship (e.g., "drives", "loves", "located_in", "owns")

Text:
{chunk_content}

Return as JSON.
```

### Query Expansion (at query time)

```typescript
// src/lib/retrieval/entity-search.ts
export async function expandQueryWithEntities(
  query: string,
  fileIds: string[]
): Promise<string[]> {
  // 1. Extract entities mentioned in query
  const queryEntities = await extractEntitiesFromQuery(query);

  // 2. Find related entities from database
  const relatedEntities = await findRelatedEntities(queryEntities, fileIds);

  // 3. Get chunks mentioning any of these entities
  const entityChunkIds = await getChunksForEntities([...queryEntities, ...relatedEntities]);

  return entityChunkIds;
}

export async function hybridEntitySearch(
  query: string,
  fileIds: string[],
  topK: number
): Promise<RetrievedChunk[]> {
  // Run in parallel
  const [semanticResults, entityChunkIds] = await Promise.all([
    semanticSearch(query, fileIds, topK),
    expandQueryWithEntities(query, fileIds)
  ]);

  // Boost chunks that match both semantic AND entity criteria
  // ...
}
```

### UI Changes

1. **Upload screen**: "Enable Deep Analysis" checkbox for narratives
2. **File list**: Badge showing "Entities extracted" status
3. **Query results**: Show related entities found
4. **Entity viewer** (optional): Visualize character relationships

### Implementation Steps

1. ✅ Add database migration for entity tables
2. ✅ Create entity extraction module (`src/lib/entities/`)
3. ✅ Add extraction to upload processing pipeline (optional step)
4. ✅ Implement query expansion with entities
5. ✅ Update search to use entity-boosted results
6. ✅ Add UI controls for enabling/viewing entities

### Files Created/Modified

| File | Description |
|------|-------------|
| `supabase/migrations/003_add_entity_tables.sql` | Database migration for entity tables |
| `src/lib/entities/prompts.ts` | LLM prompts for entity extraction |
| `src/lib/entities/storage.ts` | Database operations for entities |
| `src/lib/entities/extractor.ts` | Main extraction logic |
| `src/lib/entities/entity-search.ts` | Query-time entity expansion |
| `src/lib/entities/index.ts` | Module exports |
| `src/app/api/files/[id]/entities/route.ts` | API endpoint for entity toggle |
| `src/lib/retrieval/semantic-search.ts` | Added `entityBoostedSearch()` |
| `src/app/api/files/query/route.ts` | Updated to use entity-boosted search |
| `src/app/api/files/route.ts` | Added entity fields to file list |
| `src/lib/types.ts` | Added entity types |
| `src/components/FileList.tsx` | Added entity toggle button |
| `src/components/DocsApp.tsx` | Added entity toggle handler |

### How It Works

1. **Upload Time (Optional)**: User clicks lightning bolt icon to enable "Deep Analysis"
2. **Entity Extraction**: LLM extracts characters, locations, objects, events, organizations
3. **Relationship Mapping**: Relationships like "Tom drives yellow car" are stored
4. **Query Time**: Query entities are extracted and related entities found via graph traversal
5. **Boosted Search**: Chunks mentioning relevant entities get similarity boost

### Cost Considerations

- Entity extraction uses LLM calls (~1 call per chunk batch)
- Only run for documents that benefit (narratives, legal)
- Can be disabled per-document
- One-time cost at upload, not per-query

---

## Proposed Features

### 1. Multi-Turn Conversations

**Objective**: Maintain conversation history for follow-up questions.

**Implementation**:
- Store conversation sessions in database
- Include previous Q&A pairs in context
- Implement coreference resolution
- Add "New conversation" button

**Database schema**:
```sql
CREATE TABLE conversation_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  file_ids UUID[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES conversation_sessions(id),
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  sources JSONB,
  created_at TIMESTAMPTZ
);
```

### 2. DOCX Support

**Objective**: Support Microsoft Word documents.

**Implementation**:
- Use `mammoth` library for extraction
- Preserve heading structure
- Extract tables as structured text
- Handle embedded images (OCR optional)

**Dependencies**:
```json
{
  "mammoth": "^1.6.0"
}
```

### 3. Document Comparison Mode

**Objective**: Compare information across multiple documents.

**Implementation**:
- New query mode: "compare"
- Specialized prompts for comparison
- Side-by-side source display
- Highlight similarities and differences

**UI changes**:
- Comparison toggle in query input
- Split-view result display
- Source grouping by document

### 4. Query Analytics

**Objective**: Track usage patterns and retrieval quality.

**Implementation**:
- Log all queries with timestamps
- Track retrieval precision (user feedback)
- Monitor token usage per query
- Dashboard for analytics

**Database schema**:
```sql
CREATE TABLE query_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  query TEXT NOT NULL,
  mode TEXT NOT NULL,
  file_ids UUID[],
  chunk_count INTEGER,
  tokens_used INTEGER,
  response_time_ms INTEGER,
  user_feedback INTEGER, -- 1-5 rating
  created_at TIMESTAMPTZ
);
```

### 5. Document Summarization

**Objective**: Generate document summaries on upload.

**Implementation**:
- Automatic summarization during processing
- Store summary in `file_uploads` table
- Display summary in file list
- Use summary for multi-document overview

### 6. Re-enable Streaming

**Objective**: Re-enable SSE streaming after fixing issues.

**Implementation**:
- Debug thinking model streaming behavior
- Test with various query types
- Add proper error handling for stream failures

### 7. Export Functionality

**Objective**: Export Q&A sessions to various formats.

**Implementation**:
- Export to PDF with citations
- Export to Markdown
- Export to JSON for API integration
- Include source snippets optionally

---

## Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| **Progressive HybridRAG** | **Very High** | **High** | **P0** |
| DOCX Support | High | Low | P1 |
| Multi-Turn Conversations | High | Medium | P1 |
| Document Summarization | Medium | Low | P2 |
| Query Analytics | Medium | Medium | P2 |
| Re-enable Streaming | Medium | Low | P2 |
| Document Comparison | Medium | High | P3 |
| Export Functionality | Medium | Medium | P3 |

---

## Technical Debt to Address

1. **Test coverage**: Add integration tests for entity extraction
2. **Error handling**: Improve error messages for failed uploads
3. **Performance**: Add query timing metrics
4. **Security**: Rate limiting on query endpoint
5. **Monitoring**: Add structured logging
6. **Streaming**: Debug and re-enable SSE streaming

---

## Research References

- [GraphRAG (Microsoft)](https://github.com/microsoft/graphrag) - Full graph-based RAG
- [LightRAG](https://github.com/HKUDS/LightRAG) - Lightweight alternative
- [nano-graphrag](https://github.com/gusye1234/nano-graphrag) - Minimal implementation
- [MultiHop-RAG Benchmark](https://openreview.net/forum?id=t4eB3zYWBK) - Evaluation dataset
- [Neo4j GraphRAG Tools](https://neo4j.com/blog/news/graphrag-ecosystem-tools/) - Ecosystem overview
