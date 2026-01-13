# Embedding Generation System

Vector embedding generation using Google's Gemini embedding model.

## Overview

This module generates 768-dimensional embeddings for document chunks and queries, with built-in retry logic and batch processing.

## Configuration

```typescript
EMBEDDING_MODEL = 'gemini-embedding-001'
EMBEDDING_DIMENSIONS = 768
MAX_BATCH_SIZE = 100    // Gemini batch limit
MAX_RETRIES = 3
RETRY_DELAY = 1000      // Base delay in ms
```

## Task Types

Gemini embeddings use different task types for optimal performance:

| Task Type | Used For | Called From |
|-----------|----------|-------------|
| `RETRIEVAL_QUERY` | Search queries | `embedText()` |
| `RETRIEVAL_DOCUMENT` | Document chunks | `embedTexts()` |

## Key Functions

| Function | Purpose |
|----------|---------|
| `embedText(text)` | Single text embedding (for queries) |
| `embedTexts(texts)` | Batch embedding (for documents) |
| `cosineSimilarity(a, b)` | Vector similarity calculation |

## Batch Processing

```
Input: 250 texts
         │
         ▼
┌─────────────────┐
│  Batch 1: 100   │ → Gemini API → 100 embeddings
└─────────────────┘
┌─────────────────┐
│  Batch 2: 100   │ → Gemini API → 100 embeddings
└─────────────────┘
┌─────────────────┐
│  Batch 3: 50    │ → Gemini API → 50 embeddings
└─────────────────┘
         │
         ▼
Output: 250 embeddings
```

## Retry Logic

Exponential backoff for rate limit errors:

```
Attempt 1: Immediate
Attempt 2: Wait 1s  (1000ms)
Attempt 3: Wait 2s  (2000ms)
Attempt 4: Wait 4s  (4000ms) - only on rate limit
```

**Rate limit detection:**
- "rate limit" in error message
- "quota" in error message
- HTTP 429
- "resource_exhausted"

## Cosine Similarity

```typescript
similarity = (a · b) / (||a|| × ||b||)
```

Returns value between -1 and 1:
- 1.0 = identical
- 0.0 = orthogonal (unrelated)
- -1.0 = opposite

## Usage

```typescript
import { embedText, embedTexts, cosineSimilarity } from '@/lib/embeddings/gemini';

// Query embedding
const queryEmbed = await embedText("What is the revenue?");

// Document embeddings (batched automatically)
const docEmbeds = await embedTexts(chunkTexts);

// Similarity calculation
const sim = cosineSimilarity(queryEmbed, docEmbeds[0]);
```

## Important Notes

1. **Dimension Consistency**: All embeddings must be 768-dim for comparison
2. **Empty Input**: `embedTexts([])` returns empty array
3. **Rate Limits**: Gemini has per-minute quotas, retry handles this
4. **Task Type**: Query vs document affects embedding quality
5. **Normalization**: Gemini embeddings are pre-normalized
