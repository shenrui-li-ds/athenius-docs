import { createBrowserClient } from '@supabase/ssr';

// Cookie domain for cross-subdomain auth (e.g., '.athenius.io')
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: COOKIE_DOMAIN ? {
        // Share cookies across subdomains for SSO
        // All attributes must be set for cross-subdomain cookies to work
        domain: COOKIE_DOMAIN,
        sameSite: 'lax' as const,  // Required for cross-subdomain navigation
        secure: true,               // Required for HTTPS
        path: '/',                  // Ensure cookie is available site-wide
      } : undefined,
    }
  );
}
