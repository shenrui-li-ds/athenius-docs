/**
 * Trusted Domains Configuration for Athenius Docs
 *
 * Centralizes trusted domain management for redirect validation.
 * Production domains are always included; development domains are only
 * added when NEXT_PUBLIC_DEV_DOMAINS environment variable is set.
 */

// Production domains - always trusted
const PRODUCTION_DOMAINS = [
  'docs.athenius.io',
  'athenius.io',
  'www.athenius.io',
];

/**
 * Parse development domains from environment variable.
 * Format: comma-separated list, e.g., "localhost:3000,localhost:3001,docs.myapp.test:3001"
 */
function getDevDomains(): string[] {
  const devDomainsEnv = process.env.NEXT_PUBLIC_DEV_DOMAINS;
  if (!devDomainsEnv) return [];

  return devDomainsEnv
    .split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0);
}

/**
 * Get all trusted domains (production + development if configured)
 */
export function getTrustedDomains(): string[] {
  return [...PRODUCTION_DOMAINS, ...getDevDomains()];
}

/**
 * Check if a host exactly matches a trusted domain.
 * Does NOT allow arbitrary subdomains to prevent subdomain takeover attacks.
 */
export function isExactTrustedDomain(host: string): boolean {
  const trustedDomains = getTrustedDomains();
  return trustedDomains.includes(host);
}

/**
 * Validate a URL against trusted domains.
 * Only allows exact domain matches for security.
 */
export function isValidTrustedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isExactTrustedDomain(parsed.host);
  } catch {
    return false;
  }
}

/**
 * Validates that a redirect path/URL is safe.
 *
 * Allows:
 * - Relative paths (e.g., /dashboard)
 * - Full URLs to trusted domains (exact match only)
 *
 * Prevents:
 * - Open redirect attacks (//evil.com, /\evil.com, etc.)
 * - Subdomain takeover exploits
 */
export function isValidRedirectPath(path: string): boolean {
  // Check if it's a full URL to a trusted domain
  if (path.startsWith('https://') || path.startsWith('http://')) {
    return isValidTrustedUrl(path);
  }

  // Must start with single forward slash (relative path)
  if (!path.startsWith('/')) return false;

  // Must not start with // (protocol-relative URL)
  if (path.startsWith('//')) return false;

  // Must not contain backslash (some browsers interpret as forward slash)
  if (path.includes('\\')) return false;

  // Must not contain encoded slashes that could bypass checks
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith('//') || decoded.includes('\\')) return false;
  } catch {
    // Invalid encoding - reject
    return false;
  }

  // Must not contain protocol
  if (/^\/[a-z]+:/i.test(path)) return false;

  return true;
}

/**
 * Validates x-forwarded-proto header to prevent protocol spoofing.
 * Only allows 'http' or 'https' values, defaults to 'https' in production.
 */
export function getValidatedProtocol(
  forwardedProto: string | null,
  isProduction: boolean
): string {
  // In production, only trust https unless explicitly set
  if (isProduction) {
    // Only accept 'https' in production for security
    return 'https';
  }

  // In development, validate the header value
  if (forwardedProto === 'http' || forwardedProto === 'https') {
    return forwardedProto;
  }

  // Default to http in development
  return 'http';
}
