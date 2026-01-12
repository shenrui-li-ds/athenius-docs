// Gemini embedding module
// Uses gemini-embedding-001 for text embeddings

import { embedWithGemini, batchEmbedWithGemini } from '@/lib/gemini';
import { EMBEDDING_DIMENSIONS } from '@/lib/types';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const MAX_BATCH_SIZE = 100; // Gemini batch limit
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

/**
 * Generate embedding for a single text
 */
export async function embedText(text: string): Promise<number[]> {
  return embedTextWithRetry(text);
}

/**
 * Generate embeddings for multiple texts in batches
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const allEmbeddings: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const batchEmbeddings = await embedBatchWithRetry(batch);
    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}

/**
 * Embed a single text with retry logic
 */
async function embedTextWithRetry(text: string): Promise<number[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const embedding = await embedWithGemini(
        text,
        EMBEDDING_MODEL,
        'RETRIEVAL_QUERY', // Use query type for single texts (usually queries)
        EMBEDDING_DIMENSIONS
      );
      return embedding;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Embedding attempt ${attempt + 1} failed:`, lastError.message);

      // Check if it's a rate limit error
      if (isRateLimitError(error)) {
        const delay = RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff
        await sleep(delay);
        continue;
      }

      // For other errors, throw immediately
      throw lastError;
    }
  }

  throw lastError || new Error('Failed to generate embedding after retries');
}

/**
 * Embed a batch of texts with retry logic
 */
async function embedBatchWithRetry(texts: string[]): Promise<number[][]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const embeddings = await batchEmbedWithGemini(
        texts,
        EMBEDDING_MODEL,
        'RETRIEVAL_DOCUMENT', // Use document type for batch (usually document chunks)
        EMBEDDING_DIMENSIONS
      );
      return embeddings;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Batch embedding attempt ${attempt + 1} failed:`, lastError.message);

      // Check if it's a rate limit error
      if (isRateLimitError(error)) {
        const delay = RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff
        await sleep(delay);
        continue;
      }

      // For other errors, throw immediately
      throw lastError;
    }
  }

  throw lastError || new Error('Failed to generate embeddings after retries');
}

/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') ||
           message.includes('quota') ||
           message.includes('429') ||
           message.includes('resource_exhausted');
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimensions');
  }

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
