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
  // Phase 3: Entity extraction fields
  entities_enabled?: boolean;
  entities_status?: 'pending' | 'processing' | 'ready' | 'error' | null;
  entities_progress?: number | null; // 0-100 percentage during extraction
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
// Note: Gemini uses 768 by default, OpenAI uses 1536
// Using 768 for Gemini gemini-embedding-001
export const EMBEDDING_DIMENSIONS = 768;

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

// ============================================
// Phase 3: Entity Types for Progressive HybridRAG
// ============================================

// Entity types
export type EntityType = 'character' | 'location' | 'object' | 'event' | 'organization';

// Entity extraction status
export type EntityStatus = 'pending' | 'processing' | 'ready' | 'error' | null;

// Document entity (matches database schema)
export interface DocumentEntity {
  id: string;
  file_id: string;
  user_id: string;
  name: string;
  entity_type: EntityType;
  aliases: string[];
  description?: string | null;
  first_mention_chunk?: number | null;
  mention_count: number;
  created_at: string;
}

// Entity relationship (matches database schema)
export interface EntityRelationship {
  id: string;
  file_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  evidence_chunk_ids: string[];
  confidence: number;
  created_at: string;
}

// Entity mention in a chunk (matches database schema)
export interface EntityMention {
  id: string;
  entity_id: string;
  chunk_id: string;
  mention_text?: string | null;
  context?: string | null;
  created_at: string;
}

// Note: FileUpload now includes entities_enabled and entities_status directly
// FileUploadWithEntities is kept for backwards compatibility but is equivalent to FileUpload
export type FileUploadWithEntities = FileUpload;

// Entity extraction result from LLM
export interface ExtractedEntity {
  name: string;
  type: EntityType;
  aliases?: string[];
  description?: string;
}

// Relationship extraction result from LLM
export interface ExtractedRelationship {
  source: string;  // Entity name
  target: string;  // Entity name
  type: string;    // Relationship type (e.g., "drives", "loves", "works_at")
}

// Entity extraction response from LLM
export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
}

// Query expansion result with entities
export interface EntityQueryExpansion {
  queryEntities: DocumentEntity[];      // Entities mentioned in query
  relatedEntities: DocumentEntity[];    // Related entities from graph traversal
  entityChunkIds: string[];             // Chunk IDs mentioning these entities
}

// Related entity from RPC function
export interface RelatedEntity {
  id: string;
  name: string;
  entity_type: EntityType;
  relationship_type: string;
  direction: 'outgoing' | 'incoming';
  confidence: number;
}

// Chunk with entity information
export interface ChunkWithEntities {
  chunk_id: string;
  content: string;
  page_number?: number;
  section_title?: string;
  file_id: string;
  filename: string;
  entity_names: string[];
}
