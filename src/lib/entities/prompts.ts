// Entity extraction prompts for Progressive HybridRAG

export const ENTITY_EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting entities and relationships from text. Your task is to identify named entities and the relationships between them.

## Entity Types
- character: People, fictional characters, named individuals
- location: Places, cities, buildings, geographic features
- object: Notable items, vehicles, weapons, artifacts
- event: Named events, incidents, happenings
- organization: Companies, groups, institutions

## Guidelines
1. Extract only named/specific entities, not generic concepts
2. Include aliases (nicknames, titles, alternate names)
3. Provide brief descriptions that help identify the entity
4. For relationships, identify the direction and type clearly
5. Only extract relationships that are explicitly stated or strongly implied
6. Focus on meaningful relationships that connect the narrative

## Output Format
Return valid JSON with this structure:
{
  "entities": [
    {
      "name": "Primary name used in text",
      "type": "character|location|object|event|organization",
      "aliases": ["nickname", "title", "other names"],
      "description": "Brief identifying description"
    }
  ],
  "relationships": [
    {
      "source": "Entity name (must match an entity above)",
      "target": "Entity name (must match an entity above)",
      "type": "relationship_verb (e.g., drives, loves, works_at, owns, located_in)"
    }
  ]
}`;

export const ENTITY_EXTRACTION_USER_PROMPT = `Extract all named entities and their relationships from the following text chunk.

<text>
{content}
</text>

Return only valid JSON matching the specified format. Do not include any explanation or markdown formatting.`;

export const QUERY_ENTITY_EXTRACTION_PROMPT = `Extract the named entities mentioned in this query. Only extract entities that are specifically named, not generic concepts.

Query: {query}

Return valid JSON:
{
  "entities": ["Entity Name 1", "Entity Name 2"]
}

Return only the JSON, no explanation.`;

/**
 * Generate the user prompt for entity extraction
 */
export function generateEntityExtractionPrompt(content: string): string {
  return ENTITY_EXTRACTION_USER_PROMPT.replace('{content}', content);
}

/**
 * Generate prompt for extracting entities from a query
 */
export function generateQueryEntityPrompt(query: string): string {
  return QUERY_ENTITY_EXTRACTION_PROMPT.replace('{query}', query);
}
