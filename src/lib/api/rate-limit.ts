/**
 * Simple in-memory rate limiter
 * Uses sliding window algorithm for fair rate limiting
 *
 * NOTE: This is per-instance. For multi-instance deployments,
 * use Redis-based rate limiting instead.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
}

// Default limits
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  query: { windowMs: 60_000, maxRequests: 30 },       // 30 queries/minute
  upload: { windowMs: 60_000, maxRequests: 10 },     // 10 uploads/minute
  entities: { windowMs: 60_000, maxRequests: 5 },    // 5 entity extractions/minute
  default: { windowMs: 60_000, maxRequests: 100 },   // 100 requests/minute
};

// In-memory store (per user per endpoint)
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number; // seconds until retry allowed
}

/**
 * Check rate limit for a user/endpoint combination
 */
export function checkRateLimit(
  userId: string,
  endpoint: string = 'default'
): RateLimitResult {
  const config = DEFAULT_LIMITS[endpoint] || DEFAULT_LIMITS.default;
  const key = `${userId}:${endpoint}`;
  const now = Date.now();

  let entry = store.get(key);

  // If no entry or window expired, create new entry
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    store.set(key, entry);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: entry.resetAt,
    };
  }

  // Check if over limit
  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter,
    };
  }

  // Increment count
  entry.count++;
  store.set(key, entry);

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };

  if (!result.allowed && result.retryAfter) {
    headers['Retry-After'] = String(result.retryAfter);
  }

  return headers;
}
