// Gemini API module exports

export {
  callGemini,
  callGeminiStream,
  callGeminiJSON,
  embedWithGemini,
  batchEmbedWithGemini,
} from './client';

export type {
  ChatMessage,
  LLMResponse,
  GeminiGenerationConfig,
  EmbeddingTaskType,
} from './client';
