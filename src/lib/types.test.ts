import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHUNKING_CONFIG,
  EMBEDDING_DIMENSIONS,
  FILE_CONSTRAINTS,
} from './types';

describe('DEFAULT_CHUNKING_CONFIG', () => {
  it('should have reasonable default values', () => {
    expect(DEFAULT_CHUNKING_CONFIG.targetChunkSize).toBe(2000);
    expect(DEFAULT_CHUNKING_CONFIG.maxChunkSize).toBe(4000);
    expect(DEFAULT_CHUNKING_CONFIG.overlapSize).toBe(200);
    expect(DEFAULT_CHUNKING_CONFIG.minChunkSize).toBe(400);
  });

  it('should have maxChunkSize greater than targetChunkSize', () => {
    expect(DEFAULT_CHUNKING_CONFIG.maxChunkSize).toBeGreaterThan(
      DEFAULT_CHUNKING_CONFIG.targetChunkSize
    );
  });

  it('should have overlapSize less than targetChunkSize', () => {
    expect(DEFAULT_CHUNKING_CONFIG.overlapSize).toBeLessThan(
      DEFAULT_CHUNKING_CONFIG.targetChunkSize
    );
  });

  it('should have minChunkSize less than targetChunkSize', () => {
    expect(DEFAULT_CHUNKING_CONFIG.minChunkSize).toBeLessThan(
      DEFAULT_CHUNKING_CONFIG.targetChunkSize
    );
  });
});

describe('EMBEDDING_DIMENSIONS', () => {
  it('should be 1536 for text-embedding-3-small', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });
});

describe('FILE_CONSTRAINTS', () => {
  it('should have 50MB max size', () => {
    expect(FILE_CONSTRAINTS.maxSizeMB).toBe(50);
    expect(FILE_CONSTRAINTS.maxSizeBytes).toBe(50 * 1024 * 1024);
  });

  it('should support pdf, txt, and md file types', () => {
    expect(FILE_CONSTRAINTS.supportedTypes).toContain('pdf');
    expect(FILE_CONSTRAINTS.supportedTypes).toContain('txt');
    expect(FILE_CONSTRAINTS.supportedTypes).toContain('md');
  });

  it('should have correct mime type mappings', () => {
    expect(FILE_CONSTRAINTS.supportedMimeTypes['application/pdf']).toBe('pdf');
    expect(FILE_CONSTRAINTS.supportedMimeTypes['text/plain']).toBe('txt');
    expect(FILE_CONSTRAINTS.supportedMimeTypes['text/markdown']).toBe('md');
  });
});
