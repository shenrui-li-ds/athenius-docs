'use client';

import { useState } from 'react';
import type { QueryMode } from '@/lib/types';

interface QueryInputProps {
  onSubmit: (query: string, mode: QueryMode) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function QueryInput({ onSubmit, disabled, isLoading }: QueryInputProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<QueryMode>('simple');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !disabled && !isLoading) {
      onSubmit(query.trim(), mode);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question about your documents..."
          disabled={disabled || isLoading}
          className="flex-1 px-4 py-2 border border-[var(--border-color)] rounded-lg bg-[var(--card-background)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!query.trim() || disabled || isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              Searching...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
            </>
          )}
        </button>
      </div>

      <div className="flex gap-4 text-sm">
        <span className="text-[var(--text-secondary)]">Mode:</span>
        {(['simple', 'detailed'] as QueryMode[]).map((m) => (
          <label key={m} className="flex items-center gap-1 cursor-pointer text-[var(--text-primary)]">
            <input
              type="radio"
              name="mode"
              value={m}
              checked={mode === m}
              onChange={() => setMode(m)}
              disabled={disabled || isLoading}
              className="text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
            />
            <span className="capitalize">{m}</span>
          </label>
        ))}
      </div>
    </form>
  );
}
