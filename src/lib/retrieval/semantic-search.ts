import { createAdminClient } from '@/lib/supabase/server';
import { embedText } from '@/lib/embeddings/openai';
import type { RetrievedChunk, HybridSearchConfig, RetrievalMethod } from '@/lib/types';
import { DEFAULT_HYBRID_CONFIG } from '@/lib/types';

const DEFAULT_TOP_K = 10;

/**
 * Perform semantic search across file chunks
 * Note: Uses admin client with direct file_id filtering (bypasses RLS)
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

  // Use fallback search directly since RPC requires auth.uid() which isn't available
  // when using the service role key. The fallback search filters by file_id directly.
  const supabase = createAdminClient();
  const chunks = await fallbackSearch(supabase, queryEmbedding, fileIds, topK);

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
    console.warn('RPC search_file_chunks not available:', error.message);
    console.log('Using fallback search for fileIds:', fileIds);
    return fallbackSearch(supabase, queryEmbedding, fileIds, topK);
  }

  console.log(`RPC search returned ${data?.length || 0} results`);

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
 * Parse pgvector embedding from database format
 * pgvector returns embeddings as strings like "[0.1,0.2,...]"
 */
function parseEmbedding(embedding: unknown): number[] | null {
  if (!embedding) return null;

  // If it's already an array, return it
  if (Array.isArray(embedding)) {
    return embedding;
  }

  // If it's a string (pgvector format), parse it
  if (typeof embedding === 'string') {
    try {
      // Remove brackets and split by comma
      const cleaned = embedding.replace(/^\[|\]$/g, '');
      return cleaned.split(',').map((s) => parseFloat(s.trim()));
    } catch (e) {
      console.error('Failed to parse embedding string:', e);
      return null;
    }
  }

  return null;
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
  console.log('Fallback search: fetching chunks for files:', fileIds);

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

  console.log(`Fallback search: found ${chunks.length} chunks`);

  // Debug: check first chunk's embedding format
  if (chunks.length > 0) {
    const firstEmbedding = chunks[0].embedding;
    console.log('First chunk embedding type:', typeof firstEmbedding);
    if (firstEmbedding) {
      const parsed = parseEmbedding(firstEmbedding);
      console.log('Parsed embedding length:', parsed?.length);
    } else {
      console.warn('First chunk has no embedding!');
    }
  }

  // Calculate similarity and sort
  const withSimilarity = chunks.map((chunk) => {
    const embedding = parseEmbedding(chunk.embedding);
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
  const results = withSimilarity
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  console.log('Fallback search: top similarities:', results.slice(0, 3).map(r => r.similarity.toFixed(4)));

  return results;
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
 * Phase 2: Enhanced with section titles in citations
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

    // Build rich source citation with section title if available
    const sourceParts = [chunk.filename];
    if (chunk.page) {
      sourceParts.push(`Page ${chunk.page}`);
    }
    if (chunk.section) {
      sourceParts.push(`Section: "${chunk.section}"`);
    }
    if (chunk.chunkIndex !== undefined) {
      sourceParts.push(`Chunk ${chunk.chunkIndex}`);
    }
    const source = `[Source: ${sourceParts.join(', ')}]`;

    context += `\n\n${source}\n${chunk.content}`;
    tokenCount += chunkTokens;
    usedChunks.push(chunk);
  }

  return { context: context.trim(), usedChunks };
}

/**
 * Perform keyword search using PostgreSQL full-text search
 * Phase 2: Uses the keyword_search_chunks RPC function
 */
export async function keywordSearch(
  query: string,
  fileIds: string[],
  topK: number = DEFAULT_TOP_K
): Promise<RetrievedChunk[]> {
  if (fileIds.length === 0 || !query.trim()) {
    return [];
  }

  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase.rpc('keyword_search_chunks', {
      search_query: query,
      file_ids: fileIds,
      match_count: topK,
    });

    if (error) {
      console.warn('Keyword search RPC failed:', error.message);
      return [];
    }

    return (data || []).map((row: {
      id: string;
      content: string;
      filename: string;
      file_id: string;
      page_number: number | null;
      section_title: string | null;
      rank: number;
    }) => ({
      id: row.id,
      content: row.content,
      filename: row.filename,
      fileId: row.file_id,
      page: row.page_number || undefined,
      section: row.section_title || undefined,
      similarity: 0, // Keyword search doesn't use similarity
      keywordScore: row.rank,
      retrievalMethod: 'keyword' as RetrievalMethod,
    }));
  } catch (err) {
    console.error('Keyword search error:', err);
    return [];
  }
}

/**
 * Perform hybrid search combining semantic and keyword search
 * Uses Reciprocal Rank Fusion (RRF) to merge results
 * Phase 2: Core hybrid search implementation
 */
export async function hybridSearch(
  query: string,
  fileIds: string[],
  topK: number = DEFAULT_TOP_K,
  config: Partial<HybridSearchConfig> = {}
): Promise<RetrievedChunk[]> {
  const { semanticWeight, keywordWeight, rrf_k } = {
    ...DEFAULT_HYBRID_CONFIG,
    ...config,
  };

  if (fileIds.length === 0) {
    return [];
  }

  // Run semantic and keyword search in parallel
  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearch(query, fileIds, topK * 2), // Get more candidates for RRF
    keywordSearch(query, fileIds, topK * 2),
  ]);

  console.log(`Hybrid search: ${semanticResults.length} semantic, ${keywordResults.length} keyword results`);

  // Mark retrieval method for semantic results
  const semanticWithMethod = semanticResults.map((chunk, idx) => ({
    ...chunk,
    retrievalMethod: 'semantic' as RetrievalMethod,
    semanticRank: idx + 1,
  }));

  // Mark keyword results with rank
  const keywordWithRank = keywordResults.map((chunk, idx) => ({
    ...chunk,
    keywordRank: idx + 1,
  }));

  // Build map of all unique chunks
  const chunkMap = new Map<string, RetrievedChunk & {
    semanticRank?: number;
    keywordRank?: number;
    rrfScore: number;
  }>();

  // Add semantic results
  for (const chunk of semanticWithMethod) {
    chunkMap.set(chunk.id, {
      ...chunk,
      rrfScore: 0,
    });
  }

  // Merge keyword results
  for (const chunk of keywordWithRank) {
    const existing = chunkMap.get(chunk.id);
    if (existing) {
      // Chunk found in both - merge scores
      existing.keywordRank = chunk.keywordRank;
      existing.keywordScore = chunk.keywordScore;
    } else {
      // Keyword-only result
      chunkMap.set(chunk.id, {
        ...chunk,
        retrievalMethod: 'keyword' as RetrievalMethod,
        rrfScore: 0,
      });
    }
  }

  // Calculate RRF scores
  // RRF formula: score(d) = Σ weight_i * (1 / (k + rank_i))
  for (const chunk of chunkMap.values()) {
    let rrfScore = 0;

    if (chunk.semanticRank) {
      rrfScore += semanticWeight * (1 / (rrf_k + chunk.semanticRank));
    }

    if (chunk.keywordRank) {
      rrfScore += keywordWeight * (1 / (rrf_k + chunk.keywordRank));
    } else {
      // Penalty for not appearing in keyword results
      rrfScore += keywordWeight * (1 / (rrf_k + topK * 3));
    }

    chunk.rrfScore = rrfScore;
    chunk.combinedScore = rrfScore;

    // Update retrieval method if found in both
    if (chunk.semanticRank && chunk.keywordRank) {
      chunk.retrievalMethod = 'hybrid';
    }
  }

  // Sort by RRF score and return top K
  const results = Array.from(chunkMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK)
    .map(({ semanticRank, keywordRank, rrfScore, ...chunk }) => chunk);

  console.log('Hybrid search: top combined scores:',
    results.slice(0, 3).map(r => ({
      method: r.retrievalMethod,
      combined: r.combinedScore?.toFixed(4),
      similarity: r.similarity.toFixed(4),
    }))
  );

  return results;
}
