import { createBrowserClient } from '@supabase/ssr';

// Cookie domain for cross-subdomain auth (e.g., '.athenius.io')
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        // Share cookies across subdomains for SSO
        domain: COOKIE_DOMAIN,
      },
    }
  );
}
