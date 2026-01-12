// Entity extraction module exports

export {
  extractEntitiesFromFile,
  extractEntitiesFromQuery,
  enableEntityExtraction,
  disableEntityExtraction,
  hasEntityExtraction,
} from './extractor';

export {
  storeEntities,
  storeRelationships,
  storeMentions,
  updateEntityStatus,
  getFileChunkIds,
  deleteFileEntities,
} from './storage';

export {
  ENTITY_EXTRACTION_SYSTEM_PROMPT,
  generateEntityExtractionPrompt,
  generateQueryEntityPrompt,
} from './prompts';

export {
  expandQueryWithEntities,
  getChunksWithEntityInfo,
  anyFileHasEntities,
  getFileEntityStats,
} from './entity-search';
