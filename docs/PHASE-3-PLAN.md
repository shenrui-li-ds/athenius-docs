# Phase 3: Advanced Features (Planned)

## Overview

Advanced RAG features including multi-turn conversations, document comparison, DOCX support, and analytics.

## Status: NOT STARTED

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

### 2. Document Comparison Mode

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

### 3. DOCX Support

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

### 5. Smart Chunk Caching

**Objective**: Cache frequently accessed chunks in Redis.

**Implementation**:
- Identify hot chunks per user
- Cache embeddings and content
- TTL-based cache invalidation
- Reduce database load

### 6. Document Summarization

**Objective**: Generate document summaries on upload.

**Implementation**:
- Automatic summarization during processing
- Store summary in `file_uploads` table
- Display summary in file list
- Use summary for multi-document overview

### 7. Enhanced Citation Links

**Objective**: Deep links to specific passages.

**Implementation**:
- Generate unique chunk IDs in citations
- Expand citation to show full context
- Scroll to source in document viewer (future)

### 8. Batch Query Processing

**Objective**: Process multiple queries efficiently.

**Implementation**:
- Queue-based query processing
- Batch embedding generation
- Progress tracking for batch jobs
- Email notification on completion

### 9. Query Suggestions

**Objective**: Suggest relevant questions based on documents.

**Implementation**:
- Generate questions during processing
- Display suggestions after upload
- Learn from user query patterns

### 10. Export Functionality

**Objective**: Export Q&A sessions to various formats.

**Implementation**:
- Export to PDF with citations
- Export to Markdown
- Export to JSON for API integration
- Include source snippets optionally

## Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| DOCX Support | High | Low | P1 |
| Multi-Turn Conversations | High | Medium | P1 |
| Document Summarization | Medium | Low | P2 |
| Query Analytics | Medium | Medium | P2 |
| Document Comparison | Medium | High | P3 |
| Smart Chunk Caching | Low | Medium | P3 |
| Enhanced Citation Links | Low | Low | P3 |
| Batch Query Processing | Low | High | P4 |
| Query Suggestions | Low | Medium | P4 |
| Export Functionality | Medium | Medium | P2 |

## Technical Debt to Address

1. **Test coverage**: Add integration tests for hybrid search
2. **Error handling**: Improve error messages for failed uploads
3. **Performance**: Add query timing metrics
4. **Security**: Rate limiting on query endpoint
5. **Monitoring**: Add structured logging

## Estimated Timeline

| Feature | Estimated Effort |
|---------|-----------------|
| DOCX Support | 1-2 days |
| Multi-Turn Conversations | 3-5 days |
| Document Summarization | 1-2 days |
| Query Analytics | 2-3 days |
| Document Comparison | 3-5 days |
