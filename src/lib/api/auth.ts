/**
 * API authentication utilities for external API access
 * Used by Athenius Search to access Athenius Docs functionality
 */

import { NextResponse } from 'next/server';

export type ApiAuthResult =
  | {
      success: true;
      userId: string;
    }
  | {
      success: false;
      error: string;
      status: number;
    };

/**
 * Validate API request authentication
 * Checks for valid API key and user ID
 */
export function validateApiAuth(request: Request): ApiAuthResult {
  // Read API key at runtime (allows testing with different env values)
  const API_KEY = process.env.ATHENIUS_API_KEY;

  // Check if API key is configured
  if (!API_KEY) {
    console.error('ATHENIUS_API_KEY not configured');
    return {
      success: false,
      error: 'API not configured',
      status: 503,
    };
  }

  // Get authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return {
      success: false,
      error: 'Missing Authorization header',
      status: 401,
    };
  }

  // Validate Bearer token format
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return {
      success: false,
      error: 'Invalid Authorization header format. Use: Bearer <api_key>',
      status: 401,
    };
  }

  // Validate API key
  if (token !== API_KEY) {
    return {
      success: false,
      error: 'Invalid API key',
      status: 401,
    };
  }

  // Get user ID from header
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return {
      success: false,
      error: 'Missing X-User-ID header',
      status: 400,
    };
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return {
      success: false,
      error: 'Invalid X-User-ID format. Must be a valid UUID.',
      status: 400,
    };
  }

  return {
    success: true,
    userId,
  };
}

/**
 * Create error response for API authentication failures
 */
export function apiAuthError(result: Extract<ApiAuthResult, { success: false }>): NextResponse {
  return NextResponse.json(
    { error: result.error },
    { status: result.status }
  );
}
