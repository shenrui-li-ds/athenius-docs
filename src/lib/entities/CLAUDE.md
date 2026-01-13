# Entity Extraction System

LLM-powered entity extraction and knowledge graph construction for Progressive HybridRAG (Deep Analysis mode).

## Overview

This module extracts named entities, relationships, and mentions from document chunks using Gemini LLM, enabling entity-boosted search for better multi-hop reasoning.

## Architecture

```
Document Chunks
      │
      ▼
┌─────────────────┐
│   extractor.ts  │  ← LLM-based entity extraction
│                 │    (parallel batch processing)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   storage.ts    │  ← Database operations with deduplication
│                 │    (entities, relationships, mentions)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ entity-search.ts│  ← Query expansion and graph traversal
│                 │    (find related entities/chunks)
└─────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `extractor.ts` | LLM extraction with parallel batch processing |
| `storage.ts` | Database operations and deduplication |
| `entity-search.ts` | Query expansion and graph traversal |
| `prompts.ts` | LLM prompts for entity extraction |
| `index.ts` | Public exports |

## Key Concepts

### Entity Types
- `character` - People, named individuals
- `location` - Places, geographic entities
- `object` - Important items, artifacts
- `event` - Named events, occurrences
- `organization` - Companies, groups, institutions

### Database Tables
```
document_entities     entity_relationships     entity_mentions
┌─────────────────┐   ┌────────────────────┐   ┌────────────────┐
│ id              │   │ source_entity_id   │   │ entity_id      │
│ file_id         │   │ target_entity_id   │   │ chunk_id       │
│ name            │   │ relationship_type  │   │ mention_text   │
│ entity_type     │   │ evidence_chunk_ids │   │ context        │
│ aliases[]       │   │ confidence         │   └────────────────┘
│ mention_count   │   └────────────────────┘
└─────────────────┘
```

## Processing Pipeline

### 1. Batch Extraction (extractor.ts)

```typescript
// Configuration
BATCH_SIZE = 3        // Chunks per LLM call (avoid token limits)
PARALLEL_BATCHES = 8  // Concurrent LLM calls (Gemini handles well)
MAX_RETRIES = 2       // Retry on failure
```

**Flow:**
1. Get all chunks for file
2. Delete existing entities (for reprocessing)
3. Split chunks into batches of 3
4. Process 8 batches in parallel
5. Store results sequentially (avoid race conditions)
6. Update progress after each parallel group

### 2. Deduplication (storage.ts)

Entities are deduplicated by name OR alias within a file:

```sql
-- Check for existing entity
.or(`name.ilike.${entity.name},aliases.cs.{${entity.name.toLowerCase()}}`)
```

If entity exists:
- Increment `mention_count`
- Merge aliases (case-insensitive)

### 3. Query Expansion (entity-search.ts)

```
User Query → Extract Entity Names → Find in Database
                                          │
                                          ▼
                               Get Related Entities (1-hop)
                                          │
                                          ▼
                               Get Chunks Mentioning Entities
                                          │
                                          ▼
                               Boost These Chunks in Search
```

## RPC Functions Required

```sql
-- Find entities by name or alias
find_entities_by_name(search_name, file_ids)

-- Get related entities via relationships
get_related_entities(entity_ids, max_depth)

-- Get chunks mentioning entities
get_chunks_for_entities(entity_ids)
```

## Usage Examples

### Enable Entity Extraction
```typescript
import { enableEntityExtraction } from '@/lib/entities';

// Starts background processing with progress tracking
await enableEntityExtraction(fileId, userId);
```

### Query with Entity Boosting
```typescript
import { expandQueryWithEntities } from '@/lib/entities';

// Returns entity chunk IDs to boost in search
const expansion = await expandQueryWithEntities(query, fileIds);
// expansion.entityChunkIds - chunks to boost
// expansion.queryEntities - entities found in query
// expansion.relatedEntities - related via graph
```

### Check Extraction Status
```typescript
import { hasEntityExtraction } from '@/lib/entities';

const ready = await hasEntityExtraction(fileId);
// true if entities_enabled=true AND entities_status='ready'
```

## Error Handling

- **File Deleted Mid-Extraction**: Checked before each parallel group
- **LLM Failures**: Retry with exponential backoff (1s, 2s delays)
- **Invalid Entities**: Validated and sanitized before storage
- **Missing Relationships**: Skipped with warning log

## Performance Considerations

1. **Parallel Processing**: 8 concurrent LLM calls reduces extraction time
2. **Sequential Storage**: Prevents race conditions on entity map
3. **Progress Updates**: After each parallel group (not each batch)
4. **Batch Size**: 3 chunks balances token limits vs. LLM calls

## Key Functions

| Function | Purpose |
|----------|---------|
| `extractEntitiesFromFile` | Main extraction orchestrator |
| `extractEntitiesFromQuery` | Extract entity names from user query |
| `expandQueryWithEntities` | Full query expansion pipeline |
| `storeEntities` | Insert/update with deduplication |
| `storeRelationships` | Store with evidence tracking |
| `storeMentions` | Link entities to chunks |
| `anyFileHasEntities` | Check if files have ready entities |
| `getFileEntityStats` | Count entities/relationships |

## Important Notes

- **Admin Client**: All operations use `createAdminClient()` to bypass RLS
- **Mention Detection**: Simple substring matching (case-insensitive)
- **Alias Merging**: Preserves original case, deduplicates case-insensitively
- **Evidence Chunks**: Relationships track which chunks contain evidence
- **Graph Depth**: Currently single-hop (max_depth=1) for related entities
