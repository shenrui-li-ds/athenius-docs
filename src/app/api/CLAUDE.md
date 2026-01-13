# API Routes

HTTP API endpoints for Athenius Docs, providing both internal (web UI) and external (Athenius Search) access.

## Route Structure

```
/api/
├── files/                    # Internal API (web UI)
│   ├── route.ts             # GET (list files)
│   ├── upload/route.ts      # POST (upload file)
│   ├── query/route.ts       # POST (query documents)
│   └── [id]/
│       ├── route.ts         # GET/DELETE (file details)
│       ├── status/route.ts  # GET (processing status)
│       └── entities/route.ts # GET/POST/DELETE (entity extraction)
│
└── v1/files/                 # External API (Athenius Search)
    ├── route.ts             # GET/POST (list/upload)
    ├── query/route.ts       # POST (query with streaming)
    └── [id]/
        ├── route.ts         # GET/DELETE (file details)
        └── entities/route.ts # GET/POST/DELETE (entities)
```

## Authentication

### Internal API (`/api/files/*`)

Uses Supabase Auth session from cookies:

```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return 401;
```

### External API (`/api/v1/files/*`)

Uses API key + User ID headers:

```typescript
// Required headers
Authorization: Bearer <ATHENIUS_API_KEY>
X-User-ID: <supabase-user-uuid>

// Validation
const auth = validateApiAuth(request);
if (!auth.success) return apiAuthError(auth);
const { userId } = auth;
```

## Endpoint Reference

### Internal API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/files` | GET | List user's files |
| `/api/files/upload` | POST | Upload file (multipart) |
| `/api/files/query` | POST | Query documents |
| `/api/files/[id]` | GET | Get file details |
| `/api/files/[id]` | DELETE | Delete file |
| `/api/files/[id]/status` | GET | Get processing status |
| `/api/files/[id]/entities` | GET | Get entity status |
| `/api/files/[id]/entities` | POST | Enable entity extraction |
| `/api/files/[id]/entities` | DELETE | Disable entity extraction |

### External API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/files` | GET | List files (paginated) |
| `/api/v1/files` | POST | Upload file |
| `/api/v1/files/[id]` | GET | Get file details |
| `/api/v1/files/[id]` | DELETE | Delete file |
| `/api/v1/files/query` | POST | Query (streaming supported) |
| `/api/v1/files/[id]/entities` | GET | Get entity status/stats |
| `/api/v1/files/[id]/entities` | POST | Start entity extraction |
| `/api/v1/files/[id]/entities` | DELETE | Remove entities |

## Streaming Response

Query endpoints support Server-Sent Events (SSE):

```typescript
// Request
POST /api/v1/files/query
Content-Type: application/json
{ "query": "...", "fileIds": [...], "stream": true }

// Response (SSE)
data: {"type":"sources","sources":[...]}
data: {"type":"token","content":"The"}
data: {"type":"token","content":" answer"}
data: {"type":"done"}
```

## Query Parameters

### List Files (`GET /api/v1/files`)
- `status` - Filter by status (pending, processing, ready, error)
- `limit` - Max files (default 50, max 100)
- `offset` - Pagination offset

### Query Documents (`POST /api/v1/files/query`)
```json
{
  "query": "What is the revenue?",
  "fileIds": ["uuid-1", "uuid-2"],
  "mode": "simple",  // simple | detailed | deep
  "stream": false    // Enable SSE streaming
}
```

## File Upload

```bash
# Internal API
curl -X POST /api/files/upload \
  -F "file=@document.pdf"

# External API
curl -X POST /api/v1/files \
  -H "Authorization: Bearer <key>" \
  -H "X-User-ID: <uuid>" \
  -F "file=@document.pdf"
```

**Supported Types**: PDF, TXT, MD
**Max Size**: 10MB

## Background Processing

File processing runs asynchronously:

```typescript
// In upload route
processFile(fileId).catch(err => {
  console.error(`Background processing failed: ${err}`);
});
return NextResponse.json({ fileId, status: 'pending' });
```

Entity extraction also runs in background:

```typescript
enableEntityExtraction(fileId, userId).catch(err => {
  console.error(`Entity extraction failed: ${err}`);
});
return NextResponse.json({ status: 'processing' });
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Description of what went wrong"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (missing/invalid auth) |
| 404 | Resource not found |
| 500 | Internal server error |
| 503 | API not configured |

## Important Notes

1. **Admin Client**: External API uses `createAdminClient()` with user_id filtering
2. **RLS Bypass**: External API bypasses RLS since service role has no auth.uid()
3. **File Ownership**: Always verify `user_id` matches for external API
4. **Streaming**: Only query endpoint supports streaming
5. **Entity Status**: Must be `ready` before querying with `deep` mode benefits

## See Also

- [API.md](../../../../API.md) - Full external API documentation
- [lib/api/auth.ts](../../lib/api/auth.ts) - API key validation
