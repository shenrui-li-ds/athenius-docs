import Link from 'next/link';
import { AuthForm } from '@/components/AuthForm';
import { APP_ICON, APP_NAME } from '@/lib/branding';

export default function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--background)]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img
            src={APP_ICON}
            alt={APP_NAME}
            className="app-icon w-16 h-16 mx-auto mb-4"
            style={{ filter: 'brightness(0) saturate(100%) invert(91%) sepia(4%) saturate(398%) hue-rotate(182deg) brightness(95%) contrast(87%)' }}
          />
          <h1 className="text-2xl font-bold">Create an account</h1>
          <p className="text-[var(--text-secondary)] mt-2">
            Sign up to start using {APP_NAME}
          </p>
        </div>

        <AuthForm mode="signup" />

        <p className="text-center text-sm text-[var(--text-secondary)]">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
