# Semantic Chunking System

Intelligent document chunking that respects semantic boundaries (paragraphs, sentences, sections) for optimal RAG retrieval.

## Overview

This module splits extracted document content into chunks suitable for embedding and retrieval, preserving document structure and context.

## Configuration

```typescript
DEFAULT_CHUNKING_CONFIG = {
  targetChunkSize: 2000,  // ~500 tokens target
  maxChunkSize: 4000,     // ~1000 tokens hard limit
  overlapSize: 200,       // ~50 tokens overlap
  minChunkSize: 400,      // ~100 tokens minimum
}
```

**Token Estimation**: 1 token ≈ 4 characters (English text)

## Algorithm

### 1. Section Detection

Detects document structure via regex patterns:

| Pattern | Example | Level |
|---------|---------|-------|
| Markdown headers | `# Title`, `## Section` | 1-6 |
| Chapter/Section | `Chapter 1`, `Section 1.2` | 1-2 |
| Numbered headers | `1. Introduction`, `1.2 Methods` | 1-3 |
| ALL CAPS | `INTRODUCTION` (10+ chars) | 1 |

### 2. Paragraph Splitting

```typescript
// Split on double newlines
text.split(/\n\s*\n/)
```

### 3. Chunk Building

```
For each paragraph:
  1. Check if adding exceeds maxChunkSize
  2. Check if section changed (new section = new chunk)
  3. If overflow/section change AND has content:
     - Save current chunk
     - Start new chunk with overlap
  4. Add paragraph to current chunk
  5. If >= targetSize and not last paragraph:
     - Wait for next iteration (prefer not splitting)
     - Unless way over maxSize → split at sentences
```

### 4. Overlap Management

When starting a new chunk, include overlap from previous:

```typescript
function getOverlapContent(text, targetOverlap):
  1. Find sentence boundary near overlap point
  2. Or find paragraph break
  3. Or find word boundary
  4. Return overlap text
```

### 5. Small Chunk Merging

After chunking, merge chunks below `minChunkSize`:

```typescript
for each chunk:
  if accumulator.length < minChunkSize:
    merge with current chunk
  else:
    save accumulator, start new
```

## Flow Diagram

```
ExtractedContent
      │
      ├─── Has pages? ──► Process page by page
      │                   (preserves page numbers)
      │
      └─── No pages ───► Process entire text
                         (section detection only)
                              │
                              ▼
                    ┌─────────────────┐
                    │ detectSections  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │splitIntoParagraphs│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │chunkTextSemantic│
                    │ (build chunks)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ mergeSmallChunks│
                    │  (post-process) │
                    └─────────────────┘
```

## Output Format

```typescript
interface Chunk {
  content: string;       // Chunk text
  index: number;         // Sequential index
  pageNumber?: number;   // From PDF extraction
  sectionTitle?: string; // Detected section header
  tokenCount: number;    // Estimated tokens
}
```

## Key Functions

| Function | Purpose |
|----------|---------|
| `chunkDocument(content, config)` | Main entry point |
| `detectSections(text)` | Find headers/structure |
| `splitIntoParagraphs(text)` | Paragraph-aware splitting |
| `chunkTextSemantic()` | Core chunking algorithm |
| `splitLargeParagraph()` | Handle oversized paragraphs |
| `mergeSmallChunks()` | Post-process tiny chunks |
| `estimateTokenCount(text)` | Approximate token count |

## Edge Cases

1. **No paragraphs**: Entire text becomes one chunk (if under max)
2. **Giant paragraph**: Split at sentence boundaries
3. **No sentences**: Fall back to character limit
4. **Empty content**: Returns empty array
5. **Section change**: Always starts new chunk
6. **Page boundaries**: Preserved from extraction

## Usage

```typescript
import { chunkDocument } from '@/lib/chunking';

const chunks = chunkDocument(extractedContent, {
  targetChunkSize: 2000,
  maxChunkSize: 4000,
  overlapSize: 200,
  minChunkSize: 400,
});
```

## Tuning Guidelines

| Scenario | Adjustment |
|----------|------------|
| Short documents | Lower targetChunkSize |
| Technical docs | Higher overlap for context |
| Structured docs | Rely on section detection |
| Unstructured text | Lower minChunkSize |
| Long documents | Default settings work well |

## Important Notes

- **Page Numbers**: Only available for PDF files
- **Section Titles**: Best with markdown or structured docs
- **Overlap**: Creates redundancy but improves retrieval at boundaries
- **Token Estimation**: Rough approximation, actual varies by tokenizer
