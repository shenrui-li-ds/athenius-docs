'use client';

import { useState, useCallback } from 'react';
import { FILE_CONSTRAINTS } from '@/lib/types';

interface FileUploaderProps {
  onUpload: (files: File[]) => Promise<void>;
  disabled?: boolean;
}

export function FileUploader({ onUpload, disabled }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    await handleFiles(files);
  }, [disabled]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || disabled) return;
    const files = Array.from(e.target.files);
    await handleFiles(files);
    // Reset input
    e.target.value = '';
  }, [disabled]);

  const handleFiles = async (files: File[]) => {
    // Filter valid files
    const validFiles = files.filter((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return (
        FILE_CONSTRAINTS.supportedTypes.includes(extension as typeof FILE_CONSTRAINTS.supportedTypes[number]) &&
        file.size <= FILE_CONSTRAINTS.maxSizeBytes
      );
    });

    if (validFiles.length === 0) {
      alert(`No valid files selected. Supported types: ${FILE_CONSTRAINTS.supportedTypes.join(', ')}. Max size: ${FILE_CONSTRAINTS.maxSizeMB}MB`);
      return;
    }

    setIsUploading(true);
    try {
      await onUpload(validFiles);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
        ${isDragging ? 'border-[var(--accent-color)] bg-[var(--accent-muted)]' : 'border-[var(--border-color)]'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-[var(--text-tertiary)]'}
      `}
    >
      <input
        type="file"
        multiple
        accept={FILE_CONSTRAINTS.supportedTypes.map((t) => `.${t}`).join(',')}
        onChange={handleFileSelect}
        disabled={disabled || isUploading}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />

      <div className="space-y-2">
        <div className="flex justify-center">
          {isUploading ? (
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[var(--accent-color)] border-t-transparent" />
          ) : (
            <svg
              className="h-10 w-10 text-[var(--text-tertiary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          )}
        </div>

        <p className="text-sm text-[var(--text-secondary)]">
          {isUploading ? 'Uploading...' : 'Drag and drop files here, or click to select'}
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">
          Supported: {FILE_CONSTRAINTS.supportedTypes.join(', ').toUpperCase()} (max {FILE_CONSTRAINTS.maxSizeMB}MB)
        </p>
      </div>
    </div>
  );
}
