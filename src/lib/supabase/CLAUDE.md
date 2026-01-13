# Supabase Integration Layer

Database and storage operations for Athenius Docs using Supabase.

## Overview

This module provides Supabase client initialization and file storage operations.

## Files

| File | Purpose |
|------|---------|
| `client.ts` | Browser-side Supabase client |
| `server.ts` | Server-side clients (regular + admin) |
| `storage.ts` | File storage operations |

## Client Types

### Regular Client (`createClient`)

- Uses **anon key**
- Respects **RLS policies**
- Requires user authentication via cookies
- Use in: API routes with user context

### Admin Client (`createAdminClient`)

- Uses **service role key**
- **Bypasses all RLS**
- No cookie handling
- Use in: Background processing, server operations

```typescript
// User-context operations
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

// Admin operations (bypass RLS)
const supabase = createAdminClient();
await supabase.from('file_uploads').select('*'); // All users' data!
```

## Storage Structure

```
Bucket: documents
Path:   {user_id}/{file_id}/{filename}

Example: abc123/def456/report.pdf
```

## Storage Functions

| Function | Purpose |
|----------|---------|
| `uploadFile(userId, fileId, filename, buffer, contentType)` | Upload to storage |
| `downloadFile(storagePath)` | Download as Buffer |
| `deleteFile(storagePath)` | Remove from storage |
| `getSignedUrl(storagePath, expiresIn)` | Temporary access URL |
| `fileExists(storagePath)` | Check if file exists |
| `getStoragePath(userId, fileId, filename)` | Generate storage path |

## Database Tables

### file_uploads
```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES auth.users
filename        TEXT
original_filename TEXT
file_type       TEXT (pdf, txt, md)
file_size       BIGINT
storage_path    TEXT
status          TEXT (pending, processing, ready, error)
error_message   TEXT
chunk_count     INT
created_at      TIMESTAMPTZ
expires_at      TIMESTAMPTZ
entities_enabled BOOLEAN
entities_status  TEXT
entities_progress INT
```

### file_chunks
```sql
id              UUID PRIMARY KEY
file_id         UUID REFERENCES file_uploads ON DELETE CASCADE
user_id         UUID REFERENCES auth.users
chunk_index     INT
content         TEXT
token_count     INT
page_number     INT
section_title   TEXT
embedding       VECTOR(768)
created_at      TIMESTAMPTZ
```

### Entity Tables (Phase 3)
- `document_entities` - Extracted entities
- `entity_relationships` - Entity connections
- `entity_mentions` - Entity-chunk links

## RLS Considerations

**With Regular Client:**
- Users can only access their own files
- RLS policies enforce `user_id = auth.uid()`

**With Admin Client:**
- No RLS restrictions
- Must manually filter by user_id
- Used when `auth.uid()` not available (service role)

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh...  # Server-only, never expose!
```

## Important Notes

1. **Service Role Key**: Never expose to client, only use server-side
2. **Admin Client**: Be careful, bypasses all security policies
3. **Storage Bucket**: Must be created in Supabase dashboard
4. **RLS Policies**: Must be configured for each table
5. **Cascade Delete**: file_chunks cascade on file_uploads delete
