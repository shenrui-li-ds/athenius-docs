import { createClient } from '@/lib/supabase/server';
import { semanticSearch } from '@/lib/retrieval/semantic-search';
import { synthesize } from '@/lib/generation/synthesizer';
import { NextResponse } from 'next/server';
import type { QueryRequest, QueryMode } from '@/lib/types';

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

    // Parse request body
    const body = (await request.json()) as QueryRequest;
    const { query, fileIds, mode = 'simple' } = body;

    // Validate request
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: 'At least one file ID is required' }, { status: 400 });
    }

    // Verify user owns all the files and they are ready
    const { data: files, error: filesError } = await supabase
      .from('file_uploads')
      .select('id, status')
      .eq('user_id', user.id)
      .in('id', fileIds);

    if (filesError) {
      throw new Error(`Failed to verify files: ${filesError.message}`);
    }

    if (!files || files.length !== fileIds.length) {
      return NextResponse.json(
        { error: 'One or more files not found or not owned by user' },
        { status: 404 }
      );
    }

    // Check all files are ready
    const notReadyFiles = files.filter((f) => f.status !== 'ready');
    if (notReadyFiles.length > 0) {
      return NextResponse.json(
        { error: 'One or more files are not ready for querying. Please wait for processing to complete.' },
        { status: 400 }
      );
    }

    // Perform semantic search
    const topK = mode === 'detailed' || mode === 'deep' ? 15 : 10;
    const chunks = await semanticSearch(query.trim(), fileIds, topK);

    if (chunks.length === 0) {
      return NextResponse.json({
        content: 'No relevant content was found in the uploaded documents.',
        sources: [],
      });
    }

    // Synthesize response
    const validMode: QueryMode = ['simple', 'detailed', 'deep'].includes(mode) ? mode : 'simple';
    const result = await synthesize(query.trim(), chunks, validMode);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Query error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Query failed' },
      { status: 500 }
    );
  }
}
