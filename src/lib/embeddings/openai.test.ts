import { describe, it, expect, vi } from 'vitest';

// Mock the OpenAI module before importing
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: vi.fn(),
      };
    },
  };
});

// Import cosineSimilarity after mocking
import { cosineSimilarity } from './openai';

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const vector = [1, 2, 3, 4, 5];
    const similarity = cosineSimilarity(vector, vector);

    expect(similarity).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const similarity = cosineSimilarity(a, b);

    expect(similarity).toBeCloseTo(0, 5);
  });

  it('should return -1 for opposite vectors', () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    const similarity = cosineSimilarity(a, b);

    expect(similarity).toBeCloseTo(-1, 5);
  });

  it('should handle normalized vectors', () => {
    const a = [0.6, 0.8]; // normalized
    const b = [0.8, 0.6]; // normalized
    const similarity = cosineSimilarity(a, b);

    // Dot product of these normalized vectors
    expect(similarity).toBeCloseTo(0.96, 2);
  });

  it('should handle zero vectors', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    const similarity = cosineSimilarity(a, b);

    expect(similarity).toBe(0);
  });

  it('should throw for vectors of different dimensions', () => {
    const a = [1, 2, 3];
    const b = [1, 2];

    expect(() => cosineSimilarity(a, b)).toThrow('same dimensions');
  });

  it('should handle high-dimensional vectors (like embeddings)', () => {
    // Simulate 1536-dim embedding vectors
    const a = Array.from({ length: 1536 }, () => Math.random() - 0.5);
    const b = Array.from({ length: 1536 }, () => Math.random() - 0.5);

    const similarity = cosineSimilarity(a, b);

    // Random vectors should have low but non-zero similarity
    expect(similarity).toBeGreaterThan(-1);
    expect(similarity).toBeLessThan(1);
  });

  it('should be symmetric', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [5, 4, 3, 2, 1];

    expect(cosineSimilarity(a, b)).toBe(cosineSimilarity(b, a));
  });

  it('should handle negative values', () => {
    const a = [-1, -2, -3];
    const b = [1, 2, 3];
    const similarity = cosineSimilarity(a, b);

    expect(similarity).toBeCloseTo(-1, 5);
  });

  it('should handle mixed positive and negative values', () => {
    const a = [1, -1, 1, -1];
    const b = [1, 1, 1, 1];
    const similarity = cosineSimilarity(a, b);

    expect(similarity).toBeCloseTo(0, 5);
  });
});
