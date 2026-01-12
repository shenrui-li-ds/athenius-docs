// Database operations for entity storage

import { createAdminClient } from '@/lib/supabase/server';
import type {
  DocumentEntity,
  EntityRelationship,
  EntityMention,
  ExtractedEntity,
  ExtractedRelationship,
  EntityType,
} from '@/lib/types';

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * Store extracted entities in the database
 * Returns a map of entity name -> entity ID for relationship linking
 */
export async function storeEntities(
  supabase: SupabaseClient,
  fileId: string,
  userId: string,
  entities: ExtractedEntity[],
  chunkIndex: number
): Promise<Map<string, string>> {
  const entityMap = new Map<string, string>();

  if (entities.length === 0) return entityMap;

  for (const entity of entities) {
    // Check if entity already exists for this file (by name or alias)
    const { data: existing } = await supabase
      .from('document_entities')
      .select('id, aliases, mention_count')
      .eq('file_id', fileId)
      .or(`name.ilike.${entity.name},aliases.cs.{${entity.name.toLowerCase()}}`)
      .maybeSingle();

    if (existing) {
      // Update existing entity: increment mention count and merge aliases
      const newAliases = mergeAliases(existing.aliases || [], entity.aliases || []);

      await supabase
        .from('document_entities')
        .update({
          mention_count: existing.mention_count + 1,
          aliases: newAliases,
        })
        .eq('id', existing.id);

      entityMap.set(entity.name.toLowerCase(), existing.id);
    } else {
      // Insert new entity
      const { data: inserted, error } = await supabase
        .from('document_entities')
        .insert({
          file_id: fileId,
          user_id: userId,
          name: entity.name,
          entity_type: entity.type,
          aliases: entity.aliases || [],
          description: entity.description || null,
          first_mention_chunk: chunkIndex,
          mention_count: 1,
        })
        .select('id')
        .single();

      if (error) {
        console.error(`Failed to insert entity ${entity.name}:`, error);
        continue;
      }

      if (inserted) {
        entityMap.set(entity.name.toLowerCase(), inserted.id);
        // Also map aliases
        for (const alias of entity.aliases || []) {
          entityMap.set(alias.toLowerCase(), inserted.id);
        }
      }
    }
  }

  return entityMap;
}

/**
 * Store relationships between entities
 */
export async function storeRelationships(
  supabase: SupabaseClient,
  fileId: string,
  relationships: ExtractedRelationship[],
  entityMap: Map<string, string>,
  chunkId: string
): Promise<void> {
  if (relationships.length === 0) return;

  for (const rel of relationships) {
    const sourceId = entityMap.get(rel.source.toLowerCase());
    const targetId = entityMap.get(rel.target.toLowerCase());

    if (!sourceId || !targetId) {
      console.warn(`Skipping relationship: missing entity. Source: ${rel.source}, Target: ${rel.target}`);
      continue;
    }

    // Check if relationship already exists
    const { data: existing } = await supabase
      .from('entity_relationships')
      .select('id, evidence_chunk_ids')
      .eq('source_entity_id', sourceId)
      .eq('target_entity_id', targetId)
      .eq('relationship_type', rel.type)
      .maybeSingle();

    if (existing) {
      // Add chunk to evidence if not already present
      const evidenceIds = existing.evidence_chunk_ids || [];
      if (!evidenceIds.includes(chunkId)) {
        await supabase
          .from('entity_relationships')
          .update({
            evidence_chunk_ids: [...evidenceIds, chunkId],
          })
          .eq('id', existing.id);
      }
    } else {
      // Insert new relationship
      const { error } = await supabase
        .from('entity_relationships')
        .insert({
          file_id: fileId,
          source_entity_id: sourceId,
          target_entity_id: targetId,
          relationship_type: rel.type,
          evidence_chunk_ids: [chunkId],
          confidence: 1.0,
        });

      if (error) {
        console.error(`Failed to insert relationship ${rel.source} -> ${rel.target}:`, error);
      }
    }
  }
}

/**
 * Store entity mentions (which chunks mention which entities)
 */
export async function storeMentions(
  supabase: SupabaseClient,
  chunkId: string,
  chunkContent: string,
  entityMap: Map<string, string>,
  mentionedNames: string[]
): Promise<void> {
  const mentions: Array<{
    entity_id: string;
    chunk_id: string;
    mention_text: string;
    context: string;
  }> = [];

  for (const name of mentionedNames) {
    const entityId = entityMap.get(name.toLowerCase());
    if (!entityId) continue;

    // Find the mention in the content for context
    const mentionIndex = chunkContent.toLowerCase().indexOf(name.toLowerCase());
    let context = '';
    if (mentionIndex >= 0) {
      const start = Math.max(0, mentionIndex - 50);
      const end = Math.min(chunkContent.length, mentionIndex + name.length + 50);
      context = chunkContent.slice(start, end);
    }

    mentions.push({
      entity_id: entityId,
      chunk_id: chunkId,
      mention_text: name,
      context,
    });
  }

  if (mentions.length === 0) return;

  const { error } = await supabase
    .from('entity_mentions')
    .insert(mentions);

  if (error) {
    console.error('Failed to store mentions:', error);
  }
}

/**
 * Update entity extraction status for a file
 */
export async function updateEntityStatus(
  supabase: SupabaseClient,
  fileId: string,
  status: 'pending' | 'processing' | 'ready' | 'error',
  errorMessage?: string
): Promise<void> {
  const updates: Record<string, unknown> = { entities_status: status };

  if (errorMessage) {
    // Could store error in a separate field if needed
    console.error(`Entity extraction error for ${fileId}:`, errorMessage);
  }

  const { error } = await supabase
    .from('file_uploads')
    .update(updates)
    .eq('id', fileId);

  if (error) {
    console.error('Failed to update entity status:', error);
  }
}

/**
 * Get chunk IDs for a file
 */
export async function getFileChunkIds(
  supabase: SupabaseClient,
  fileId: string
): Promise<Array<{ id: string; chunk_index: number; content: string }>> {
  const { data, error } = await supabase
    .from('file_chunks')
    .select('id, chunk_index, content')
    .eq('file_id', fileId)
    .order('chunk_index', { ascending: true });

  if (error) {
    throw new Error(`Failed to get chunks: ${error.message}`);
  }

  return data || [];
}

/**
 * Delete all entities for a file (for reprocessing)
 */
export async function deleteFileEntities(
  supabase: SupabaseClient,
  fileId: string
): Promise<void> {
  // Cascade delete handles relationships and mentions
  const { error } = await supabase
    .from('document_entities')
    .delete()
    .eq('file_id', fileId);

  if (error) {
    throw new Error(`Failed to delete entities: ${error.message}`);
  }
}

/**
 * Merge alias arrays, removing duplicates (case-insensitive)
 */
function mergeAliases(existing: string[], newAliases: string[]): string[] {
  const seen = new Set(existing.map(a => a.toLowerCase()));
  const merged = [...existing];

  for (const alias of newAliases) {
    if (!seen.has(alias.toLowerCase())) {
      merged.push(alias);
      seen.add(alias.toLowerCase());
    }
  }

  return merged;
}
