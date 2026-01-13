/**
 * External API: Entity extraction management
 * Used by Athenius Search to manage entity extraction for user's files
 */

import { createAdminClient } from '@/lib/supabase/server';
import { validateApiAuth, apiAuthError, rateLimitError } from '@/lib/api/auth';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/api/rate-limit';
import {
  enableEntityExtraction,
  disableEntityExtraction,
  getFileEntityStats,
} from '@/lib/entities';
import { NextResponse } from 'next/server';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/files/[id]/entities - Get entity extraction status and stats
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

    // Check rate limit
    const rateLimit = checkRateLimit(userId, 'default');
    if (!rateLimit.allowed) {
      return rateLimitError(rateLimit.retryAfter!);
    }

    const { id: fileId } = await params;

    // Validate fileId format
    if (!UUID_REGEX.test(fileId)) {
      return NextResponse.json({ error: 'Invalid file ID format' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get file to check ownership and entity status
    const { data: file, error: fileError } = await supabase
      .from('file_uploads')
      .select('id, entities_enabled, entities_status, entities_progress')
      .eq('id', fileId)
      .eq('user_id', userId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Get entity statistics if enabled and ready
    let stats = null;
    if (file.entities_enabled && file.entities_status === 'ready') {
      stats = await getFileEntityStats(fileId);
    }

    return NextResponse.json({
      fileId,
      entitiesEnabled: file.entities_enabled || false,
      entitiesStatus: file.entities_status,
      entitiesProgress: file.entities_progress,
      stats,
    }, {
      headers: getRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    console.error('API: Get entities error:', error);
    return NextResponse.json(
      { error: 'Failed to get entity status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/files/[id]/entities - Enable entity extraction
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = validateApiAuth(request);
    if (!auth.success) {
      return apiAuthError(auth);
    }

    const { userId } = auth;

    // Check rate limit (stricter for entity extraction - expensive operation)
    const rateLimit = checkRateLimit(userId, 'entities');
    if (!rateLimit.allowed) {
      return rateLimitError(rateLimit.retryAfter!);
    }

    const { id: fileId } = await params;

    // Validate fileId format
    if (!UUID_REGEX.test(fileId)) {
      return NextResponse.json({ error: 'Invalid file ID format' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get file to check ownership and status
    const { data: file, error: fileError } = await supabase
      .from('file_uploads')
      .select('id, status, entities_enabled, entities_status')
      .eq('id', fileId)
      .eq('user_id', userId)
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

    // Start entity extraction in background (don't await)
    enableEntityExtraction(fileId, userId).catch((err) => {
      console.error(`Background entity extraction failed for ${fileId}:`, err);
    });

    return NextResponse.json({
      success: true,
      message: 'Entity extraction started',
      status: 'processing',
    }, {
      headers: getRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    console.error('API: Enable entities error:', error);
    return NextResponse.json(
      { error: 'Failed to enable entity extraction' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/files/[id]/entities - Disable entity extraction and remove entities
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

    // Check rate limit
    const rateLimit = checkRateLimit(userId, 'default');
    if (!rateLimit.allowed) {
      return rateLimitError(rateLimit.retryAfter!);
    }

    const { id: fileId } = await params;

    // Validate fileId format
    if (!UUID_REGEX.test(fileId)) {
      return NextResponse.json({ error: 'Invalid file ID format' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get file to check ownership
    const { data: file, error: fileError } = await supabase
      .from('file_uploads')
      .select('id')
      .eq('id', fileId)
      .eq('user_id', userId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Disable entity extraction
    await disableEntityExtraction(fileId);

    return NextResponse.json({
      success: true,
      message: 'Entity extraction disabled',
    }, {
      headers: getRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    console.error('API: Disable entities error:', error);
    return NextResponse.json(
      { error: 'Failed to disable entity extraction' },
      { status: 500 }
    );
  }
}
