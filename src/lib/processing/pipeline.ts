import { createAdminClient } from '@/lib/supabase/server';
import { downloadFile } from '@/lib/supabase/storage';
import { extractContent } from '@/lib/extraction';
import { chunkDocument } from '@/lib/chunking/chunker';
import { embedTexts } from '@/lib/embeddings/gemini';
import type { FileUpload, FileChunk, Chunk } from '@/lib/types';

/**
 * Process a file: extract, chunk, embed, and store
 */
export async function processFile(fileId: string): Promise<void> {
  const supabase = createAdminClient();

  try {
    // 1. Update status to processing
    await updateFileStatus(supabase, fileId, 'processing');

    // 2. Get file metadata
    const { data: file, error: fileError } = await supabase
      .from('file_uploads')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      throw new Error(`File not found: ${fileId}`);
    }

    const fileUpload = file as FileUpload;

    // 3. Download file from storage
    const buffer = await downloadFile(fileUpload.storage_path);

    // 4. Extract text content
    const extractedContent = await extractContent(buffer, fileUpload.file_type);

    // 5. Chunk the content
    const chunks = chunkDocument(extractedContent);

    if (chunks.length === 0) {
      throw new Error('No content could be extracted from the file');
    }

    // 6. Generate embeddings in batches
    const chunkTexts = chunks.map((c) => c.content);
    const embeddings = await embedTexts(chunkTexts);

    // 7. Store chunks in database
    await storeChunks(supabase, fileUpload, chunks, embeddings);

    // 8. Update status to ready
    await updateFileStatus(supabase, fileId, 'ready', chunks.length);

    console.log(`Successfully processed file ${fileId}: ${chunks.length} chunks created`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error processing file ${fileId}:`, errorMessage);

    // Update status to error
    await updateFileStatus(supabase, fileId, 'error', undefined, errorMessage);
    throw error;
  }
}

/**
 * Update file status in database
 */
async function updateFileStatus(
  supabase: ReturnType<typeof createAdminClient>,
  fileId: string,
  status: string,
  chunkCount?: number,
  errorMessage?: string
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (chunkCount !== undefined) {
    updates.chunk_count = chunkCount;
  }

  if (errorMessage !== undefined) {
    updates.error_message = errorMessage;
  }

  const { error } = await supabase
    .from('file_uploads')
    .update(updates)
    .eq('id', fileId);

  if (error) {
    console.error(`Failed to update file status:`, error);
  }
}

/**
 * Store chunks with embeddings in database
 */
async function storeChunks(
  supabase: ReturnType<typeof createAdminClient>,
  file: FileUpload,
  chunks: Chunk[],
  embeddings: number[][]
): Promise<void> {
  // Prepare chunk records
  const chunkRecords: Omit<FileChunk, 'id' | 'created_at'>[] = chunks.map((chunk, index) => ({
    file_id: file.id,
    user_id: file.user_id,
    chunk_index: chunk.index,
    content: chunk.content,
    token_count: chunk.tokenCount,
    page_number: chunk.pageNumber ?? null,
    section_title: chunk.sectionTitle ?? null,
    embedding: embeddings[index],
  }));

  // Insert in batches to avoid hitting limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < chunkRecords.length; i += BATCH_SIZE) {
    const batch = chunkRecords.slice(i, i + BATCH_SIZE);

    const { error } = await supabase.from('file_chunks').insert(batch);

    if (error) {
      throw new Error(`Failed to store chunks: ${error.message}`);
    }
  }
}

/**
 * Delete all chunks for a file
 */
export async function deleteFileChunks(fileId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('file_chunks')
    .delete()
    .eq('file_id', fileId);

  if (error) {
    throw new Error(`Failed to delete chunks: ${error.message}`);
  }
}

/**
 * Reprocess a file (delete existing chunks and process again)
 */
export async function reprocessFile(fileId: string): Promise<void> {
  await deleteFileChunks(fileId);
  await processFile(fileId);
}
