// Entity extraction module for Progressive HybridRAG
// Extracts entities and relationships from document chunks using Gemini LLM

import { callGeminiJSON } from '@/lib/gemini';
import type { ChatMessage } from '@/lib/gemini';
import { createAdminClient } from '@/lib/supabase/server';
import {
  ENTITY_EXTRACTION_SYSTEM_PROMPT,
  generateEntityExtractionPrompt,
  generateQueryEntityPrompt,
} from './prompts';
import {
  storeEntities,
  storeRelationships,
  storeMentions,
  updateEntityStatus,
  updateEntityProgress,
  getFileChunkIds,
  deleteFileEntities,
} from './storage';
import type {
  ExtractedEntity,
  ExtractedRelationship,
  EntityExtractionResult,
  EntityType,
} from '@/lib/types';

// Use Gemini for entity extraction
const EXTRACTION_MODEL = 'gemini-3-flash-preview';
const BATCH_SIZE = 3; // Number of chunks to process together (keep small to avoid token limits)
const PARALLEL_BATCHES = 8; // High parallelism for speed (Gemini handles concurrent requests well)
const MAX_RETRIES = 2;
const MAX_OUTPUT_TOKENS = 4096; // Enough for entity extraction from batch

/**
 * Extract entities and relationships from all chunks of a file
 * Uses parallel batch processing for speed with progress tracking
 */
export async function extractEntitiesFromFile(
  fileId: string,
  userId: string
): Promise<{ entityCount: number; relationshipCount: number }> {
  const supabase = createAdminClient();

  try {
    // Update status to processing with 0% progress
    await updateEntityStatus(supabase, fileId, 'processing');

    // Get all chunks for the file
    const chunks = await getFileChunkIds(supabase, fileId);
    console.log(`Extracting entities from ${chunks.length} chunks for file ${fileId}`);

    if (chunks.length === 0) {
      await updateEntityStatus(supabase, fileId, 'ready');
      return { entityCount: 0, relationshipCount: 0 };
    }

    // Delete existing entities (for reprocessing)
    await deleteFileEntities(supabase, fileId);

    // Global entity map for deduplication across batches
    const globalEntityMap = new Map<string, string>();
    let totalEntities = 0;
    let totalRelationships = 0;
    let processedBatches = 0;

    // Split chunks into batches
    const batches: typeof chunks[] = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      batches.push(chunks.slice(i, i + BATCH_SIZE));
    }
    const totalBatches = batches.length;

    // Process batches in parallel groups for speed
    for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
      // Check if file still exists (user might have deleted it mid-extraction)
      const { data: fileCheck } = await supabase
        .from('file_uploads')
        .select('id')
        .eq('id', fileId)
        .maybeSingle();

      if (!fileCheck) {
        console.log(`File ${fileId} was deleted, stopping extraction`);
        return { entityCount: totalEntities, relationshipCount: totalRelationships };
      }

      const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);
      console.log(`Processing batches ${i + 1}-${Math.min(i + PARALLEL_BATCHES, totalBatches)}/${totalBatches}`);

      // Process multiple batches in parallel
      const batchResults = await Promise.all(
        parallelBatches.map(async (batch) => {
          // Combine batch content for single LLM call
          const combinedContent = batch
            .map((c) => `[Chunk ${c.chunk_index}]\n${c.content}`)
            .join('\n\n---\n\n');

          // Extract entities from batch
          const result = await extractEntitiesFromText(combinedContent);
          return { batch, result };
        })
      );

      // Store results sequentially (to avoid race conditions on entity map)
      for (const { batch, result } of batchResults) {
        if (result.entities.length > 0) {
          // Store entities and get ID mapping
          const batchEntityMap = await storeEntities(
            supabase,
            fileId,
            userId,
            result.entities,
            batch[0].chunk_index
          );

          // Merge into global map
          for (const [name, id] of batchEntityMap) {
            globalEntityMap.set(name, id);
          }

          totalEntities += result.entities.length;

          // Store relationships
          if (result.relationships.length > 0) {
            await storeRelationships(
              supabase,
              fileId,
              result.relationships,
              globalEntityMap,
              batch[0].id
            );
            totalRelationships += result.relationships.length;
          }

          // Store mentions for each chunk
          for (const chunk of batch) {
            const mentionedNames = findMentionedEntities(chunk.content, result.entities);
            if (mentionedNames.length > 0) {
              await storeMentions(
                supabase,
                chunk.id,
                chunk.content,
                globalEntityMap,
                mentionedNames
              );
            }
          }
        }
        processedBatches++;
      }

      // Update progress after each parallel group
      const progress = Math.round((processedBatches / totalBatches) * 100);
      await updateEntityProgress(supabase, fileId, progress);
    }

    // Update status to ready
    await updateEntityStatus(supabase, fileId, 'ready');
    console.log(`Entity extraction complete: ${totalEntities} entities, ${totalRelationships} relationships`);

    return { entityCount: totalEntities, relationshipCount: totalRelationships };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Entity extraction failed for ${fileId}:`, message);
    await updateEntityStatus(supabase, fileId, 'error', message);
    throw error;
  }
}

/**
 * Extract entities and relationships from a text chunk using Gemini LLM
 */
async function extractEntitiesFromText(
  content: string,
  retryCount = 0
): Promise<EntityExtractionResult> {
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: ENTITY_EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: generateEntityExtractionPrompt(content) },
    ];

    const response = await callGeminiJSON<{
      entities?: unknown[];
      relationships?: unknown[];
    }>(messages, EXTRACTION_MODEL, {
      temperature: 0.1, // Low temperature for consistent extraction
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    return {
      entities: validateEntities(response.entities || []),
      relationships: validateRelationships(response.relationships || []),
    };
  } catch (error) {
    console.error('Entity extraction API error:', error);
    if (retryCount < MAX_RETRIES) {
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return extractEntitiesFromText(content, retryCount + 1);
    }
    return { entities: [], relationships: [] };
  }
}

/**
 * Extract entity names from a query string using Gemini
 */
export async function extractEntitiesFromQuery(query: string): Promise<string[]> {
  try {
    const messages: ChatMessage[] = [
      { role: 'user', content: generateQueryEntityPrompt(query) },
    ];

    const response = await callGeminiJSON<{ entities?: string[] }>(
      messages,
      EXTRACTION_MODEL,
      {
        temperature: 0,
        maxOutputTokens: 200,
      }
    );

    return Array.isArray(response.entities) ? response.entities : [];
  } catch (error) {
    console.error('Query entity extraction error:', error);
    return [];
  }
}

/**
 * Validate and sanitize extracted entities
 */
function validateEntities(entities: unknown[]): ExtractedEntity[] {
  if (!Array.isArray(entities)) return [];

  const validTypes: EntityType[] = ['character', 'location', 'object', 'event', 'organization'];

  return entities
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .filter(e => typeof e.name === 'string' && e.name.trim().length > 0)
    .map(e => ({
      name: String(e.name).trim(),
      type: validTypes.includes(e.type as EntityType)
        ? (e.type as EntityType)
        : 'character', // Default to character
      aliases: Array.isArray(e.aliases)
        ? e.aliases.filter((a): a is string => typeof a === 'string')
        : [],
      description: typeof e.description === 'string' ? e.description : undefined,
    }));
}

/**
 * Validate and sanitize extracted relationships
 */
function validateRelationships(relationships: unknown[]): ExtractedRelationship[] {
  if (!Array.isArray(relationships)) return [];

  return relationships
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .filter(r =>
      typeof r.source === 'string' &&
      typeof r.target === 'string' &&
      typeof r.type === 'string'
    )
    .map(r => ({
      source: String(r.source).trim(),
      target: String(r.target).trim(),
      type: String(r.type).trim().toLowerCase().replace(/\s+/g, '_'),
    }));
}

/**
 * Find which entities are mentioned in a chunk
 */
function findMentionedEntities(
  content: string,
  entities: ExtractedEntity[]
): string[] {
  const contentLower = content.toLowerCase();
  const mentioned: string[] = [];

  for (const entity of entities) {
    // Check main name
    if (contentLower.includes(entity.name.toLowerCase())) {
      mentioned.push(entity.name);
      continue;
    }

    // Check aliases
    for (const alias of entity.aliases || []) {
      if (contentLower.includes(alias.toLowerCase())) {
        mentioned.push(entity.name);
        break;
      }
    }
  }

  return mentioned;
}

/**
 * Check if a file has entity extraction enabled and ready
 */
export async function hasEntityExtraction(fileId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('file_uploads')
    .select('entities_enabled, entities_status')
    .eq('id', fileId)
    .single();

  return data?.entities_enabled === true && data?.entities_status === 'ready';
}

/**
 * Enable entity extraction for a file and trigger processing
 */
export async function enableEntityExtraction(
  fileId: string,
  userId: string
): Promise<void> {
  const supabase = createAdminClient();

  // Update flag
  await supabase
    .from('file_uploads')
    .update({
      entities_enabled: true,
      entities_status: 'pending',
    })
    .eq('id', fileId);

  // Start extraction (can be made async/background)
  await extractEntitiesFromFile(fileId, userId);
}

/**
 * Disable entity extraction and remove entities
 */
export async function disableEntityExtraction(fileId: string): Promise<void> {
  const supabase = createAdminClient();

  // Delete entities
  await deleteFileEntities(supabase, fileId);

  // Update flag
  await supabase
    .from('file_uploads')
    .update({
      entities_enabled: false,
      entities_status: null,
    })
    .eq('id', fileId);
}
