/**
 * External API: File management endpoints
 * Used by Athenius Search to manage files for users
 */

import { createAdminClient } from '@/lib/supabase/server';
import { uploadFile } from '@/lib/supabase/storage';
import { processFile } from '@/lib/processing/pipeline';
import { validateApiAuth, apiAuthError, rateLimitError } from '@/lib/api/auth';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limit';
import { scanForMalware } from '@/lib/api/malware-scan';
import { FILE_CONSTRAINTS } from '@/lib/types';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

/**
 * GET /api/v1/files - List all files for a user
 */
export async function GET(request: Request) {
  try {
    // Validate API authentication
    const auth = validateApiAuth(request);
    if (!auth.success) {
      return apiAuthError(auth);
    }

    const { userId } = auth;

    // Check rate limit
    const rateLimit = checkRateLimit(userId, 'default');
    if (!rateLimit.allowed) {
      return rateLimitError(rateLimit.retryAfter!);
    }

    const supabase = createAdminClient();

    // Parse query params
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    // Build query
    let query = supabase
      .from('file_uploads')
      .select('id, filename, original_filename, file_type, file_size, status, chunk_count, created_at, expires_at, entities_enabled, entities_status, entities_progress')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by status if provided
    if (status && ['pending', 'processing', 'ready', 'error'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data: files, error: filesError } = await query;

    if (filesError) {
      console.error('API: List files DB error:', filesError);
      return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
    }

    return NextResponse.json({
      files: files || [],
      pagination: {
        limit,
        offset,
        total: files?.length || 0,
      },
    }, {
      headers: getRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    console.error('API: List files error:', error);
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
  }
}

/**
 * POST /api/v1/files - Upload a file for a user
 */
export async function POST(request: Request) {
  try {
    // Validate API authentication
    const auth = validateApiAuth(request);
    if (!auth.success) {
      return apiAuthError(auth);
    }

    const { userId } = auth;

    // Check rate limit (stricter for uploads)
    const rateLimit = checkRateLimit(userId, 'upload');
    if (!rateLimit.allowed) {
      return rateLimitError(rateLimit.retryAfter!);
    }

    const supabase = createAdminClient();

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

    if (file.size === 0) {
      return NextResponse.json({ error: 'Empty file not allowed' }, { status: 400 });
    }

    // Determine file type
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

    // Scan for malware using VirusTotal (with sampling to conserve quota)
    const scanResult = await scanForMalware(buffer, sanitizedFilename, fileType);
    if (!scanResult.clean) {
      console.warn(`Blocked malware upload from user ${userId}: ${scanResult.threat}`);
      return NextResponse.json(
        { error: 'File rejected: potential security threat detected' },
        { status: 400 }
      );
    }

    // Log scan status for monitoring
    if (scanResult.skippedReason) {
      console.log(`Malware scan skipped for ${sanitizedFilename}: ${scanResult.skippedReason}`);
    }

    // Upload to Supabase Storage
    const storagePath = await uploadFile(
      userId,
      fileId,
      sanitizedFilename,
      buffer,
      file.type || 'application/octet-stream'
    );

    // Create file record in database
    const { error: insertError } = await supabase.from('file_uploads').insert({
      id: fileId,
      user_id: userId,
      filename: sanitizedFilename,
      original_filename: file.name,
      file_type: fileType,
      file_size: file.size,
      storage_path: storagePath,
      status: 'pending',
    });

    if (insertError) {
      console.error('API: Failed to create file record:', insertError);
      return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
    }

    // Trigger async processing (don't await)
    processFile(fileId).catch((error) => {
      console.error(`Background processing error for ${fileId}:`, error);
    });

    return NextResponse.json({
      fileId,
      filename: sanitizedFilename,
      originalFilename: file.name,
      fileType,
      fileSize: file.size,
      status: 'pending',
      message: 'File uploaded, processing started',
      scanned: scanResult.scanned,
    }, {
      headers: getRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    console.error('API: Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

function getFileType(file: File): string | null {
  const mimeType = file.type.toLowerCase();
  const mimeTypeMap = FILE_CONSTRAINTS.supportedMimeTypes as Record<string, string>;

  if (mimeType in mimeTypeMap) {
    return mimeTypeMap[mimeType];
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && FILE_CONSTRAINTS.supportedTypes.includes(extension as typeof FILE_CONSTRAINTS.supportedTypes[number])) {
    return extension;
  }

  return null;
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\]/g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 255);
}
