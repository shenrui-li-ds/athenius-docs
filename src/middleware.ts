import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isValidTrustedUrl, getValidatedProtocol } from '@/lib/security/trusted-domains';

// Allowed tiers for accessing this app
const ALLOWED_TIERS = ['pro', 'admin'];

// Athenius Search URL for centralized auth
const AUTH_BASE_URL = process.env.NEXT_PUBLIC_AUTH_BASE_URL || 'https://athenius.io';

// Cookie domain for cross-subdomain auth (e.g., '.athenius.io')
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Helper to determine if we should use shared domain (not for localhost)
function shouldUseSharedDomain(host: string): boolean {
  return COOKIE_DOMAIN !== undefined && !host.startsWith('localhost');
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Determine if we should use shared domain (skip for localhost)
  // Use headers.host because nextUrl.host normalizes to localhost in dev
  const host = request.headers.get('host') || request.nextUrl.host;
  const useSharedDomain = shouldUseSharedDomain(host);

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
          cookiesToSet.forEach(({ name, value, options }) => {
            // FIX #8: Explicitly set secure cookie attributes
            supabaseResponse.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: IS_PRODUCTION,
              sameSite: 'lax',
              ...(useSharedDomain && COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
            });
          });
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
    // FIX #3: Validate x-forwarded-proto header to prevent protocol spoofing
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const protocol = getValidatedProtocol(forwardedProto, IS_PRODUCTION);
    const host = request.headers.get('host') || request.nextUrl.host;
    const returnUrl = `${protocol}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`;

    // FIX #2: Validate the return URL before passing to AS
    if (!isValidTrustedUrl(returnUrl)) {
      // If the constructed URL is somehow invalid, use a safe default
      const loginUrl = new URL('/auth/login', AUTH_BASE_URL);
      return NextResponse.redirect(loginUrl);
    }

    // Redirect to Athenius Search login with validated redirectTo parameter
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
    const requestedRedirect = request.nextUrl.searchParams.get('redirectTo');

    // FIX #2: Validate redirectTo before passing to AS
    let returnUrl = request.nextUrl.origin; // Safe default
    if (requestedRedirect && isValidTrustedUrl(requestedRedirect)) {
      returnUrl = requestedRedirect;
    }

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
