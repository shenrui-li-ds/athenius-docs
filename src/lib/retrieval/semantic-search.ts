import { createAdminClient } from '@/lib/supabase/server';
import { embedText } from '@/lib/embeddings/openai';
import type { RetrievedChunk } from '@/lib/types';

const DEFAULT_TOP_K = 10;

/**
 * Perform semantic search across file chunks
 */
export async function semanticSearch(
  query: string,
  fileIds: string[],
  topK: number = DEFAULT_TOP_K
): Promise<RetrievedChunk[]> {
  if (fileIds.length === 0) {
    return [];
  }

  // Generate query embedding
  const queryEmbedding = await embedText(query);

  // Search in database
  const chunks = await searchChunks(queryEmbedding, fileIds, topK);

  return chunks;
}

/**
 * Search chunks by embedding similarity
 */
async function searchChunks(
  queryEmbedding: number[],
  fileIds: string[],
  topK: number
): Promise<RetrievedChunk[]> {
  const supabase = createAdminClient();

  // Convert embedding to string format for pgvector
  const embeddingString = `[${queryEmbedding.join(',')}]`;

  // Use raw SQL query for vector similarity search
  const { data, error } = await supabase.rpc('search_file_chunks', {
    query_embedding: embeddingString,
    file_ids: fileIds,
    match_count: topK,
  });

  if (error) {
    // Fall back to basic query if RPC doesn't exist
    console.warn('RPC search_file_chunks not available, using fallback query');
    return fallbackSearch(supabase, queryEmbedding, fileIds, topK);
  }

  return (data || []).map((row: {
    id: string;
    content: string;
    filename: string;
    file_id: string;
    page_number: number | null;
    section_title: string | null;
    similarity: number;
  }) => ({
    id: row.id,
    content: row.content,
    filename: row.filename,
    fileId: row.file_id,
    page: row.page_number || undefined,
    section: row.section_title || undefined,
    similarity: row.similarity,
  }));
}

/**
 * Fallback search without RPC (less efficient but works without stored procedure)
 */
async function fallbackSearch(
  supabase: ReturnType<typeof createAdminClient>,
  queryEmbedding: number[],
  fileIds: string[],
  topK: number
): Promise<RetrievedChunk[]> {
  // Get chunks for the specified files
  const { data: chunks, error } = await supabase
    .from('file_chunks')
    .select(`
      id,
      content,
      page_number,
      section_title,
      file_id,
      embedding,
      file_uploads!inner(filename)
    `)
    .in('file_id', fileIds);

  if (error || !chunks) {
    throw new Error(`Failed to search chunks: ${error?.message || 'No data'}`);
  }

  // Calculate similarity and sort
  const withSimilarity = chunks.map((chunk) => {
    const embedding = chunk.embedding as number[] | null;
    const similarity = embedding ? cosineSimilarity(queryEmbedding, embedding) : 0;
    // file_uploads is a single object due to !inner join, but TS infers as array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileUpload = chunk.file_uploads as any;
    const filename = fileUpload?.filename || (Array.isArray(fileUpload) ? fileUpload[0]?.filename : null) || 'Unknown';

    return {
      id: chunk.id,
      content: chunk.content,
      filename,
      fileId: chunk.file_id,
      page: chunk.page_number || undefined,
      section: chunk.section_title || undefined,
      similarity,
    };
  });

  // Sort by similarity and return top K
  return withSimilarity
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Assemble context from retrieved chunks
 */
export function assembleContext(
  chunks: RetrievedChunk[],
  maxTokens: number = 8000
): { context: string; usedChunks: RetrievedChunk[] } {
  let context = '';
  let tokenCount = 0;
  const usedChunks: RetrievedChunk[] = [];

  // Rough token estimation: 4 chars per token
  const tokensPerChar = 0.25;

  for (const chunk of chunks) {
    const chunkTokens = Math.ceil(chunk.content.length * tokensPerChar);

    if (tokenCount + chunkTokens > maxTokens) {
      break;
    }

    const source = chunk.page
      ? `[Source: ${chunk.filename}, Page ${chunk.page}]`
      : `[Source: ${chunk.filename}]`;

    context += `\n\n${source}\n${chunk.content}`;
    tokenCount += chunkTokens;
    usedChunks.push(chunk);
  }

  return { context: context.trim(), usedChunks };
}
