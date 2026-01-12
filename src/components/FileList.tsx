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
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No files uploaded yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
  const isError = file.status === 'error';
  const isProcessing = file.status === 'processing' || file.status === 'pending';

  const entitiesEnabled = file.entities_enabled || false;
  const entitiesStatus = file.entities_status;
  const isEntitiesProcessing = entitiesStatus === 'pending' || entitiesStatus === 'processing';

  const handleToggleEntities = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onToggleEntities || isTogglingEntities || isEntitiesProcessing) return;

    setIsTogglingEntities(true);
    try {
      await onToggleEntities(file.id, !entitiesEnabled);
    } finally {
      setIsTogglingEntities(false);
    }
  };

  return (
    <div
      className={`
        flex items-center gap-3 p-3 rounded-lg border transition-colors
        ${isSelected && isReady ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}
        ${isReady ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''}
      `}
      onClick={isReady ? onSelect : undefined}
    >
      {/* Checkbox for selection */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onSelect}
        disabled={!isReady}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
        onClick={(e) => e.stopPropagation()}
      />

      {/* File icon */}
      <div className="flex-shrink-0">
        <FileIcon fileType={file.file_type} />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.original_filename}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {formatFileSize(file.file_size)}
          {isReady && ` • ${file.chunk_count} chunks`}
          {entitiesEnabled && entitiesStatus === 'ready' && ' • Entities'}
        </p>
      </div>

      {/* Entity toggle button - only show for ready files */}
      {isReady && onToggleEntities && (
        <button
          onClick={handleToggleEntities}
          disabled={isTogglingEntities || isEntitiesProcessing}
          className={`
            flex-shrink-0 p-1.5 rounded transition-colors
            ${entitiesEnabled && entitiesStatus === 'ready'
              ? 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30'
              : 'text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20'}
            ${(isTogglingEntities || isEntitiesProcessing) ? 'opacity-50 cursor-wait' : ''}
          `}
          title={
            isEntitiesProcessing
              ? 'Extracting entities...'
              : entitiesEnabled
              ? 'Deep Analysis enabled (click to disable)'
              : 'Enable Deep Analysis for better multi-hop reasoning'
          }
        >
          {isTogglingEntities || isEntitiesProcessing ? (
            <span className="block h-4 w-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
        </button>
      )}

      {/* Status */}
      <div className="flex-shrink-0">
        <StatusBadge status={file.status} error={file.error_message} />
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors"
        title="Delete file"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function FileIcon({ fileType }: { fileType: string }) {
  return (
    <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
        {fileType}
      </span>
    </div>
  );
}

function StatusBadge({ status, error }: { status: string; error?: string | null }) {
  const statusConfig = {
    pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
    processing: { label: 'Processing', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
    ready: { label: 'Ready', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
    error: { label: 'Error', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
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
