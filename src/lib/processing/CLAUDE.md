# File Processing Pipeline

Orchestrates the complete document processing workflow: extract → chunk → embed → store.

## Overview

This module coordinates the end-to-end processing of uploaded documents, triggered asynchronously after file upload.

## Pipeline Flow

```
File Upload
     │
     ▼
┌─────────────────┐
│ Update status   │ ← 'processing'
│ to processing   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Download from   │
│ Supabase Storage│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Extract content │ ← PDF/TXT/MD extraction
│ (text + pages)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Chunk document  │ ← Semantic chunking
│ (sections/paras)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate        │ ← Gemini embeddings
│ embeddings      │   (batched)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Store chunks    │ ← file_chunks table
│ in database     │   (batched: 100/insert)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Update status   │ ← 'ready' + chunk_count
│ to ready        │
└─────────────────┘
```

## Error Handling

On any failure:
1. Log error with file ID and message
2. Update status to `'error'`
3. Store error message in `error_message` column
4. Re-throw error for caller

## Key Functions

| Function | Purpose |
|----------|---------|
| `processFile(fileId)` | Main orchestrator |
| `storeChunks(supabase, file, chunks, embeddings)` | Batch insert chunks |
| `deleteFileChunks(fileId)` | Remove all chunks for file |
| `reprocessFile(fileId)` | Delete + reprocess |
| `updateFileStatus(...)` | Status/error tracking |

## Configuration

| Parameter | Value | Note |
|-----------|-------|------|
| Chunk batch size | 100 | Database inserts |
| Embedding batch | 100 | Gemini API calls |

## Status Transitions

```
pending → processing → ready
              │
              └─────→ error
```

## Usage

```typescript
import { processFile, reprocessFile } from '@/lib/processing/pipeline';

// Trigger processing (usually fire-and-forget)
processFile(fileId).catch(console.error);

// Reprocess existing file
await reprocessFile(fileId);
```

## Background Execution

Processing runs asynchronously after upload API returns:

```typescript
// In upload route
processFile(fileId).catch(err => {
  console.error(`Background processing failed for ${fileId}:`, err);
});
return NextResponse.json({ fileId, status: 'pending' });
```

## Data Flow

```
Input:  fileId (UUID)
Output: Chunks with embeddings stored in database

Creates: N rows in file_chunks table
Updates: file_uploads.status, .chunk_count, .error_message
```

## Important Notes

1. **Admin Client**: Uses service role to bypass RLS
2. **Idempotency**: Reprocessing deletes existing chunks first
3. **No Transactions**: Supabase doesn't support transactions in JS client
4. **Error Recovery**: Must manually reprocess on failure
5. **Memory**: Large files load entirely into memory during extraction
