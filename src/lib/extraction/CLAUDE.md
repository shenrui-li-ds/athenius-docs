# Document Extraction System

Content extraction from uploaded documents (PDF, TXT, Markdown).

## Overview

This module extracts text content and structural information from uploaded files, preparing them for chunking and embedding.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Extraction dispatcher by file type |
| `pdf.ts` | PDF text extraction |
| `text.ts` | Plain text and Markdown extraction |

## Supported File Types

| Type | Extension | Extractor | Output |
|------|-----------|-----------|--------|
| PDF | `.pdf` | pdf-parse | Text + pages with page numbers |
| Text | `.txt` | UTF-8 decode | Text only (no pages) |
| Markdown | `.md` | UTF-8 + headers | Text + sections as "pages" |

## Output Format

```typescript
interface ExtractedContent {
  text: string;           // Full document text
  pages?: Array<{         // Optional page/section info
    pageNumber: number;
    content: string;
  }>;
}
```

## Extraction Logic

### PDF (`pdf.ts`)

```typescript
import pdf from 'pdf-parse';

// Extracts text and page boundaries
const data = await pdf(buffer);
// Returns { text, pages: [...] }
```

**Features:**
- Preserves page numbers from PDF structure
- Full text concatenated for chunking
- Page content for citation tracking

### Text Files (`text.ts`)

```typescript
const text = buffer.toString('utf-8');
return { text };  // No pages array
```

**Important:** Text files have NO page numbers. This prevents false `Page 1` citations.

### Markdown (`text.ts`)

```typescript
// Split by headers (# and ##)
const sections = splitMarkdownBySections(text);
return {
  text,
  pages: sections,  // Sections become "pages"
};
```

**Features:**
- Detects `#` and `##` headers
- Each section becomes a "page" for citation
- Content before first header = separate section
- Sequential page numbers for sections

## Key Functions

| Function | Purpose |
|----------|---------|
| `extractContent(buffer, fileType)` | Main dispatcher |
| `extractPDF(buffer)` | PDF extraction |
| `extractText(buffer)` | Plain text extraction |
| `extractMarkdown(buffer)` | Markdown with section detection |

## Usage

```typescript
import { extractContent } from '@/lib/extraction';

const content = await extractContent(buffer, 'pdf');
// content.text - full text
// content.pages - array of page objects (if applicable)
```

## Citation Implications

| File Type | Citation Format |
|-----------|-----------------|
| PDF | `[filename.pdf, Page 5]` |
| TXT | `[filename.txt]` |
| Markdown | `[filename.md, Page 2]` (section 2) |

## Important Notes

1. **UTF-8 Encoding**: Text/MD files assumed UTF-8
2. **PDF Library**: Uses `pdf-parse` which may not extract all PDFs perfectly
3. **No Page Numbers for TXT**: Intentional to avoid false citations
4. **Markdown Headers**: Only top-level (`#`, `##`) trigger section splits
5. **DOCX Support**: Stub exists but not implemented
