'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Source } from '@/lib/types';

interface ResultDisplayProps {
  content: string;
  sources: Source[];
  isLoading?: boolean;
  isStreaming?: boolean;
  error?: string;
}

export function ResultDisplay({ content, sources, isLoading, isStreaming, error }: ResultDisplayProps) {
  const [showSources, setShowSources] = useState(false);

  // Show loading skeleton only when loading and no content yet
  if (isLoading && !content && sources.length === 0) {
    return (
      <div className="p-6 border border-[var(--border-color)] rounded-lg bg-[var(--card-background)]">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[var(--hover-background)] rounded w-3/4" />
          <div className="h-4 bg-[var(--hover-background)] rounded w-full" />
          <div className="h-4 bg-[var(--hover-background)] rounded w-5/6" />
          <div className="h-4 bg-[var(--hover-background)] rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  // Show component if we have sources or content (or streaming)
  if (!content && sources.length === 0 && !isStreaming) {
    return null;
  }

  return (
    <div className="border border-[var(--border-color)] rounded-lg overflow-hidden bg-[var(--card-background)]">
      {/* Response content */}
      <div className="p-6">
        {content ? (
          <div className="relative">
            <div className="markdown-content text-[var(--text-primary)]">
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {content}
              </ReactMarkdown>
            </div>
            {/* Show blinking cursor at end during streaming */}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-[var(--accent-color)] animate-pulse align-middle" />
            )}
          </div>
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="inline-block w-2 h-4 bg-[var(--accent-color)] animate-pulse" />
            <span className="text-sm">Generating response...</span>
          </div>
        ) : null}
      </div>

      {/* Sources section */}
      {sources.length > 0 && (
        <div className="border-t border-[var(--border-color)]">
          <button
            onClick={() => setShowSources(!showSources)}
            className="w-full px-6 py-3 flex items-center justify-between text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-background)] transition-colors"
          >
            <span className="flex items-center gap-2">
              Sources ({sources.length})
              {isStreaming && (
                <span className="text-xs text-[var(--accent-color)]">
                  Retrieved
                </span>
              )}
            </span>
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

  // Parse section from title if available (format: "filename, Page X - Section Name")
  const sectionMatch = source.title.match(/ - (.+)$/);
  const section = sectionMatch ? sectionMatch[1] : null;
  const displayTitle = section ? source.title.replace(/ - .+$/, '') : source.title;

  return (
    <div className="p-3 border border-[var(--border-color)] rounded-lg text-sm bg-[var(--background)]">
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent-muted)] text-[var(--accent-color)] flex items-center justify-center text-xs font-medium">
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-[var(--text-primary)]">{displayTitle}</p>
          <div className="flex flex-wrap gap-2 text-xs text-[var(--text-tertiary)]">
            {page && <span>Page {page}</span>}
            {section && (
              <>
                {page && <span>•</span>}
                <span className="italic">{section}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 ml-8">
        <p className="text-[var(--text-secondary)]">
          {expanded ? source.content : source.snippet}
        </p>
        {source.content.length > (source.snippet?.length || 0) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 text-[var(--accent-color)] text-xs hover:underline"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </div>
  );
}
