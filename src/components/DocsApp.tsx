'use client';

import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import type { FileUpload, QueryMode, Source } from '@/lib/types';
import { FileUploader } from './FileUploader';
import { FileList } from './FileList';
import { QueryInput } from './QueryInput';
import { ResultDisplay } from './ResultDisplay';
import { UserMenu } from './UserMenu';

interface DocsAppProps {
  user: User;
}

export function DocsApp({ user }: DocsAppProps) {
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [isQuerying, setIsQuerying] = useState(false);
  const [result, setResult] = useState<{ content: string; sources: Source[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch files on mount
  useEffect(() => {
    fetchFiles();
  }, []);

  // Poll for file status updates
  useEffect(() => {
    const processingFiles = files.filter(
      (f) => f.status === 'pending' || f.status === 'processing'
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
      if (!response.ok) throw new Error('Failed to fetch files');
      const data = await response.json();
      setFiles(data.files || []);
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

  const handleQuery = async (query: string, mode: QueryMode) => {
    if (selectedFileIds.length === 0) {
      alert('Please select at least one file to query');
      return;
    }

    setIsQuerying(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/files/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setIsQuerying(false);
    }
  };

  const readyFiles = files.filter((f) => f.status === 'ready');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold">Athenius Docs</h1>
          </div>
          <UserMenu user={user} />
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
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
                  <span className="text-sm text-blue-600 dark:text-blue-400">
                    {selectedFileIds.length} selected
                  </span>
                )}
              </div>

              {isLoadingFiles ? (
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  ))}
                </div>
              ) : (
                <FileList
                  files={files}
                  selectedIds={selectedFileIds}
                  onSelect={handleSelectFile}
                  onDelete={handleDeleteFile}
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
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
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
