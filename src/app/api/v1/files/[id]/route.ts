/**
 * External API: Single file operations
 * Used by Athenius Search to get/delete files for users
 */

import { createAdminClient } from '@/lib/supabase/server';
import { deleteFile } from '@/lib/supabase/storage';
import { deleteFileChunks } from '@/lib/processing/pipeline';
import { validateApiAuth, apiAuthError } from '@/lib/api/auth';
import { NextResponse } from 'next/server';

/**
 * GET /api/v1/files/[id] - Get file details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = validateApiAuth(request);
    if (!auth.success) {
      return apiAuthError(auth);
    }

    const { userId } = auth;
    const { id: fileId } = await params;
    const supabase = createAdminClient();

    // Get file details
    const { data: file, error: fileError } = await supabase
      .from('file_uploads')
      .select('id, filename, original_filename, file_type, file_size, status, chunk_count, created_at, expires_at, entities_enabled, entities_status, entities_progress, error_message')
      .eq('id', fileId)
      .eq('user_id', userId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({ file });
  } catch (error) {
    console.error('API: Get file error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get file' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/files/[id] - Delete a file
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = validateApiAuth(request);
    if (!auth.success) {
      return apiAuthError(auth);
    }

    const { userId } = auth;
    const { id: fileId } = await params;
    const supabase = createAdminClient();

    // Get file to verify ownership and get storage path
    const { data: file, error: fileError } = await supabase
      .from('file_uploads')
      .select('id, storage_path')
      .eq('id', fileId)
      .eq('user_id', userId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Delete chunks first (cascade should handle this, but be explicit)
    await deleteFileChunks(fileId);

    // Delete from storage
    await deleteFile(file.storage_path);

    // Delete file record
    const { error: deleteError } = await supabase
      .from('file_uploads')
      .delete()
      .eq('id', fileId);

    if (deleteError) {
      throw new Error(`Failed to delete file record: ${deleteError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    console.error('API: Delete file error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete file' },
      { status: 500 }
    );
  }
}
