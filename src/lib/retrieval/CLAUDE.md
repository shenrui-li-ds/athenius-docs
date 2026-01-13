# Hybrid Search System

Multi-method retrieval combining semantic search, keyword search, and entity-boosted search for Progressive HybridRAG.

## Overview

This module provides four search methods:
1. **Semantic Search** - Vector similarity via embeddings
2. **Keyword Search** - PostgreSQL full-text search
3. **Hybrid Search** - RRF fusion of semantic + keyword
4. **Entity-Boosted Search** - Semantic + entity graph expansion

## Search Method Selection

```
Query arrives
     │
     ├─── Any files have entities ready? ───► NO ──► Semantic Search
     │
     └─── YES
           │
           ▼
    Entity-Boosted Search
    (uses semantic + entity graph)
```

## Configuration

```typescript
DEFAULT_TOP_K = 10              // Results per search
ENTITY_BOOST_FACTOR = 0.15      // Boost for entity matches

DEFAULT_HYBRID_CONFIG = {
  semanticWeight: 0.8,          // 80% semantic priority
  keywordWeight: 0.2,           // 20% keyword
  rrf_k: 60,                    // RRF smoothing constant
}
```

## Search Methods

### 1. Semantic Search

```
Query → Embed (Gemini) → Vector Similarity → Top K
```

Uses admin client with direct file_id filtering (bypasses RLS since service role doesn't have auth.uid()).

**Fallback Path**: If RPC `search_file_chunks` unavailable, fetches all chunks and calculates cosine similarity in JavaScript.

### 2. Keyword Search

```
Query → PostgreSQL FTS → BM25 Ranking → Top K
```

Uses RPC function `keyword_search_chunks` with `to_tsvector` / `plainto_tsquery`.

### 3. Hybrid Search (RRF)

Reciprocal Rank Fusion combines two result lists:

```
RRF Score(d) = Σ weight_i × (1 / (k + rank_i))

where:
  k = 60 (smoothing constant)
  weight_semantic = 0.8
  weight_keyword = 0.2
```

**Process:**
1. Run semantic search (2× topK candidates)
2. Run keyword search (2× topK candidates)
3. Merge by chunk ID
4. Calculate RRF score for each
5. Sort by RRF score, return topK

**Retrieval Method Tagging:**
- `semantic` - Found only in semantic results
- `keyword` - Found only in keyword results
- `hybrid` - Found in both

### 4. Entity-Boosted Search

```
Query
  │
  ├─► Semantic Search (2× topK)
  │
  └─► Entity Expansion:
        1. Extract entity names from query (LLM)
        2. Find matching entities in DB
        3. Get related entities (1-hop graph)
        4. Get chunks mentioning entities
              │
              ▼
      Merge & Boost:
        - Chunks in entity set: similarity += 0.15
        - Entity-only chunks: base similarity = 0.5
              │
              ▼
      Re-sort by boosted similarity
```

## RPC Functions Required

```sql
-- Vector similarity search
search_file_chunks(query_embedding, file_ids, match_count)

-- Full-text keyword search
keyword_search_chunks(search_query, file_ids, match_count)

-- Entity search (in entities module)
find_entities_by_name, get_related_entities, get_chunks_for_entities
```

## Output Format

```typescript
interface RetrievedChunk {
  id: string;
  content: string;
  filename: string;
  fileId: string;
  page?: number;
  section?: string;
  similarity: number;
  keywordScore?: number;
  combinedScore?: number;
  retrievalMethod?: 'semantic' | 'keyword' | 'hybrid';
}
```

## Context Assembly

`assembleContext()` formats chunks for LLM with citations:

```
[Source: report.pdf, Page 5, Section: "Introduction", Chunk 3]
The revenue increased by 20% this quarter...

[Source: data.txt]
Additional information about quarterly results...
```

**Token Budget**: Default 8000 tokens (~32K chars). Stops adding chunks when budget exceeded.

## Key Functions

| Function | Purpose |
|----------|---------|
| `semanticSearch()` | Vector similarity search |
| `keywordSearch()` | PostgreSQL FTS search |
| `hybridSearch()` | RRF fusion search |
| `entityBoostedSearch()` | Entity-aware search (main entry) |
| `assembleContext()` | Format chunks for LLM |
| `cosineSimilarity()` | Vector similarity calculation |

## Performance Notes

1. **Parallel Execution**: Semantic and keyword/entity searches run in parallel
2. **Candidate Expansion**: Fetch 2× topK for RRF/boosting, then trim
3. **Fallback Efficiency**: JS-based similarity is slower than RPC but works
4. **Entity Overhead**: Entity expansion adds ~100-200ms for LLM call

## Tuning Guidelines

| Scenario | Adjustment |
|----------|------------|
| Exact term matching important | Increase keywordWeight |
| Semantic understanding key | Default weights (0.8/0.2) |
| Entity-rich documents | Enable Deep Analysis for entities |
| Short queries | Keyword may help more |
| Long queries | Semantic usually better |

## Important Notes

- **Admin Client**: All searches use `createAdminClient()` to bypass RLS
- **Embedding Dimension**: Must match stored embeddings (768 for Gemini)
- **RRF k Value**: 60 is standard, lower = more weight to top results
- **Entity Boost**: Conservative (0.15) to avoid over-boosting
