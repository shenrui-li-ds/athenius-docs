// Entity-based search expansion for Progressive HybridRAG
// Expands queries by finding related entities and their associated chunks

import { createAdminClient } from '@/lib/supabase/server';
import { extractEntitiesFromQuery } from './extractor';
import type {
  DocumentEntity,
  RelatedEntity,
  ChunkWithEntities,
  EntityQueryExpansion,
} from '@/lib/types';

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * Expand a query with related entities and find relevant chunks
 */
export async function expandQueryWithEntities(
  query: string,
  fileIds: string[]
): Promise<EntityQueryExpansion> {
  const supabase = createAdminClient();

  // 1. Extract entity names from query using LLM
  const queryEntityNames = await extractEntitiesFromQuery(query);
  console.log('Query entities:', queryEntityNames);

  if (queryEntityNames.length === 0) {
    return {
      queryEntities: [],
      relatedEntities: [],
      entityChunkIds: [],
    };
  }

  // 2. Find matching entities in database
  const queryEntities = await findEntitiesByNames(supabase, queryEntityNames, fileIds);
  console.log(`Found ${queryEntities.length} matching entities in database`);

  if (queryEntities.length === 0) {
    return {
      queryEntities: [],
      relatedEntities: [],
      entityChunkIds: [],
    };
  }

  // 3. Get related entities via relationship traversal
  const queryEntityIds = queryEntities.map(e => e.id);
  const relatedEntities = await getRelatedEntities(supabase, queryEntityIds);
  console.log(`Found ${relatedEntities.length} related entities`);

  // 4. Get chunks mentioning any of these entities
  const allEntityIds = [
    ...queryEntityIds,
    ...relatedEntities.map(e => e.id),
  ];
  const entityChunkIds = await getChunksForEntities(supabase, allEntityIds);
  console.log(`Found ${entityChunkIds.length} chunks mentioning entities`);

  return {
    queryEntities,
    relatedEntities: relatedEntities as unknown as DocumentEntity[],
    entityChunkIds,
  };
}

/**
 * Find entities by name or alias in the database
 */
async function findEntitiesByNames(
  supabase: SupabaseClient,
  names: string[],
  fileIds: string[]
): Promise<DocumentEntity[]> {
  const entities: DocumentEntity[] = [];

  for (const name of names) {
    // Use RPC function for alias matching
    const { data, error } = await supabase.rpc('find_entities_by_name', {
      search_name: name,
      file_ids: fileIds,
    });

    if (error) {
      console.error(`Error finding entity ${name}:`, error);
      continue;
    }

    if (data && data.length > 0) {
      // Add first match (highest mention count)
      const match = data[0];
      entities.push({
        id: match.id,
        file_id: match.file_id,
        user_id: '', // Not returned by RPC
        name: match.name,
        entity_type: match.entity_type,
        aliases: match.aliases || [],
        description: match.description,
        first_mention_chunk: null,
        mention_count: match.mention_count,
        created_at: '',
      });
    }
  }

  return entities;
}

/**
 * Get entities related to the given entities via relationships
 */
async function getRelatedEntities(
  supabase: SupabaseClient,
  entityIds: string[]
): Promise<RelatedEntity[]> {
  if (entityIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_related_entities', {
    entity_ids: entityIds,
    max_depth: 1, // Single hop for now
  });

  if (error) {
    console.error('Error getting related entities:', error);
    return [];
  }

  return (data || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    entity_type: r.entity_type as DocumentEntity['entity_type'],
    relationship_type: r.relationship_type as string,
    direction: r.direction as 'outgoing' | 'incoming',
    confidence: r.confidence as number,
  }));
}

/**
 * Get chunk IDs that mention any of the given entities
 */
async function getChunksForEntities(
  supabase: SupabaseClient,
  entityIds: string[]
): Promise<string[]> {
  if (entityIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_chunks_for_entities', {
    entity_ids: entityIds,
  });

  if (error) {
    console.error('Error getting chunks for entities:', error);
    return [];
  }

  return (data || []).map((c: { chunk_id: string }) => c.chunk_id);
}

/**
 * Get detailed chunk information with entity names
 */
export async function getChunksWithEntityInfo(
  supabase: SupabaseClient,
  entityIds: string[]
): Promise<ChunkWithEntities[]> {
  if (entityIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_chunks_for_entities', {
    entity_ids: entityIds,
  });

  if (error) {
    console.error('Error getting chunks with entities:', error);
    return [];
  }

  return (data || []).map((c: Record<string, unknown>) => ({
    chunk_id: c.chunk_id as string,
    content: c.content as string,
    page_number: c.page_number as number | undefined,
    section_title: c.section_title as string | undefined,
    file_id: c.file_id as string,
    filename: c.filename as string,
    entity_names: c.entity_names as string[],
  }));
}

/**
 * Check if any of the given files have entity extraction enabled
 */
export async function anyFileHasEntities(fileIds: string[]): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('file_uploads')
    .select('id')
    .in('id', fileIds)
    .eq('entities_enabled', true)
    .eq('entities_status', 'ready')
    .limit(1);

  return (data?.length || 0) > 0;
}

/**
 * Get entity statistics for a file
 */
export async function getFileEntityStats(
  fileId: string
): Promise<{ entityCount: number; relationshipCount: number } | null> {
  const supabase = createAdminClient();

  // Count entities
  const { count: entityCount, error: entityError } = await supabase
    .from('document_entities')
    .select('*', { count: 'exact', head: true })
    .eq('file_id', fileId);

  if (entityError) {
    console.error('Error counting entities:', entityError);
    return null;
  }

  // Count relationships
  const { count: relationshipCount, error: relError } = await supabase
    .from('entity_relationships')
    .select('*', { count: 'exact', head: true })
    .eq('file_id', fileId);

  if (relError) {
    console.error('Error counting relationships:', relError);
    return null;
  }

  return {
    entityCount: entityCount || 0,
    relationshipCount: relationshipCount || 0,
  };
}
