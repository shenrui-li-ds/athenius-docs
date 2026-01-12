import { createAdminClient } from './server';

const BUCKET_NAME = 'documents';

/**
 * Generate storage path for a file
 */
export function getStoragePath(userId: string, fileId: string, filename: string): string {
  return `${userId}/${fileId}/${filename}`;
}

/**
 * Upload a file to Supabase Storage
 */
export async function uploadFile(
  userId: string,
  fileId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const supabase = createAdminClient();
  const storagePath = getStoragePath(userId, fileId, filename);

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  return storagePath;
}

/**
 * Download a file from Supabase Storage
 */
export async function downloadFile(storagePath: string): Promise<Buffer> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (error) {
    throw new Error(`Failed to download file: ${error.message}`);
  }

  // Convert Blob to Buffer
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFile(storagePath: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Get a signed URL for a file (for temporary access)
 */
export async function getSignedUrl(
  storagePath: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new Error(`Failed to get signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Check if a file exists in storage
 */
export async function fileExists(storagePath: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(storagePath.split('/').slice(0, -1).join('/'), {
      limit: 1,
      search: storagePath.split('/').pop(),
    });

  if (error) return false;
  return data.length > 0;
}
