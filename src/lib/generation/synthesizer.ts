import { callGemini, callGeminiStream } from '@/lib/gemini';
import type { ChatMessage } from '@/lib/gemini';
import type { RetrievedChunk, Source, QueryMode, QueryStreamEvent } from '@/lib/types';
import {
  GROUNDED_SYSTEM_PROMPT,
  SIMPLE_SYSTEM_PROMPT,
  DETAILED_SYSTEM_PROMPT,
  generateUserPrompt,
} from './prompts';
import { assembleContext } from '@/lib/retrieval/semantic-search';

const MODEL = 'gemini-3-flash-preview';

/**
 * Synthesize a response from retrieved chunks using Gemini
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

  // Build messages for Gemini
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: generateUserPrompt(query, context) },
  ];

  // Generate response with Gemini
  const completionTokens = mode === 'detailed' ? 8192 : 4096;
  console.log(`Synthesizer: calling ${MODEL} with mode=${mode}, maxOutputTokens=${completionTokens}`);

  const response = await callGemini(messages, MODEL, {
    temperature: 0.3, // Lower temperature for more focused responses
    maxOutputTokens: completionTokens,
  });

  console.log('Synthesizer response:', JSON.stringify({
    hasContent: !!response.content,
    contentLength: response.content?.length,
    usage: response.usage,
  }));

  const content = response.content || 'Unable to generate response.';

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
 * Phase 2: Enhanced with section info in title
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

    // Build title with section info if available
    let title = chunk.filename;
    if (chunk.page) {
      title += `, Page ${chunk.page}`;
    }
    if (chunk.section) {
      title += ` - ${chunk.section}`;
    }

    return {
      id: chunk.id,
      title,
      url,
      content: chunk.content,
      snippet,
    };
  });
}

/**
 * Streaming synthesizer for real-time token delivery
 * Uses Gemini SSE streaming
 */
export async function* synthesizeStream(
  query: string,
  chunks: RetrievedChunk[],
  mode: QueryMode = 'simple'
): AsyncGenerator<QueryStreamEvent> {
  if (chunks.length === 0) {
    yield {
      type: 'sources',
      sources: [],
    };
    yield {
      type: 'token',
      content: 'No relevant content was found in the uploaded documents to answer your question.',
    };
    yield { type: 'done' };
    return;
  }

  // Assemble context from chunks
  const maxTokens = mode === 'detailed' ? 12000 : 6000;
  const { context, usedChunks } = assembleContext(chunks, maxTokens);

  // Convert chunks to sources and yield immediately
  const sources = chunksToSources(usedChunks);
  yield { type: 'sources', sources };

  // Select system prompt based on mode
  const systemPrompt = getSystemPrompt(mode);

  // Build messages for Gemini
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: generateUserPrompt(query, context) },
  ];

  try {
    // Get streaming response from Gemini
    const completionTokens = mode === 'detailed' ? 8192 : 4096;
    const response = await callGeminiStream(messages, MODEL, {
      temperature: 0.3,
      maxOutputTokens: completionTokens,
    });

    if (!response.body) {
      throw new Error('No response body from Gemini streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) {
              yield { type: 'token', content: text };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    // Signal completion
    yield { type: 'done' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during synthesis';
    yield { type: 'error', message };
  }
}
