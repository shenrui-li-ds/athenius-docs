/**
 * Unit tests for API authentication middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateApiAuth, apiAuthError } from './auth';

// Helper to create mock Request
function createMockRequest(headers: Record<string, string> = {}): Request {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null,
    },
  } as unknown as Request;
}

describe('validateApiAuth', () => {
  const validApiKey = 'test-api-key-for-athenius-search';
  const validUserId = '123e4567-e89b-12d3-a456-426614174000';

  describe('API key validation', () => {
    it('should reject request when ATHENIUS_API_KEY is not configured', () => {
      const originalKey = process.env.ATHENIUS_API_KEY;
      delete process.env.ATHENIUS_API_KEY;

      const request = createMockRequest({
        authorization: `Bearer ${validApiKey}`,
        'x-user-id': validUserId,
      });

      const result = validateApiAuth(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(503);
        expect(result.error).toBe('API not configured');
      }

      process.env.ATHENIUS_API_KEY = originalKey;
    });

    it('should reject request without Authorization header', () => {
      const request = createMockRequest({
        'x-user-id': validUserId,
      });

      const result = validateApiAuth(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(401);
        expect(result.error).toBe('Missing Authorization header');
      }
    });

    it('should reject request with invalid Authorization format', () => {
      const request = createMockRequest({
        authorization: 'InvalidFormat',
        'x-user-id': validUserId,
      });

      const result = validateApiAuth(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(401);
        expect(result.error).toContain('Invalid Authorization header format');
      }
    });

    it('should reject request with wrong scheme (not Bearer)', () => {
      const request = createMockRequest({
        authorization: `Basic ${validApiKey}`,
        'x-user-id': validUserId,
      });

      const result = validateApiAuth(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(401);
      }
    });

    it('should reject request with invalid API key', () => {
      const request = createMockRequest({
        authorization: 'Bearer wrong-api-key',
        'x-user-id': validUserId,
      });

      const result = validateApiAuth(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(401);
        expect(result.error).toBe('Invalid API key');
      }
    });
  });

  describe('User ID validation', () => {
    it('should reject request without X-User-ID header', () => {
      const request = createMockRequest({
        authorization: `Bearer ${validApiKey}`,
      });

      const result = validateApiAuth(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(400);
        expect(result.error).toBe('Missing X-User-ID header');
      }
    });

    it('should reject request with invalid UUID format', () => {
      const request = createMockRequest({
        authorization: `Bearer ${validApiKey}`,
        'x-user-id': 'not-a-valid-uuid',
      });

      const result = validateApiAuth(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(400);
        expect(result.error).toContain('Invalid X-User-ID format');
      }
    });

    it('should reject request with malformed UUID', () => {
      const request = createMockRequest({
        authorization: `Bearer ${validApiKey}`,
        'x-user-id': '123e4567-e89b-12d3-a456', // too short
      });

      const result = validateApiAuth(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.status).toBe(400);
      }
    });
  });

  describe('successful authentication', () => {
    it('should accept valid request with all required headers', () => {
      const request = createMockRequest({
        authorization: `Bearer ${validApiKey}`,
        'x-user-id': validUserId,
      });

      const result = validateApiAuth(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe(validUserId);
      }
    });

    it('should accept Bearer token case-insensitively', () => {
      const request = createMockRequest({
        authorization: `BEARER ${validApiKey}`,
        'x-user-id': validUserId,
      });

      const result = validateApiAuth(request);

      expect(result.success).toBe(true);
    });

    it('should accept uppercase UUID', () => {
      const uppercaseUuid = '123E4567-E89B-12D3-A456-426614174000';
      const request = createMockRequest({
        authorization: `Bearer ${validApiKey}`,
        'x-user-id': uppercaseUuid,
      });

      const result = validateApiAuth(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe(uppercaseUuid);
      }
    });
  });
});

describe('apiAuthError', () => {
  it('should return NextResponse with error and status', () => {
    const errorResult = {
      success: false as const,
      error: 'Test error message',
      status: 401,
    };

    const response = apiAuthError(errorResult);

    expect(response.status).toBe(401);
  });
});
