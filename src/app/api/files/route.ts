import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/files - List all files for the current user
export async function GET(request: Request) {
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

    // Parse query params
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build query
    let query = supabase
      .from('file_uploads')
      .select('id, filename, original_filename, file_type, file_size, status, chunk_count, created_at, expires_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    const { data: files, error: filesError } = await query;

    if (filesError) {
      // Check if table doesn't exist (migration not run)
      if (filesError.message.includes('relation') && filesError.message.includes('does not exist')) {
        console.warn('file_uploads table does not exist. Run the database migration.');
        return NextResponse.json({
          files: [],
          pagination: { limit, offset, total: 0 },
          warning: 'Database not initialized. Please run the migration.',
        });
      }
      throw new Error(`Failed to list files: ${filesError.message}`);
    }

    return NextResponse.json({
      files: files || [],
      pagination: {
        limit,
        offset,
        total: files?.length || 0,
      },
    });
  } catch (error) {
    console.error('List files error:', error);
    return NextResponse.json(
      { error: 'Failed to list files' },
      { status: 500 }
    );
  }
}
