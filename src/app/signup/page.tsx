import { redirect } from 'next/navigation';

/**
 * Signup page - redirects to Athenius Search for centralized auth
 * This is a fallback; middleware should handle the redirect first
 */
export default function SignupPage() {
  const authBaseUrl = process.env.NEXT_PUBLIC_AUTH_BASE_URL || 'https://athenius.io';
  const docsUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://docs.athenius.io';

  redirect(`${authBaseUrl}/auth/signup?redirectTo=${encodeURIComponent(docsUrl)}`);
}
