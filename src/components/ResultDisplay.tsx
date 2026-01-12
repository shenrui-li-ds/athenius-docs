'use client';

import { useState } from 'react';
import type { Source } from '@/lib/types';

interface ResultDisplayProps {
  content: string;
  sources: Source[];
  isLoading?: boolean;
  error?: string;
}

export function ResultDisplay({ content, sources, isLoading, error }: ResultDisplayProps) {
  const [showSources, setShowSources] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!content) {
    return null;
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Response content */}
      <div className="p-6">
        <div className="prose dark:prose-invert max-w-none">
          {content.split('\n').map((paragraph, index) => (
            <p key={index} className="mb-2 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      {/* Sources section */}
      {sources.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowSources(!showSources)}
            className="w-full px-6 py-3 flex items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span>Sources ({sources.length})</span>
            <svg
              className={`h-4 w-4 transition-transform ${showSources ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showSources && (
            <div className="px-6 pb-4 space-y-3">
              {sources.map((source, index) => (
                <SourceCard key={source.id} source={source} index={index + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceCard({ source, index }: { source: Source; index: number }) {
  const [expanded, setExpanded] = useState(false);

  // Parse page from URL if available
  const pageMatch = source.url.match(/#page=(\d+)/);
  const page = pageMatch ? pageMatch[1] : null;

  return (
    <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm">
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-medium">
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{source.title}</p>
          {page && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Page {page}</p>
          )}
        </div>
      </div>

      <div className="mt-2 ml-8">
        <p className="text-gray-600 dark:text-gray-400">
          {expanded ? source.content : source.snippet}
        </p>
        {source.content.length > (source.snippet?.length || 0) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 text-blue-600 dark:text-blue-400 text-xs hover:underline"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </div>
  );
}
