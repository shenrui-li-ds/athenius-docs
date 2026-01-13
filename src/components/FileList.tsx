'use client';

import { useState } from 'react';
import type { FileUpload } from '@/lib/types';

interface FileListProps {
  files: FileUpload[];
  selectedIds: string[];
  onSelect: (fileId: string) => void;
  onDelete: (fileId: string) => Promise<void> | void;
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
  onDelete: () => Promise<void> | void;
  onToggleEntities?: (fileId: string, enabled: boolean) => Promise<void>;
}

function FileItem({ file, isSelected, onSelect, onDelete, onToggleEntities }: FileItemProps) {
  const [isTogglingEntities, setIsTogglingEntities] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`rounded-lg border transition-all duration-200 ${isDeleting ? 'border-red-300 dark:border-red-800 opacity-60' : 'border-[var(--border-color)]'}`}>
      {/* Main file row */}
      <div
        className={`
          flex items-center gap-3 p-3 transition-colors rounded-t-lg
          ${isDeleting ? 'bg-red-50 dark:bg-red-900/20' : isSelected && isReady ? 'bg-[var(--accent-muted)]' : 'bg-[var(--card-background)]'}
          ${isReady && !isDeleting ? 'cursor-pointer hover:bg-[var(--hover-background)]' : ''}
          ${isReady && onToggleEntities && !isEntitiesReady && !isDeleting ? '' : 'rounded-b-lg'}
        `}
        onClick={isReady && !isDeleting ? onSelect : undefined}
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
          onClick={handleDelete}
          disabled={isDeleting}
          className={`flex-shrink-0 p-1.5 transition-colors rounded ${
            isDeleting
              ? 'text-red-500 cursor-wait'
              : 'text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
          }`}
          title={isDeleting ? 'Deleting...' : 'Delete file'}
        >
          {isDeleting ? (
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Deep Analysis section - only show for ready files that don't have entities yet and not deleting */}
      {isReady && onToggleEntities && !isEntitiesReady && !isDeleting && (
        <div className="border-t border-[var(--border-color)] bg-[var(--background)] px-3 py-2 rounded-b-lg">
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
            // Ready to enable state - show button with instant tooltip
            <div className="relative group">
              <button
                onClick={handleToggleEntities}
                disabled={isTogglingEntities}
                className={`
                  w-full flex items-center justify-center gap-2 py-2 px-3 rounded-md transition-all
                  bg-purple-600 dark:bg-purple-700
                  hover:bg-purple-700 dark:hover:bg-purple-600
                  border border-purple-500 dark:border-purple-600
                  ${isTogglingEntities ? 'opacity-60 cursor-wait' : 'cursor-pointer'}
                `}
              >
                {isTogglingEntities ? (
                  <span className="block h-4 w-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
                <span className="text-sm font-medium text-white">
                  Enable Deep Analysis
                </span>
              </button>
              {/* Instant tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900/50 dark:bg-gray-700/50 backdrop-blur-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                Extract entities &amp; relationships for better multi-hop reasoning
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900/50 dark:border-t-gray-700/50" />
              </div>
            </div>
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
