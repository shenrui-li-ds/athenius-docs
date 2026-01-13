# Response Synthesis System

LLM-powered response generation from retrieved document chunks using Gemini.

## Overview

This module generates grounded, citation-accurate responses from retrieved chunks, supporting both streaming and non-streaming modes.

## Files

| File | Purpose |
|------|---------|
| `synthesizer.ts` | Response generation with streaming |
| `prompts.ts` | System prompts for different query modes |

## Query Modes

| Mode | Context Tokens | Output Tokens | Use Case |
|------|----------------|---------------|----------|
| `simple` | 6,000 | 4,096 | Quick answers, summaries |
| `detailed` | 12,000 | 8,192 | Deep analysis, comprehensive answers |
| `deep` | 12,000 | 8,192 | Same as detailed (uses entity boosting) |

## Response Flow

### Non-Streaming

```
Chunks → Assemble Context → Build Prompt → Gemini API → Format Response
                                                              │
                                                              ▼
                                                    { content, sources }
```

### Streaming (SSE)

```
Chunks → Assemble Context → Build Prompt → Gemini Streaming API
                                                    │
                                                    ▼
                                          ┌─────────────────┐
                                          │ yield: sources  │ ← First
                                          │ yield: tokens   │ ← Incremental
                                          │ yield: done     │ ← Last
                                          └─────────────────┘
```

## Stream Events

```typescript
type QueryStreamEvent =
  | { type: 'sources'; sources: Source[] }  // Sent first
  | { type: 'token'; content: string }      // Each token
  | { type: 'done' }                        // Completion
  | { type: 'error'; message: string };     // On failure
```

## Source Format (Tavily-Compatible)

```typescript
interface Source {
  id: string;          // Chunk UUID
  title: string;       // "report.pdf, Page 5 - Introduction"
  url: string;         // "file://report.pdf#page=5"
  content: string;     // Full chunk content
  snippet: string;     // First 200 chars
}
```

## Key Functions

| Function | Purpose |
|----------|---------|
| `synthesize(query, chunks, mode)` | Non-streaming response |
| `synthesizeStream(query, chunks, mode)` | AsyncGenerator for streaming |
| `chunksToSources(chunks)` | Convert to Tavily format |
| `getSystemPrompt(mode)` | Select appropriate prompt |

## Prompt Architecture

```
System Prompt (mode-specific)
├── Role definition
├── Critical grounding rules
├── Citation format instructions
└── Response structure guidelines

User Prompt
├── Query text
└── Document context with source markers
```

## Configuration

```typescript
MODEL = 'gemini-3-flash-preview'
TEMPERATURE = 0.3  // Low for focused responses
```

## Usage

### Non-Streaming
```typescript
import { synthesize } from '@/lib/generation/synthesizer';

const { content, sources } = await synthesize(query, chunks, 'simple');
```

### Streaming
```typescript
import { synthesizeStream } from '@/lib/generation/synthesizer';

for await (const event of synthesizeStream(query, chunks, 'detailed')) {
  if (event.type === 'sources') {
    setSources(event.sources);
  } else if (event.type === 'token') {
    appendContent(event.content);
  }
}
```

## Grounding Rules (from prompts.ts)

1. **ONLY** use information from provided documents
2. **Every** factual claim must cite source
3. If information not found, say so explicitly
4. **Never** use general knowledge
5. **Never** infer beyond what's written

## Important Notes

1. **Empty Chunks**: Returns "no relevant content" message
2. **Token Limit**: Context truncated to fit mode limits
3. **Citation Format**: `[filename, Page X]` or `[filename]` for no pages
4. **LaTeX Support**: Use `$...$` for inline, `$$...$$` for block math
5. **Streaming Buffer**: Handles incomplete JSON in SSE stream
