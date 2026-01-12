/**
 * External API: Query documents
 * Used by Athenius Search to query user's documents
 * Supports streaming responses
 */

import { createAdminClient } from '@/lib/supabase/server';
import { entityBoostedSearch } from '@/lib/retrieval/semantic-search';
import { synthesize, synthesizeStream } from '@/lib/generation/synthesizer';
import { validateApiAuth, apiAuthError } from '@/lib/api/auth';
import { NextResponse } from 'next/server';
import type { QueryMode, QueryStreamEvent } from '@/lib/types';

interface QueryRequestBody {
  query: string;
  fileIds: string[];
  mode?: QueryMode;
  stream?: boolean;
}

/**
 * POST /api/v1/files/query - Query user's documents
 */
export async function POST(request: Request) {
  try {
    const auth = validateApiAuth(request);
    if (!auth.success) {
      return apiAuthError(auth);
    }

    const { userId } = auth;
    const supabase = createAdminClient();

    // Parse request body
    const body = (await request.json()) as QueryRequestBody;
    const { query, fileIds, mode = 'simple', stream = false } = body;

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
      .eq('user_id', userId)
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

    // Determine search parameters based on mode
    const topK = mode === 'detailed' || mode === 'deep' ? 25 : 10;

    // Perform entity-boosted search
    const chunks = await entityBoostedSearch(query.trim(), fileIds, topK);

    if (chunks.length === 0) {
      return NextResponse.json({
        content: 'No relevant content was found in the uploaded documents.',
        sources: [],
      });
    }

    const validMode: QueryMode = ['simple', 'detailed', 'deep'].includes(mode) ? mode : 'simple';

    // Check if client wants streaming
    if (stream) {
      const encoder = new TextEncoder();

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of synthesizeStream(query.trim(), chunks, validMode)) {
              const data = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(data));

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

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming response
    const result = await synthesize(query.trim(), chunks, validMode);
    return NextResponse.json(result);
  } catch (error) {
    console.error('API: Query error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Query failed' },
      { status: 500 }
    );
  }
}
