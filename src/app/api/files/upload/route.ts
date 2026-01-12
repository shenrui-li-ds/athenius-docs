import { createClient } from '@/lib/supabase/server';
import { uploadFile, getStoragePath } from '@/lib/supabase/storage';
import { processFile } from '@/lib/processing/pipeline';
import { FILE_CONSTRAINTS } from '@/lib/types';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size
    if (file.size > FILE_CONSTRAINTS.maxSizeBytes) {
      return NextResponse.json(
        { error: `File size exceeds ${FILE_CONSTRAINTS.maxSizeMB}MB limit` },
        { status: 400 }
      );
    }

    // Determine file type from mime type or extension
    const fileType = getFileType(file);
    if (!fileType) {
      return NextResponse.json(
        { error: `Unsupported file type. Supported types: ${FILE_CONSTRAINTS.supportedTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Generate unique file ID
    const fileId = uuidv4();

    // Sanitize filename
    const sanitizedFilename = sanitizeFilename(file.name);

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to Supabase Storage
    const storagePath = await uploadFile(
      user.id,
      fileId,
      sanitizedFilename,
      buffer,
      file.type || 'application/octet-stream'
    );

    // Create file record in database
    const { error: insertError } = await supabase.from('file_uploads').insert({
      id: fileId,
      user_id: user.id,
      filename: sanitizedFilename,
      original_filename: file.name,
      file_type: fileType,
      file_size: file.size,
      storage_path: storagePath,
      status: 'pending',
    });

    if (insertError) {
      throw new Error(`Failed to create file record: ${insertError.message}`);
    }

    // Trigger async processing (don't await)
    processFile(fileId).catch((error) => {
      console.error(`Background processing error for ${fileId}:`, error);
    });

    return NextResponse.json({
      fileId,
      filename: sanitizedFilename,
      status: 'pending',
      message: 'File uploaded, processing started',
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

function getFileType(file: File): string | null {
  // Check mime type first
  const mimeType = file.type.toLowerCase();
  const mimeTypeMap = FILE_CONSTRAINTS.supportedMimeTypes as Record<string, string>;

  if (mimeType in mimeTypeMap) {
    return mimeTypeMap[mimeType];
  }

  // Fall back to extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && FILE_CONSTRAINTS.supportedTypes.includes(extension as typeof FILE_CONSTRAINTS.supportedTypes[number])) {
    return extension;
  }

  return null;
}

function sanitizeFilename(filename: string): string {
  // Remove path separators and potentially dangerous characters
  return filename
    .replace(/[/\\]/g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 255); // Limit length
}
