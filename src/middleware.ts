import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Allowed tiers for accessing this app
const ALLOWED_TIERS = ['pro', 'admin'];

// Athenius Search URL for centralized auth
const AUTH_BASE_URL = process.env.NEXT_PUBLIC_AUTH_BASE_URL || 'https://athenius.io';

// Cookie domain for cross-subdomain auth (e.g., '.athenius.io')
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              // Share cookies across subdomains for SSO
              domain: COOKIE_DOMAIN,
            })
          );
        },
      },
    }
  );

  // Refreshing the auth token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes - redirect to AS login if not authenticated
  const protectedPaths = ['/', '/library'];
  const isProtectedPath = protectedPaths.some(
    (path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith('/api/files')
  );

  if (isProtectedPath && !user) {
    // Build the return URL (current page on docs.athenius.io)
    const returnUrl = request.nextUrl.href;
    // Redirect to Athenius Search login with redirectTo parameter
    const loginUrl = new URL('/auth/login', AUTH_BASE_URL);
    loginUrl.searchParams.set('redirectTo', returnUrl);
    return NextResponse.redirect(loginUrl);
  }

  // Check user tier for protected paths (must be pro or admin)
  if (isProtectedPath && user) {
    const { data: userLimits } = await supabase
      .from('user_limits')
      .select('user_tier')
      .eq('user_id', user.id)
      .single();

    const userTier = userLimits?.user_tier || 'free';

    if (!ALLOWED_TIERS.includes(userTier)) {
      const url = request.nextUrl.clone();
      url.pathname = '/upgrade';
      return NextResponse.redirect(url);
    }
  }

  // Redirect login/signup to AS (Docs doesn't handle auth locally)
  if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup') {
    const authPath = request.nextUrl.pathname === '/login' ? '/auth/login' : '/auth/signup';
    const returnUrl = request.nextUrl.searchParams.get('redirectTo') || request.nextUrl.origin;
    const authUrl = new URL(authPath, AUTH_BASE_URL);
    authUrl.searchParams.set('redirectTo', returnUrl);
    return NextResponse.redirect(authUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
