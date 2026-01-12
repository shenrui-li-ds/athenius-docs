// File status
export type FileStatus = 'pending' | 'processing' | 'ready' | 'error';

// Query modes
export type QueryMode = 'simple' | 'detailed' | 'deep';

// Supported file types
export type SupportedFileType = 'pdf' | 'txt' | 'md' | 'docx';

// File upload record (matches database schema)
export interface FileUpload {
  id: string;
  user_id: string;
  filename: string;
  original_filename: string;
  file_type: SupportedFileType;
  file_size: number;
  storage_path: string;
  status: FileStatus;
  error_message?: string | null;
  chunk_count: number;
  created_at: string;
  expires_at: string;
}

// File chunk record (matches database schema)
export interface FileChunk {
  id: string;
  file_id: string;
  user_id: string;
  chunk_index: number;
  content: string;
  token_count?: number | null;
  page_number?: number | null;
  section_title?: string | null;
  embedding?: number[];
  created_at: string;
}

// Extracted content from files
export interface ExtractedPage {
  pageNumber: number;
  content: string;
}

export interface ExtractedContent {
  text: string;
  pages?: ExtractedPage[];
  metadata?: {
    title?: string;
    author?: string;
    createdAt?: string;
  };
}

// Chunk after processing
export interface Chunk {
  content: string;
  index: number;
  pageNumber?: number;
  sectionTitle?: string;
  tokenCount: number;
}

// Retrieval method for hybrid search
export type RetrievalMethod = 'semantic' | 'keyword' | 'hybrid';

// Retrieved chunk from semantic search (Phase 2: extended for hybrid search)
export interface RetrievedChunk {
  id: string;
  content: string;
  filename: string;
  fileId: string;
  page?: number;
  section?: string;
  similarity: number;
  // Phase 2 additions
  chunkIndex?: number;
  retrievalMethod?: RetrievalMethod;
  keywordScore?: number;
  combinedScore?: number;
}

// Source format (Tavily-compatible for Athenius Search integration)
export interface Source {
  id: string;
  title: string;
  url: string;
  content: string;
  snippet?: string;
}

// Query request
export interface QueryRequest {
  query: string;
  fileIds: string[];
  mode?: QueryMode;
  provider?: string;
}

// Query response
export interface QueryResponse {
  content: string;
  sources: Source[];
}

// File upload response
export interface UploadResponse {
  fileId: string;
  filename: string;
  status: FileStatus;
  message: string;
}

// File status response
export interface FileStatusResponse {
  fileId: string;
  status: FileStatus;
  chunkCount?: number;
  error?: string;
}

// API Error response
export interface ApiError {
  error: string;
  details?: string;
}

// Chunking configuration
export interface ChunkingConfig {
  targetChunkSize: number;   // Target size in characters
  maxChunkSize: number;      // Maximum chunk size
  overlapSize: number;       // Overlap between chunks in characters
  minChunkSize: number;      // Minimum chunk size
}

// Default chunking configuration
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  targetChunkSize: 2000,     // ~512 tokens
  maxChunkSize: 4000,        // ~1024 tokens
  overlapSize: 200,          // ~64 tokens overlap
  minChunkSize: 400,         // ~100 tokens minimum
};

// Embedding dimensions
export const EMBEDDING_DIMENSIONS = 1536; // OpenAI text-embedding-3-small

// File constraints
export const FILE_CONSTRAINTS = {
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  maxSizeMB: 50,
  supportedTypes: ['pdf', 'txt', 'md'] as const,
  supportedMimeTypes: {
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/markdown': 'md',
  } as const,
};

// ============================================
// Phase 2: Streaming Types
// ============================================

// Streaming event types for Server-Sent Events
export type QueryStreamEvent =
  | { type: 'sources'; sources: Source[] }
  | { type: 'token'; content: string }
  | { type: 'done'; usage?: { promptTokens?: number; completionTokens?: number } }
  | { type: 'error'; message: string };

// Hybrid search configuration
export interface HybridSearchConfig {
  semanticWeight: number;  // Weight for semantic search (0-1)
  keywordWeight: number;   // Weight for keyword search (0-1)
  rrf_k: number;           // RRF constant (typically 60)
}

// Default hybrid search configuration
// 80/20 semantic/keyword - prioritize semantic understanding for nuanced questions
export const DEFAULT_HYBRID_CONFIG: HybridSearchConfig = {
  semanticWeight: 0.8,
  keywordWeight: 0.2,
  rrf_k: 60,
};
