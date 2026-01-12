import { createClient } from '@/lib/supabase/server';
import { semanticSearch, hybridSearch, entityBoostedSearch } from '@/lib/retrieval/semantic-search';
import { synthesize, synthesizeStream } from '@/lib/generation/synthesizer';
import { NextResponse } from 'next/server';
import type { QueryRequest, QueryMode, QueryStreamEvent } from '@/lib/types';

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

    // Determine search method and parameters based on mode
    const topK = mode === 'detailed' || mode === 'deep' ? 25 : 10;
    // Phase 3: Use entity-boosted search (falls back to semantic if no entities)
    const useEntitySearch = true;
    console.log(`Query: "${query.trim()}", fileIds: ${fileIds.join(', ')}, topK: ${topK}, entitySearch: ${useEntitySearch}`);

    // Perform search (entity-boosted for all modes, falls back gracefully)
    const chunks = useEntitySearch
      ? await entityBoostedSearch(query.trim(), fileIds, topK)
      : await semanticSearch(query.trim(), fileIds, topK);
    console.log(`Search returned ${chunks.length} chunks`);

    if (chunks.length === 0) {
      console.warn('No chunks found - returning empty result');
      return NextResponse.json({
        content: 'No relevant content was found in the uploaded documents.',
        sources: [],
      });
    }

    // Log the top chunks for debugging
    console.log('Top chunks:', chunks.slice(0, 3).map(c => ({
      similarity: c.similarity?.toFixed(4),
      method: c.retrievalMethod || 'semantic',
      contentPreview: c.content.substring(0, 100) + '...',
    })));

    const validMode: QueryMode = ['simple', 'detailed', 'deep'].includes(mode) ? mode : 'simple';

    // Check if client wants streaming
    // Temporarily disable streaming to debug - force non-streaming
    const acceptsStream = false; // request.headers.get('accept')?.includes('text/event-stream');

    if (acceptsStream) {
      // Return Server-Sent Events stream
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of synthesizeStream(query.trim(), chunks, validMode)) {
              const data = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(data));

              // If error event, also close the stream
              if (event.type === 'error') {
                controller.close();
                return;
              }
            }
            controller.close();
          } catch (error) {
            const errorEvent: QueryStreamEvent = {
              type: 'error',
              message: error instanceof Error ? error.message : 'Stream error',
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming fallback (existing behavior)
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
