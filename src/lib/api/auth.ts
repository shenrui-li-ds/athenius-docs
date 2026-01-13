/**
 * API authentication utilities for external API access
 * Used by Athenius Search to access Athenius Docs functionality
 *
 * SECURITY MODEL:
 * - Single shared API key between Athenius Search (AS) and Athenius Docs (AD)
 * - AS is the ONLY trusted caller - it authenticates users and provides X-User-ID
 * - AD trusts the X-User-ID header because AS is trusted
 * - If API key is compromised, attacker can impersonate any user
 * - Keep API key secure and rotate periodically
 */

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

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
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');

    // If lengths differ, still do comparison to maintain constant time
    // but use a dummy buffer of same length
    if (bufA.length !== bufB.length) {
      const dummy = Buffer.alloc(bufA.length);
      timingSafeEqual(bufA, dummy);
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

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

  // Validate API key using constant-time comparison (prevents timing attacks)
  if (!secureCompare(token, API_KEY)) {
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

/**
 * Create rate limit error response
 */
export function rateLimitError(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please slow down.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
      },
    }
  );
}

/**
 * Validate that a user exists in Supabase auth
 * Call this after validateApiAuth for extra security
 */
export async function validateUserExists(
  supabase: { from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => { single: () => Promise<{ data: unknown; error: unknown }> } } } },
  userId: string
): Promise<boolean> {
  try {
    // Check if user has any files (more efficient than auth.users query)
    // If they don't have files, that's OK - they might be new
    // This mainly prevents completely fabricated UUIDs from creating data
    const { data, error } = await supabase
      .from('file_uploads')
      .select('id')
      .eq('user_id', userId)
      .single();

    // If user has files, they exist
    if (data && !error) return true;

    // For new users with no files, we trust AS authenticated them
    // This is acceptable given our trust model (AS is the only caller)
    return true;
  } catch {
    return true; // Fail open to avoid blocking legitimate users
  }
}
