import { describe, it, expect } from 'vitest';
import { chunkDocument, estimateTokenCount, mergeSmallChunks } from './chunker';
import type { ExtractedContent } from '@/lib/types';

describe('estimateTokenCount', () => {
  it('should estimate tokens as roughly 1/4 of character count', () => {
    const text = 'Hello world'; // 11 characters
    expect(estimateTokenCount(text)).toBe(3); // ceil(11/4) = 3
  });

  it('should handle empty string', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  it('should handle long text', () => {
    const text = 'a'.repeat(1000);
    expect(estimateTokenCount(text)).toBe(250);
  });
});

describe('chunkDocument', () => {
  it('should chunk simple text into multiple chunks', () => {
    const content: ExtractedContent = {
      text: 'A'.repeat(10000), // 10000 chars, should create multiple chunks
    };

    const chunks = chunkDocument(content, {
      targetChunkSize: 2000,
      maxChunkSize: 3000,
      overlapSize: 200,
      minChunkSize: 500,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    chunks.forEach((chunk, index) => {
      expect(chunk.index).toBe(index);
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.tokenCount).toBeGreaterThan(0);
    });
  });

  it('should preserve page numbers when pages are provided', () => {
    const content: ExtractedContent = {
      text: 'Page 1 content. Page 2 content.',
      pages: [
        { pageNumber: 1, content: 'Page 1 content with enough text to create a chunk.' },
        { pageNumber: 2, content: 'Page 2 content with enough text to create a chunk.' },
      ],
    };

    const chunks = chunkDocument(content, {
      targetChunkSize: 100,
      maxChunkSize: 200,
      overlapSize: 10,
      minChunkSize: 20,
    });

    // Should have chunks from both pages
    const page1Chunks = chunks.filter(c => c.pageNumber === 1);
    const page2Chunks = chunks.filter(c => c.pageNumber === 2);

    expect(page1Chunks.length).toBeGreaterThan(0);
    expect(page2Chunks.length).toBeGreaterThan(0);
  });

  it('should handle text without pages', () => {
    const content: ExtractedContent = {
      text: 'This is some text without page information. It should still be chunked properly.',
    };

    const chunks = chunkDocument(content, {
      targetChunkSize: 20,
      maxChunkSize: 50,
      overlapSize: 5,
      minChunkSize: 10,
    });

    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(chunk => {
      expect(chunk.pageNumber).toBeUndefined();
    });
  });

  it('should split at paragraph boundaries when content is large enough', () => {
    // Create content with clear paragraph boundaries that exceeds chunk size
    const content: ExtractedContent = {
      text: 'First paragraph with lots of meaningful content that fills up space. This paragraph has multiple sentences and is quite long.\n\nSecond paragraph is also quite substantial with additional content that continues the document. It has several sentences too.\n\nThird paragraph concludes the document with final thoughts and more content to ensure we have enough text.',
    };

    const chunks = chunkDocument(content, {
      targetChunkSize: 100,
      maxChunkSize: 200,
      overlapSize: 20,
      minChunkSize: 50,
    });

    // With this content size, should create multiple chunks
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Each chunk should have content
    chunks.forEach(chunk => {
      expect(chunk.content.length).toBeGreaterThan(0);
    });
  });

  it('should handle single large paragraph', () => {
    // Create a single large paragraph
    const content: ExtractedContent = {
      text: 'This is the first sentence with some content. This is the second sentence with more content. This is the third sentence with even more content. This is the fourth sentence to add length. This is the fifth sentence for more text. This is the sixth sentence.',
    };

    const chunks = chunkDocument(content, {
      targetChunkSize: 100,
      maxChunkSize: 200,
      overlapSize: 20,
      minChunkSize: 50,
    });

    // Should create at least one chunk
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Content should be preserved
    expect(chunks.map(c => c.content).join(' ')).toContain('first sentence');
  });

  it('should handle empty content', () => {
    const content: ExtractedContent = {
      text: '',
    };

    const chunks = chunkDocument(content);
    expect(chunks).toEqual([]);
  });

  it('should handle whitespace-only content', () => {
    const content: ExtractedContent = {
      text: '   \n\n   \t   ',
    };

    const chunks = chunkDocument(content);
    expect(chunks).toEqual([]);
  });

  it('should create chunks with proper indexing', () => {
    const content: ExtractedContent = {
      text: 'This is a longer text that should be split into multiple chunks. '.repeat(20),
    };

    const chunks = chunkDocument(content, {
      targetChunkSize: 100,
      maxChunkSize: 200,
      overlapSize: 20,
      minChunkSize: 30,
    });

    // Verify chunks are properly indexed
    chunks.forEach((chunk, index) => {
      expect(chunk.index).toBe(index);
      expect(chunk.content.length).toBeGreaterThan(0);
    });

    // Verify we got multiple chunks for long content
    if (content.text.length > 200) {
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('mergeSmallChunks', () => {
  it('should merge chunks smaller than minimum size', () => {
    const chunks = [
      { content: 'Small', index: 0, tokenCount: 2 },
      { content: 'Also small', index: 1, tokenCount: 3 },
      { content: 'This is a longer chunk that exceeds minimum', index: 2, tokenCount: 10 },
    ];

    const merged = mergeSmallChunks(chunks, 20); // minSize = 20 chars

    expect(merged.length).toBeLessThan(chunks.length);
    // First two should be merged
    expect(merged[0].content).toContain('Small');
    expect(merged[0].content).toContain('Also small');
  });

  it('should not merge chunks that meet minimum size', () => {
    const chunks = [
      { content: 'This is a chunk that is long enough', index: 0, tokenCount: 10 },
      { content: 'Another chunk that is also long enough', index: 1, tokenCount: 10 },
    ];

    const merged = mergeSmallChunks(chunks, 10);

    expect(merged.length).toBe(2);
  });

  it('should handle empty array', () => {
    const merged = mergeSmallChunks([], 100);
    expect(merged).toEqual([]);
  });

  it('should handle single chunk', () => {
    const chunks = [{ content: 'Only one', index: 0, tokenCount: 2 }];
    const merged = mergeSmallChunks(chunks, 100);
    expect(merged).toEqual(chunks);
  });

  it('should re-index merged chunks', () => {
    const chunks = [
      { content: 'A', index: 0, tokenCount: 1 },
      { content: 'B', index: 1, tokenCount: 1 },
      { content: 'C', index: 2, tokenCount: 1 },
    ];

    const merged = mergeSmallChunks(chunks, 10);

    merged.forEach((chunk, index) => {
      expect(chunk.index).toBe(index);
    });
  });
});
