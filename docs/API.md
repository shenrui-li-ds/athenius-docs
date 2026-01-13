# Athenius Docs API Documentation

External API for Athenius Search integration. All endpoints require authentication.

## Base URL

```
Production: https://docs.athenius.ai
Development: http://localhost:3001
```

All endpoints are prefixed with `/api/v1`. Set `DOCS_API_URL` to the base URL (without `/api/v1`).

## Authentication

All requests must include:

| Header | Description |
|--------|-------------|
| `Authorization` | `Bearer <ATHENIUS_API_KEY>` |
| `X-User-ID` | User's Supabase UUID |

### Example Request

```bash
curl -X GET "https://docs.athenius.ai/api/v1/files" \
  -H "Authorization: Bearer your-api-key" \
  -H "X-User-ID: 123e4567-e89b-12d3-a456-426614174000"
```

### Error Responses

| Status | Description |
|--------|-------------|
| 401 | Missing or invalid API key |
| 400 | Missing or invalid X-User-ID |
| 503 | API key not configured on server |

---

## Endpoints

### List Files

List all files for a user.

```
GET /api/v1/files
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | - | Filter by status: `pending`, `processing`, `ready`, `error` |
| `limit` | integer | 50 | Max files to return (1-100) |
| `offset` | integer | 0 | Pagination offset |

**Response:**

```json
{
  "files": [
    {
      "id": "uuid",
      "filename": "document.pdf",
      "original_filename": "My Document.pdf",
      "file_type": "pdf",
      "file_size": 1048576,
      "status": "ready",
      "chunk_count": 42,
      "created_at": "2025-01-12T10:00:00Z",
      "expires_at": "2025-01-13T10:00:00Z",
      "entities_enabled": true,
      "entities_status": "ready",
      "entities_progress": 100
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

---

### Upload File

Upload a document for processing.

```
POST /api/v1/files
```

**Request:**

- Content-Type: `multipart/form-data`
- Body: `file` field with the document

**Supported File Types:**

| Type | Extensions | Max Size |
|------|------------|----------|
| PDF | `.pdf` | 10MB |
| Text | `.txt` | 10MB |
| Markdown | `.md` | 10MB |

**Example:**

```bash
curl -X POST "https://docs.athenius.ai/api/v1/files" \
  -H "Authorization: Bearer your-api-key" \
  -H "X-User-ID: user-uuid" \
  -F "file=@document.pdf"
```

**Response:**

```json
{
  "fileId": "uuid",
  "filename": "document.pdf",
  "originalFilename": "My Document.pdf",
  "fileType": "pdf",
  "fileSize": 1048576,
  "status": "pending",
  "message": "File uploaded, processing started"
}
```

**Notes:**
- File processing happens asynchronously
- Poll `GET /api/v1/files/{id}` to check processing status
- Status transitions: `pending` → `processing` → `ready`

---

### Get File Details

Get details for a specific file.

```
GET /api/v1/files/{id}
```

**Response:**

```json
{
  "file": {
    "id": "uuid",
    "filename": "document.pdf",
    "original_filename": "My Document.pdf",
    "file_type": "pdf",
    "file_size": 1048576,
    "status": "ready",
    "chunk_count": 42,
    "created_at": "2025-01-12T10:00:00Z",
    "expires_at": "2025-01-13T10:00:00Z",
    "entities_enabled": false,
    "entities_status": null,
    "entities_progress": null,
    "error_message": null
  }
}
```

---

### Delete File

Delete a file and all associated data.

```
DELETE /api/v1/files/{id}
```

**Response:**

```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

---

### Query Documents

Query user's documents with natural language.

```
POST /api/v1/files/query
```

**Request Body:**

```json
{
  "query": "What is the main theme of the document?",
  "fileIds": ["uuid-1", "uuid-2"],
  "mode": "simple",
  "stream": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Natural language question |
| `fileIds` | string[] | Yes | Array of file UUIDs to search |
| `mode` | string | No | `simple` (default), `detailed`, or `deep` |
| `stream` | boolean | No | Enable SSE streaming (default: false) |

**Query Modes:**

| Mode | Description |
|------|-------------|
| `simple` | Concise 2-3 paragraph response |
| `detailed` | Thorough analysis with multiple sections |
| `deep` | Uses entity extraction for multi-hop reasoning |

**Non-Streaming Response:**

```json
{
  "content": "The main theme of the document is...",
  "sources": [
    {
      "id": "chunk-uuid",
      "title": "document.pdf, Page 5",
      "url": "#page=5",
      "snippet": "Relevant excerpt...",
      "content": "Full chunk content..."
    }
  ]
}
```

**Streaming Response (stream: true):**

Returns Server-Sent Events (SSE):

```
data: {"type":"sources","sources":[...]}

data: {"type":"token","content":"The"}

data: {"type":"token","content":" main"}

data: {"type":"token","content":" theme"}

data: {"type":"done"}
```

**Event Types:**

| Type | Description |
|------|-------------|
| `sources` | Retrieved source chunks (sent first) |
| `token` | Single token of generated content |
| `done` | Stream complete |
| `error` | Error occurred |

---

### Get Entity Status

Get entity extraction status and statistics.

```
GET /api/v1/files/{id}/entities
```

**Response:**

```json
{
  "fileId": "uuid",
  "entitiesEnabled": true,
  "entitiesStatus": "ready",
  "entitiesProgress": 100,
  "stats": {
    "entityCount": 156,
    "relationshipCount": 89,
    "entityTypes": {
      "character": 45,
      "location": 32,
      "object": 28,
      "event": 31,
      "organization": 20
    }
  }
}
```

**Entity Status Values:**

| Status | Description |
|--------|-------------|
| `null` | Not enabled |
| `pending` | Queued for extraction |
| `processing` | Extraction in progress |
| `ready` | Extraction complete |
| `error` | Extraction failed |

---

### Enable Entity Extraction

Start entity extraction for a file (Deep Analysis).

```
POST /api/v1/files/{id}/entities
```

**Response:**

```json
{
  "success": true,
  "message": "Entity extraction started",
  "status": "processing"
}
```

**Notes:**
- File must have `status: ready` before enabling entities
- Extraction runs asynchronously
- Poll `GET /api/v1/files/{id}/entities` to check progress
- `entitiesProgress` shows percentage (0-100)

---

### Disable Entity Extraction

Remove extracted entities from a file.

```
DELETE /api/v1/files/{id}/entities
```

**Response:**

```json
{
  "success": true,
  "message": "Entity extraction disabled"
}
```

---

## Error Handling

All error responses follow this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**

| Status | Description |
|--------|-------------|
| 200 | Success |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (invalid API key) |
| 404 | Resource not found |
| 500 | Internal server error |
| 503 | Service unavailable (API not configured) |

---

## Rate Limits

Currently no rate limits are enforced. This may change in the future.

---

## File Retention

Files are automatically deleted after **24 hours** from upload. The `expires_at` field in file responses indicates the exact expiration time.

**Important:**
- Files cannot be extended or renewed
- Re-upload the file if you need it after expiration
- Entity extraction data is deleted along with the file
- Deletion is permanent and cannot be recovered

---

## Retry & Backoff Guidance

For robust integrations, implement retry logic with exponential backoff:

| Status Code | Retry? | Guidance |
|-------------|--------|----------|
| 400 | No | Fix request parameters |
| 401 | No | Check API key and X-User-ID |
| 404 | No | Resource doesn't exist |
| 429 | Yes | Rate limited (future) - back off |
| 500 | Yes | Server error - retry with backoff |
| 503 | Yes | Service unavailable - retry with backoff |

**Recommended backoff strategy:**

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    // Don't retry client errors (4xx except 429)
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      return response;
    }

    // Success or last attempt
    if (response.ok || attempt === maxRetries) {
      return response;
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, attempt) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  throw new Error('Max retries exceeded');
}
```

**Processing status polling:**

When waiting for file processing or entity extraction, poll with reasonable intervals:

```typescript
async function waitForProcessing(fileId: string, userId: string): Promise<void> {
  const maxAttempts = 60; // 5 minutes max
  const pollInterval = 5000; // 5 seconds

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${DOCS_API_URL}/api/v1/files/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${ATHENIUS_API_KEY}`,
        'X-User-ID': userId,
      },
    });

    const { file } = await response.json();

    if (file.status === 'ready') return;
    if (file.status === 'error') throw new Error(file.error_message);

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Processing timeout');
}
```

---

## Webhooks (Future)

Webhook support for async notifications is planned but not yet implemented.

---

## Code Examples

### JavaScript/TypeScript

```typescript
const DOCS_API_URL = process.env.DOCS_API_URL;
const ATHENIUS_API_KEY = process.env.ATHENIUS_API_KEY;

async function queryDocs(userId: string, query: string, fileIds: string[]) {
  const response = await fetch(`${DOCS_API_URL}/api/v1/files/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ATHENIUS_API_KEY}`,
      'X-User-ID': userId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      fileIds,
      mode: 'simple',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}
```

### Streaming Example

```typescript
async function queryDocsStreaming(
  userId: string,
  query: string,
  fileIds: string[],
  onToken: (token: string) => void,
  onSources: (sources: Source[]) => void
) {
  const response = await fetch(`${DOCS_API_URL}/api/v1/files/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ATHENIUS_API_KEY}`,
      'X-User-ID': userId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      fileIds,
      mode: 'simple',
      stream: true,
    }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));

        if (event.type === 'sources') {
          onSources(event.sources);
        } else if (event.type === 'token') {
          onToken(event.content);
        }
      }
    }
  }
}
```

### File Upload Example

```typescript
async function uploadFile(userId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${DOCS_API_URL}/api/v1/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ATHENIUS_API_KEY}`,
      'X-User-ID': userId,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}
```
