'use client';

import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import type { FileUpload, QueryMode, Source, QueryStreamEvent } from '@/lib/types';
import { FileUploader } from './FileUploader';
import { FileList } from './FileList';
import { QueryInput } from './QueryInput';
import { ResultDisplay } from './ResultDisplay';
import { UserMenu } from './UserMenu';
import { APP_ICON, APP_NAME } from '@/lib/branding';

interface DocsAppProps {
  user: User;
}

export function DocsApp({ user }: DocsAppProps) {
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [isQuerying, setIsQuerying] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [result, setResult] = useState<{ content: string; sources: Source[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dbWarning, setDbWarning] = useState<string | null>(null);

  // Fetch files on mount
  useEffect(() => {
    fetchFiles();
  }, []);

  // Poll for file status updates (including entity extraction progress)
  useEffect(() => {
    const processingFiles = files.filter(
      (f) =>
        f.status === 'pending' ||
        f.status === 'processing' ||
        f.entities_status === 'pending' ||
        f.entities_status === 'processing'
    );

    if (processingFiles.length === 0) return;

    const interval = setInterval(() => {
      fetchFiles();
    }, 2000);

    return () => clearInterval(interval);
  }, [files]);

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files');
      const data = await response.json();

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 401) {
          console.warn('User not authenticated');
          return;
        }
        throw new Error(data.error || 'Failed to fetch files');
      }

      setFiles(data.files || []);

      // Check for database warning
      if (data.warning) {
        setDbWarning(data.warning);
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleUpload = async (uploadFiles: File[]) => {
    const uploadPromises = uploadFiles.map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    });

    try {
      await Promise.all(uploadPromises);
      await fetchFiles();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleSelectFile = useCallback((fileId: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId]
    );
  }, []);

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }

      // Remove from selected if selected
      setSelectedFileIds((prev) => prev.filter((id) => id !== fileId));

      // Refresh file list
      await fetchFiles();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleToggleEntities = async (fileId: string, enabled: boolean) => {
    try {
      if (enabled) {
        // Enable entity extraction (starts in background)
        const response = await fetch(`/api/files/${fileId}/entities`, {
          method: 'POST',
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to enable entity extraction');
        }

        // Immediately refresh to show processing status
        // The polling mechanism will pick up progress updates
        await fetchFiles();
      } else {
        // Disable entity extraction
        const response = await fetch(`/api/files/${fileId}/entities`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to disable entity extraction');
        }

        // Refresh file list to get updated entity status
        await fetchFiles();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Entity operation failed');
    }
  };

  const handleQuery = async (query: string, mode: QueryMode) => {
    if (selectedFileIds.length === 0) {
      alert('Please select at least one file to query');
      return;
    }

    setIsQuerying(true);
    setIsStreaming(true);
    setError(null);
    setResult({ content: '', sources: [] });

    try {
      const response = await fetch('/api/files/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          query,
          fileIds: selectedFileIds,
          mode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Query failed');
      }

      // Handle streaming response
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event: QueryStreamEvent = JSON.parse(line.slice(6));

                if (event.type === 'sources') {
                  setResult(prev => ({ content: prev?.content || '', sources: event.sources }));
                } else if (event.type === 'token') {
                  setResult(prev => ({
                    sources: prev?.sources || [],
                    content: (prev?.content || '') + event.content,
                  }));
                } else if (event.type === 'done') {
                  setIsStreaming(false);
                } else if (event.type === 'error') {
                  throw new Error(event.message);
                }
              } catch (parseErr) {
                console.warn('Failed to parse SSE event:', line);
              }
            }
          }
        }
      } else {
        // Fallback to non-streaming JSON response
        const data = await response.json();
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setIsQuerying(false);
      setIsStreaming(false);
    }
  };

  const readyFiles = files.filter((f) => f.status === 'ready');

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="bg-[var(--card-background)] border-b border-[var(--border-color)]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={APP_ICON}
              alt={APP_NAME}
              className="app-icon w-8 h-8"
              style={{ filter: 'brightness(0) saturate(100%) invert(91%) sepia(4%) saturate(398%) hue-rotate(182deg) brightness(95%) contrast(87%)' }}
            />
            <h1 className="app-title text-xl">{APP_NAME}</h1>
          </div>
          <UserMenu user={user} />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Database warning */}
        {dbWarning && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-amber-800 dark:text-amber-200 text-sm">
              <strong>Setup Required:</strong> {dbWarning}
            </p>
            <p className="text-amber-700 dark:text-amber-300 text-xs mt-1">
              Run the SQL migration in <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">supabase/migrations/001_add_docs_tables.sql</code>
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column: File upload and list */}
          <div className="lg:col-span-1 space-y-6">
            <div>
              <h2 className="text-lg font-medium mb-3">Upload Documents</h2>
              <FileUploader onUpload={handleUpload} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-medium">Your Files</h2>
                {selectedFileIds.length > 0 && (
                  <span className="text-sm text-[var(--accent-color)]">
                    {selectedFileIds.length} selected
                  </span>
                )}
              </div>

              {isLoadingFiles ? (
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-[var(--hover-background)] rounded-lg" />
                  ))}
                </div>
              ) : (
                <FileList
                  files={files}
                  selectedIds={selectedFileIds}
                  onSelect={handleSelectFile}
                  onDelete={handleDeleteFile}
                  onToggleEntities={handleToggleEntities}
                />
              )}
            </div>
          </div>

          {/* Right column: Query and results */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-lg font-medium mb-3">Ask a Question</h2>
              <QueryInput
                onSubmit={handleQuery}
                disabled={readyFiles.length === 0}
                isLoading={isQuerying}
              />
              {readyFiles.length === 0 && files.length > 0 && (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                  Waiting for files to finish processing...
                </p>
              )}
              {files.length === 0 && (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Upload documents to start asking questions.
                </p>
              )}
            </div>

            {(result || error || isQuerying) && (
              <div>
                <h2 className="text-lg font-medium mb-3">Answer</h2>
                <ResultDisplay
                  content={result?.content || ''}
                  sources={result?.sources || []}
                  isLoading={isQuerying}
                  isStreaming={isStreaming}
                  error={error || undefined}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
