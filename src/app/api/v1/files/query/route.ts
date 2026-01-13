/**
 * External API: Query documents
 * Used by Athenius Search to query user's documents
 * Supports streaming responses
 */

import { createAdminClient } from '@/lib/supabase/server';
import { entityBoostedSearch } from '@/lib/retrieval/semantic-search';
import { synthesize, synthesizeStream } from '@/lib/generation/synthesizer';
import { validateApiAuth, apiAuthError, rateLimitError } from '@/lib/api/auth';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limit';
import { NextResponse } from 'next/server';
import type { QueryMode, QueryStreamEvent } from '@/lib/types';

// Query constraints
const MAX_QUERY_LENGTH = 2000;
const MAX_FILE_IDS = 20;
const STREAM_TIMEOUT_MS = 120_000; // 2 minute timeout for streaming

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

    // Check rate limit
    const rateLimit = checkRateLimit(userId, 'query');
    if (!rateLimit.allowed) {
      return rateLimitError(rateLimit.retryAfter!);
    }

    const supabase = createAdminClient();

    // Parse request body
    const body = (await request.json()) as QueryRequestBody;
    const { query, fileIds, mode = 'simple', stream = false } = body;

    // Validate and sanitize query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `Query too long. Maximum ${MAX_QUERY_LENGTH} characters.` },
        { status: 400 }
      );
    }

    // Validate fileIds
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: 'At least one file ID is required' }, { status: 400 });
    }

    if (fileIds.length > MAX_FILE_IDS) {
      return NextResponse.json(
        { error: `Too many files. Maximum ${MAX_FILE_IDS} files per query.` },
        { status: 400 }
      );
    }

    // Validate all fileIds are valid UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const invalidIds = fileIds.filter(id => !uuidRegex.test(id));
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: 'Invalid file ID format' }, { status: 400 });
    }

    // Verify user owns all the files and they are ready
    const { data: files, error: filesError } = await supabase
      .from('file_uploads')
      .select('id, status')
      .eq('user_id', userId)
      .in('id', fileIds);

    if (filesError) {
      console.error('API: Failed to verify files:', filesError);
      return NextResponse.json({ error: 'Failed to verify files' }, { status: 500 });
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

    // Sanitize query - remove potential prompt injection markers
    const sanitizedQuery = query.trim()
      .replace(/```/g, '')
      .replace(/<\/?[a-z][^>]*>/gi, ''); // Remove HTML-like tags

    // Perform entity-boosted search
    const chunks = await entityBoostedSearch(sanitizedQuery, fileIds, topK);

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
          // Set up timeout
          const timeoutId = setTimeout(() => {
            const timeoutEvent: QueryStreamEvent = {
              type: 'error',
              message: 'Stream timeout exceeded',
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(timeoutEvent)}\n\n`));
            controller.close();
          }, STREAM_TIMEOUT_MS);

          try {
            for await (const event of synthesizeStream(sanitizedQuery, chunks, validMode)) {
              const data = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(data));

              if (event.type === 'error' || event.type === 'done') {
                clearTimeout(timeoutId);
                controller.close();
                return;
              }
            }
            clearTimeout(timeoutId);
            controller.close();
          } catch (error) {
            clearTimeout(timeoutId);
            console.error('API: Stream error:', error);
            const errorEvent: QueryStreamEvent = {
              type: 'error',
              message: 'Stream processing failed',
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
          ...getRateLimitHeaders(rateLimit),
        },
      });
    }

    // Non-streaming response
    const result = await synthesize(sanitizedQuery, chunks, validMode);
    return NextResponse.json(result, {
      headers: getRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    console.error('API: Query error:', error);
    return NextResponse.json(
      { error: 'Query failed. Please try again.' },
      { status: 500 }
    );
  }
}
