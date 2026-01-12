import type { ExtractedContent, Chunk, ChunkingConfig } from '@/lib/types';
import { DEFAULT_CHUNKING_CONFIG } from '@/lib/types';

/**
 * Estimate token count from text
 * Rough approximation: 1 token ≈ 4 characters for English text
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks with overlap
 */
export function chunkDocument(
  content: ExtractedContent,
  config: Partial<ChunkingConfig> = {}
): Chunk[] {
  const finalConfig = { ...DEFAULT_CHUNKING_CONFIG, ...config };
  const { targetChunkSize, maxChunkSize, overlapSize, minChunkSize } = finalConfig;

  const chunks: Chunk[] = [];

  // If we have pages, process page by page to preserve page numbers
  if (content.pages && content.pages.length > 0) {
    for (const page of content.pages) {
      const pageChunks = chunkText(
        page.content,
        targetChunkSize,
        maxChunkSize,
        overlapSize,
        minChunkSize,
        chunks.length,
        page.pageNumber
      );
      chunks.push(...pageChunks);
    }
  } else {
    // No page information, chunk the entire text
    const textChunks = chunkText(
      content.text,
      targetChunkSize,
      maxChunkSize,
      overlapSize,
      minChunkSize,
      0,
      undefined
    );
    chunks.push(...textChunks);
  }

  return chunks;
}

/**
 * Chunk a text string into smaller pieces
 */
function chunkText(
  text: string,
  targetSize: number,
  maxSize: number,
  overlap: number,
  minSize: number,
  startIndex: number,
  pageNumber: number | undefined
): Chunk[] {
  const chunks: Chunk[] = [];
  let currentPosition = 0;
  let chunkIndex = startIndex;

  // Clean and normalize whitespace
  text = text.replace(/\r\n/g, '\n').trim();

  while (currentPosition < text.length) {
    // Determine the end position for this chunk
    let endPosition = Math.min(currentPosition + targetSize, text.length);

    // If we haven't reached the end, try to find a good break point
    if (endPosition < text.length) {
      endPosition = findBreakPoint(text, currentPosition, endPosition, maxSize);
    }

    // Extract the chunk content
    let chunkContent = text.slice(currentPosition, endPosition).trim();

    // Skip if the chunk is too small (unless it's the last chunk)
    if (chunkContent.length >= minSize || currentPosition + targetSize >= text.length) {
      if (chunkContent.length > 0) {
        chunks.push({
          content: chunkContent,
          index: chunkIndex++,
          pageNumber,
          tokenCount: estimateTokenCount(chunkContent),
        });
      }
    }

    // Move to next chunk position with overlap
    if (endPosition >= text.length) {
      break;
    }

    // Calculate next position with overlap
    currentPosition = Math.max(currentPosition + 1, endPosition - overlap);

    // Find a good starting point for the next chunk (start of a word/sentence)
    while (currentPosition < text.length && !/\s/.test(text[currentPosition - 1])) {
      currentPosition++;
    }
  }

  return chunks;
}

/**
 * Find a good break point for chunking
 * Prefers: paragraph breaks > sentence breaks > word breaks
 */
function findBreakPoint(
  text: string,
  start: number,
  idealEnd: number,
  maxEnd: number
): number {
  // Search window: from idealEnd backward and forward a bit
  const searchStart = Math.max(start, idealEnd - 200);
  const searchEnd = Math.min(text.length, idealEnd + 100, start + maxEnd);

  const searchText = text.slice(searchStart, searchEnd);

  // Look for paragraph break (double newline)
  const paragraphBreak = searchText.lastIndexOf('\n\n');
  if (paragraphBreak !== -1) {
    const breakPos = searchStart + paragraphBreak + 2;
    if (breakPos > start && breakPos <= start + maxEnd) {
      return breakPos;
    }
  }

  // Look for sentence break (. ! ? followed by space or newline)
  const sentencePattern = /[.!?]\s/g;
  let lastSentenceBreak = -1;
  let match;

  while ((match = sentencePattern.exec(searchText)) !== null) {
    lastSentenceBreak = match.index + match[0].length;
  }

  if (lastSentenceBreak !== -1) {
    const breakPos = searchStart + lastSentenceBreak;
    if (breakPos > start && breakPos <= start + maxEnd) {
      return breakPos;
    }
  }

  // Look for word break (space)
  const lastSpace = searchText.lastIndexOf(' ');
  if (lastSpace !== -1) {
    const breakPos = searchStart + lastSpace + 1;
    if (breakPos > start) {
      return breakPos;
    }
  }

  // Fall back to ideal end
  return Math.min(idealEnd, text.length);
}

/**
 * Merge small adjacent chunks that are under the minimum size
 */
export function mergeSmallChunks(chunks: Chunk[], minSize: number): Chunk[] {
  if (chunks.length <= 1) return chunks;

  const merged: Chunk[] = [];
  let accumulator: Chunk | null = null;

  for (const chunk of chunks) {
    if (accumulator === null) {
      accumulator = { ...chunk };
      continue;
    }

    // If accumulator is too small, merge with current chunk
    if (accumulator.content.length < minSize) {
      accumulator.content += '\n\n' + chunk.content;
      accumulator.tokenCount = estimateTokenCount(accumulator.content);
      // Keep the original index and page number
    } else {
      merged.push(accumulator);
      accumulator = { ...chunk };
    }
  }

  // Don't forget the last accumulator
  if (accumulator !== null) {
    merged.push(accumulator);
  }

  // Re-index
  return merged.map((chunk, index) => ({
    ...chunk,
    index,
  }));
}
