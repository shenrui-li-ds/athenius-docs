import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { FileStatusResponse } from '@/lib/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: fileId } = await params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get file status
    const { data: file, error: fileError } = await supabase
      .from('file_uploads')
      .select('id, status, chunk_count, error_message')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const response: FileStatusResponse = {
      fileId: file.id,
      status: file.status,
      chunkCount: file.chunk_count || undefined,
      error: file.error_message || undefined,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to get file status' },
      { status: 500 }
    );
  }
}
