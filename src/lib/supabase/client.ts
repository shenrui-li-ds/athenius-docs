import { createBrowserClient } from '@supabase/ssr';

// Cookie domain for cross-subdomain auth (e.g., '.athenius.io')
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

// Helper to determine if we should use shared domain (not for localhost)
function shouldUseSharedDomain(): boolean {
  if (typeof window === 'undefined') return false;
  return COOKIE_DOMAIN !== undefined && !window.location.hostname.startsWith('localhost');
}

// Parse all cookies from document.cookie
function getAllCookies(): { name: string; value: string }[] {
  if (typeof document === 'undefined') return [];

  return document.cookie.split(';').map(cookie => {
    const [name, ...valueParts] = cookie.trim().split('=');
    return {
      name: name || '',
      value: decodeURIComponent(valueParts.join('=') || ''),
    };
  }).filter(c => c.name);
}

// Set all cookies with shared domain for cross-subdomain SSO
function setAllCookies(
  cookies: { name: string; value: string; options: Record<string, unknown> }[],
  useSharedDomain: boolean
): void {
  if (typeof document === 'undefined') return;

  for (const { name, value, options } of cookies) {
    const cookieParts = [
      `${name}=${encodeURIComponent(value)}`,
      `path=${(options.path as string) || '/'}`,
    ];

    if (options.maxAge !== undefined) {
      cookieParts.push(`max-age=${options.maxAge}`);
    }

    // Always use shared domain in production for cross-subdomain SSO
    if (useSharedDomain && COOKIE_DOMAIN) {
      cookieParts.push(`domain=${COOKIE_DOMAIN}`);
    }

    if (options.secure) {
      cookieParts.push('secure');
    }

    const sameSite = (options.sameSite as string) || 'lax';
    cookieParts.push(`samesite=${sameSite}`);

    document.cookie = cookieParts.join('; ');
  }
}

export function createClient() {
  const useSharedDomain = shouldUseSharedDomain();

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: getAllCookies,
        setAll: (cookies) => setAllCookies(cookies, useSharedDomain),
      },
    }
  );
}
