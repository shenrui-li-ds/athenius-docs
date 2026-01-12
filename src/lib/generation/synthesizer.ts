import OpenAI from 'openai';
import type { RetrievedChunk, Source, QueryMode } from '@/lib/types';
import {
  GROUNDED_SYSTEM_PROMPT,
  SIMPLE_SYSTEM_PROMPT,
  DETAILED_SYSTEM_PROMPT,
  generateUserPrompt,
} from './prompts';
import { assembleContext } from '@/lib/retrieval/semantic-search';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = 'gpt-4o-mini';

/**
 * Synthesize a response from retrieved chunks
 */
export async function synthesize(
  query: string,
  chunks: RetrievedChunk[],
  mode: QueryMode = 'simple'
): Promise<{ content: string; sources: Source[] }> {
  if (chunks.length === 0) {
    return {
      content: 'No relevant content was found in the uploaded documents to answer your question.',
      sources: [],
    };
  }

  // Assemble context from chunks
  const maxTokens = mode === 'detailed' ? 12000 : 6000;
  const { context, usedChunks } = assembleContext(chunks, maxTokens);

  // Select system prompt based on mode
  const systemPrompt = getSystemPrompt(mode);

  // Generate response
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: generateUserPrompt(query, context) },
    ],
    temperature: 0.3, // Lower temperature for more factual responses
    max_tokens: mode === 'detailed' ? 2000 : 1000,
  });

  const content = response.choices[0]?.message?.content || 'Unable to generate response.';

  // Convert used chunks to sources
  const sources = chunksToSources(usedChunks);

  return { content, sources };
}

/**
 * Get appropriate system prompt for query mode
 */
function getSystemPrompt(mode: QueryMode): string {
  switch (mode) {
    case 'simple':
      return SIMPLE_SYSTEM_PROMPT;
    case 'detailed':
      return DETAILED_SYSTEM_PROMPT;
    case 'deep':
      return DETAILED_SYSTEM_PROMPT; // Same as detailed for Phase 1
    default:
      return GROUNDED_SYSTEM_PROMPT;
  }
}

/**
 * Convert retrieved chunks to Source format (Tavily-compatible)
 */
function chunksToSources(chunks: RetrievedChunk[]): Source[] {
  return chunks.map((chunk) => {
    // Create file:// URL with page anchor if available
    const pageAnchor = chunk.page ? `#page=${chunk.page}` : '';
    const url = `file://${encodeURIComponent(chunk.filename)}${pageAnchor}`;

    // Create snippet (first 200 chars)
    const snippet = chunk.content.length > 200
      ? chunk.content.slice(0, 200) + '...'
      : chunk.content;

    return {
      id: chunk.id,
      title: chunk.filename,
      url,
      content: chunk.content,
      snippet,
    };
  });
}
