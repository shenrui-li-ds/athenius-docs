'use client';

import { useState } from 'react';
import type { FileUpload } from '@/lib/types';

interface FileListProps {
  files: FileUpload[];
  selectedIds: string[];
  onSelect: (fileId: string) => void;
  onDelete: (fileId: string) => void;
  onToggleEntities?: (fileId: string, enabled: boolean) => Promise<void>;
}

export function FileList({ files, selectedIds, onSelect, onDelete, onToggleEntities }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-secondary)]">
        No files uploaded yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {files.map((file) => (
        <FileItem
          key={file.id}
          file={file}
          isSelected={selectedIds.includes(file.id)}
          onSelect={() => onSelect(file.id)}
          onDelete={() => onDelete(file.id)}
          onToggleEntities={onToggleEntities}
        />
      ))}
    </div>
  );
}

interface FileItemProps {
  file: FileUpload;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onToggleEntities?: (fileId: string, enabled: boolean) => Promise<void>;
}

function FileItem({ file, isSelected, onSelect, onDelete, onToggleEntities }: FileItemProps) {
  const [isTogglingEntities, setIsTogglingEntities] = useState(false);

  const isReady = file.status === 'ready';
  const isProcessing = file.status === 'processing' || file.status === 'pending';

  const entitiesEnabled = file.entities_enabled || false;
  const entitiesStatus = file.entities_status;
  const entitiesProgress = file.entities_progress ?? 0;
  const isEntitiesProcessing = entitiesStatus === 'pending' || entitiesStatus === 'processing';
  const isEntitiesReady = entitiesEnabled && entitiesStatus === 'ready';

  const handleToggleEntities = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onToggleEntities || isTogglingEntities || isEntitiesProcessing || isEntitiesReady) return;

    setIsTogglingEntities(true);
    try {
      await onToggleEntities(file.id, true);
    } finally {
      setIsTogglingEntities(false);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border-color)] overflow-hidden">
      {/* Main file row */}
      <div
        className={`
          flex items-center gap-3 p-3 transition-colors
          ${isSelected && isReady ? 'bg-[var(--accent-muted)]' : 'bg-[var(--card-background)]'}
          ${isReady ? 'cursor-pointer hover:bg-[var(--hover-background)]' : ''}
        `}
        onClick={isReady ? onSelect : undefined}
      >
        {/* Checkbox for selection */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          disabled={!isReady}
          className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--accent-color)] focus:ring-[var(--accent-color)] disabled:opacity-50"
          onClick={(e) => e.stopPropagation()}
        />

        {/* File icon */}
        <div className="flex-shrink-0">
          <FileIcon fileType={file.file_type} />
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-[var(--text-primary)]">
            {file.original_filename}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            {formatFileSize(file.file_size)}
            {isReady && ` • ${file.chunk_count} chunks`}
          </p>
        </div>

        {/* Status badge */}
        <div className="flex-shrink-0">
          <StatusBadge
            status={file.status}
            error={file.error_message}
            hasEntities={isEntitiesReady}
          />
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-shrink-0 p-1.5 text-[var(--text-tertiary)] hover:text-red-500 transition-colors rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          title="Delete file"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Deep Analysis section - only show for ready files that don't have entities yet */}
      {isReady && onToggleEntities && !isEntitiesReady && (
        <div className="border-t border-[var(--border-color)] bg-[var(--background)] px-3 py-2">
          {isEntitiesProcessing ? (
            // Processing state - show progress
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Deep Analysis in progress
                  </span>
                  <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                    {entitiesProgress}%
                  </span>
                </div>
                <div className="h-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-all duration-300 rounded-full"
                    style={{ width: `${entitiesProgress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            // Ready to enable state - show button
            <button
              onClick={handleToggleEntities}
              disabled={isTogglingEntities}
              className={`
                w-full flex items-center gap-3 p-2 rounded-md transition-all text-left
                bg-purple-50 dark:bg-purple-900/20
                hover:bg-purple-100 dark:hover:bg-purple-900/30
                border border-purple-200 dark:border-purple-800
                ${isTogglingEntities ? 'opacity-60 cursor-wait' : 'cursor-pointer'}
              `}
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
                {isTogglingEntities ? (
                  <span className="block h-4 w-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                  Enable Deep Analysis
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400">
                  Extract entities & relationships for better multi-hop reasoning
                </p>
              </div>
              <svg className="h-5 w-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FileIcon({ fileType }: { fileType: string }) {
  return (
    <div className="w-8 h-8 rounded bg-[var(--hover-background)] flex items-center justify-center">
      <span className="text-xs font-medium text-[var(--text-secondary)] uppercase">
        {fileType}
      </span>
    </div>
  );
}

interface StatusBadgeProps {
  status: string;
  error?: string | null;
  hasEntities?: boolean;
}

function StatusBadge({ status, error, hasEntities }: StatusBadgeProps) {
  // If file is ready and has entities, show the enhanced badge
  if (status === 'ready' && hasEntities) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Enhanced
      </span>
    );
  }

  const statusConfig = {
    pending: { label: 'Pending', color: 'bg-[var(--hover-background)] text-[var(--text-secondary)]' },
    processing: { label: 'Processing', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
    ready: { label: 'Ready', color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
    error: { label: 'Error', color: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}
      title={error || undefined}
    >
      {status === 'processing' && (
        <span className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
      )}
      {config.label}
    </span>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
