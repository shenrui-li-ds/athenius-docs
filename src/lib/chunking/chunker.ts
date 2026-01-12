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
 * Section info extracted from headers
 */
interface Section {
  title: string;
  level: number; // 1 for H1, 2 for H2, etc.
  startIndex: number;
  endIndex: number;
}

/**
 * Detect sections/headers in text
 * Supports: markdown headers (#, ##), "Chapter X", "Section X", numbered headers
 */
export function detectSections(text: string): Section[] {
  const sections: Section[] = [];
  const lines = text.split('\n');
  let charIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let section: Section | null = null;

    // Markdown headers: # Header, ## Header, ### Header
    const markdownMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (markdownMatch) {
      section = {
        title: markdownMatch[2].trim(),
        level: markdownMatch[1].length,
        startIndex: charIndex,
        endIndex: text.length, // Will be updated when next section is found
      };
    }

    // Chapter/Section patterns: "Chapter 1", "Section 1.2", "CHAPTER ONE"
    const chapterMatch = line.match(/^(Chapter|Section|Part)\s+[\dIVXLCDM]+[.:]*\s*(.*)/i);
    if (!section && chapterMatch) {
      section = {
        title: line,
        level: chapterMatch[1].toLowerCase() === 'chapter' ? 1 : 2,
        startIndex: charIndex,
        endIndex: text.length,
      };
    }

    // Numbered headers: "1. Introduction", "1.2 Methods"
    const numberedMatch = line.match(/^(\d+\.)+\s+(.+)$/);
    if (!section && numberedMatch) {
      const level = (numberedMatch[1].match(/\./g) || []).length;
      section = {
        title: numberedMatch[2].trim(),
        level: Math.min(level, 3),
        startIndex: charIndex,
        endIndex: text.length,
      };
    }

    // ALL CAPS headers (at least 3 words, common in documents)
    const capsMatch = line.match(/^[A-Z][A-Z\s]{10,}$/);
    if (!section && capsMatch && line.split(/\s+/).length >= 2) {
      section = {
        title: line,
        level: 1,
        startIndex: charIndex,
        endIndex: text.length,
      };
    }

    if (section) {
      // Update the end index of the previous section
      if (sections.length > 0) {
        sections[sections.length - 1].endIndex = charIndex;
      }
      sections.push(section);
    }

    charIndex += lines[i].length + 1; // +1 for newline
  }

  return sections;
}

/**
 * Find the current section for a given position in text
 */
function findSectionAtPosition(sections: Section[], position: number): Section | undefined {
  for (let i = sections.length - 1; i >= 0; i--) {
    if (position >= sections[i].startIndex) {
      return sections[i];
    }
  }
  return undefined;
}

/**
 * Split text into paragraphs
 */
export function splitIntoParagraphs(text: string): string[] {
  // Split on double newlines (paragraph breaks)
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  return paragraphs;
}

/**
 * Split text into chunks with overlap (Phase 2: Semantic Chunking)
 * Respects paragraph and sentence boundaries, extracts section titles
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
      const pageChunks = chunkTextSemantic(
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
    // No page information, chunk the entire text with section detection
    const textChunks = chunkTextSemantic(
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
 * Semantic chunking: builds chunks from paragraphs, respects sentence boundaries
 */
function chunkTextSemantic(
  text: string,
  targetSize: number,
  maxSize: number,
  overlap: number,
  minSize: number,
  startIndex: number,
  pageNumber: number | undefined
): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = startIndex;

  // Clean and normalize whitespace
  text = text.replace(/\r\n/g, '\n').trim();

  if (text.length === 0) {
    return chunks;
  }

  // Detect sections in the text
  const sections = detectSections(text);

  // Split into paragraphs
  const paragraphs = splitIntoParagraphs(text);

  if (paragraphs.length === 0) {
    return chunks;
  }

  // Build chunks from paragraphs
  let currentContent = '';
  let currentPosition = 0; // Track position in original text for section lookup
  let currentSection: Section | undefined;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];

    // Find this paragraph's position in the original text
    const paragraphPosition = text.indexOf(paragraph, currentPosition);
    if (paragraphPosition !== -1) {
      currentPosition = paragraphPosition;
    }

    // Determine section for this paragraph
    const paragraphSection = findSectionAtPosition(sections, currentPosition);

    // Check if adding this paragraph would exceed max size
    const wouldExceed = (currentContent.length + paragraph.length + 2) > maxSize;

    // Check if section changed (start new chunk for new sections)
    const sectionChanged = paragraphSection && currentSection &&
      paragraphSection.title !== currentSection.title;

    // Start new chunk if: exceeds max OR section changed (and current has content)
    if (currentContent.length > 0 && (wouldExceed || sectionChanged)) {
      // Save current chunk
      if (currentContent.length >= minSize) {
        chunks.push({
          content: currentContent.trim(),
          index: chunkIndex++,
          pageNumber,
          sectionTitle: currentSection?.title,
          tokenCount: estimateTokenCount(currentContent),
        });
      }

      // Start new chunk with overlap from previous content
      if (overlap > 0 && currentContent.length > overlap) {
        // Get overlap from end of previous content, respecting sentence boundaries
        const overlapContent = getOverlapContent(currentContent, overlap);
        currentContent = overlapContent;
      } else {
        currentContent = '';
      }
    }

    // Update current section
    currentSection = paragraphSection;

    // Add paragraph to current chunk
    if (currentContent.length > 0) {
      currentContent += '\n\n' + paragraph;
    } else {
      currentContent = paragraph;
    }

    // If current chunk has reached target size, try to finalize it
    if (currentContent.length >= targetSize && i < paragraphs.length - 1) {
      // Don't force split mid-paragraph; wait for next iteration
      // But if we're way over max, we need to split
      if (currentContent.length > maxSize) {
        // Split large paragraph at sentence boundaries
        const splitChunks = splitLargeParagraph(
          currentContent,
          targetSize,
          maxSize,
          chunkIndex,
          pageNumber,
          currentSection?.title
        );
        chunks.push(...splitChunks);
        chunkIndex += splitChunks.length;
        currentContent = '';
      }
    }
  }

  // Don't forget the last chunk
  if (currentContent.trim().length > 0) {
    // If last chunk is tiny, try to merge with previous
    if (currentContent.length < minSize && chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      if (lastChunk.content.length + currentContent.length <= maxSize) {
        lastChunk.content += '\n\n' + currentContent.trim();
        lastChunk.tokenCount = estimateTokenCount(lastChunk.content);
      } else {
        // Can't merge, add as-is
        chunks.push({
          content: currentContent.trim(),
          index: chunkIndex++,
          pageNumber,
          sectionTitle: currentSection?.title,
          tokenCount: estimateTokenCount(currentContent),
        });
      }
    } else {
      chunks.push({
        content: currentContent.trim(),
        index: chunkIndex++,
        pageNumber,
        sectionTitle: currentSection?.title,
        tokenCount: estimateTokenCount(currentContent),
      });
    }
  }

  return chunks;
}

/**
 * Get overlap content from end of text, respecting sentence boundaries
 */
function getOverlapContent(text: string, targetOverlap: number): string {
  if (text.length <= targetOverlap) {
    return text;
  }

  // Start from targetOverlap chars from the end
  let startPos = text.length - targetOverlap;

  // Find the start of a sentence (after a sentence-ending punctuation)
  const searchText = text.slice(Math.max(0, startPos - 100), startPos + 50);
  const sentenceEndMatch = searchText.match(/[.!?]\s+[A-Z]/);

  if (sentenceEndMatch) {
    const adjustedStart = Math.max(0, startPos - 100) + sentenceEndMatch.index! + 2;
    if (adjustedStart < text.length) {
      return text.slice(adjustedStart).trim();
    }
  }

  // Fall back to finding a paragraph break
  const paragraphBreak = text.lastIndexOf('\n\n', startPos + 50);
  if (paragraphBreak !== -1 && paragraphBreak > startPos - 100) {
    return text.slice(paragraphBreak + 2).trim();
  }

  // Fall back to word boundary
  while (startPos < text.length && text[startPos] !== ' ') {
    startPos++;
  }
  return text.slice(startPos).trim();
}

/**
 * Split a large paragraph that exceeds max size at sentence boundaries
 */
function splitLargeParagraph(
  text: string,
  targetSize: number,
  maxSize: number,
  startIndex: number,
  pageNumber: number | undefined,
  sectionTitle: string | undefined
): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = startIndex;

  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  let currentContent = '';

  for (const sentence of sentences) {
    if (currentContent.length + sentence.length > maxSize && currentContent.length > 0) {
      // Save current chunk
      chunks.push({
        content: currentContent.trim(),
        index: chunkIndex++,
        pageNumber,
        sectionTitle,
        tokenCount: estimateTokenCount(currentContent),
      });
      currentContent = sentence;
    } else {
      currentContent += sentence;
    }
  }

  // Last chunk
  if (currentContent.trim().length > 0) {
    chunks.push({
      content: currentContent.trim(),
      index: chunkIndex++,
      pageNumber,
      sectionTitle,
      tokenCount: estimateTokenCount(currentContent),
    });
  }

  return chunks;
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
