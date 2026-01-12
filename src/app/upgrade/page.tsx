'use client';

import Link from 'next/link';
import { APP_ICON, APP_NAME } from '@/lib/branding';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function UpgradePage() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <img
          src={APP_ICON}
          alt={APP_NAME}
          className="w-16 h-16 mx-auto mb-6 opacity-50"
          style={{ filter: 'brightness(0) saturate(100%) invert(91%) sepia(4%) saturate(398%) hue-rotate(182deg) brightness(95%) contrast(87%)' }}
        />

        <h1 className="text-2xl font-semibold mb-2">Pro Feature</h1>

        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {APP_NAME} is available exclusively for Pro and Admin users.
          Upgrade your Athenius Search subscription to access document analysis features.
        </p>

        <div className="space-y-3">
          <a
            href="https://search.athenius.ai/pricing"
            className="block w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Upgrade to Pro
          </a>

          <Link
            href="https://search.athenius.ai"
            className="block w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Back to Athenius Search
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">
            Already upgraded? Sign out and back in to refresh your subscription status.
          </p>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
