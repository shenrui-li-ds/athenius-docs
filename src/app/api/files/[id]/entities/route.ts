import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import {
  enableEntityExtraction,
  disableEntityExtraction,
  getFileEntityStats,
} from '@/lib/entities';

// GET /api/files/[id]/entities - Get entity extraction status and stats
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

    // Get file to check ownership and entity status
    const { data: file, error: fileError } = await supabase
      .from('file_uploads')
      .select('id, entities_enabled, entities_status')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Get entity statistics if enabled
    let stats = null;
    if (file.entities_enabled && file.entities_status === 'ready') {
      stats = await getFileEntityStats(fileId);
    }

    return NextResponse.json({
      fileId,
      entitiesEnabled: file.entities_enabled || false,
      entitiesStatus: file.entities_status,
      stats,
    });
  } catch (error) {
    console.error('Get entities error:', error);
    return NextResponse.json(
      { error: 'Failed to get entity status' },
      { status: 500 }
    );
  }
}

// POST /api/files/[id]/entities - Enable entity extraction
export async function POST(
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

    // Get file to check ownership and status
    const { data: file, error: fileError } = await supabase
      .from('file_uploads')
      .select('id, status, entities_enabled, entities_status')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // File must be ready for entity extraction
    if (file.status !== 'ready') {
      return NextResponse.json(
        { error: 'File must be processed before enabling entity extraction' },
        { status: 400 }
      );
    }

    // Check if already processing
    if (file.entities_status === 'processing') {
      return NextResponse.json(
        { error: 'Entity extraction is already in progress' },
        { status: 400 }
      );
    }

    // Start entity extraction (runs in background but we wait for completion)
    // In production, this could be moved to a background job
    console.log(`Starting entity extraction for file ${fileId}`);
    await enableEntityExtraction(fileId, user.id);

    // Get stats after completion
    const stats = await getFileEntityStats(fileId);

    return NextResponse.json({
      success: true,
      message: 'Entity extraction completed',
      stats,
    });
  } catch (error) {
    console.error('Enable entities error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enable entity extraction' },
      { status: 500 }
    );
  }
}

// DELETE /api/files/[id]/entities - Disable entity extraction and remove entities
export async function DELETE(
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

    // Get file to check ownership
    const { data: file, error: fileError } = await supabase
      .from('file_uploads')
      .select('id')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Disable entity extraction
    await disableEntityExtraction(fileId);

    return NextResponse.json({
      success: true,
      message: 'Entity extraction disabled',
    });
  } catch (error) {
    console.error('Disable entities error:', error);
    return NextResponse.json(
      { error: 'Failed to disable entity extraction' },
      { status: 500 }
    );
  }
}
