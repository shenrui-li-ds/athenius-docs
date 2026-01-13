import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // Browser client uses default cookie handling
  // SSO cookie domain is set server-side only (middleware/server.ts)
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
