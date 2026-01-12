import OpenAI from 'openai';
import type { RetrievedChunk, Source, QueryMode, QueryStreamEvent } from '@/lib/types';
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

const MODEL = 'gpt-5-mini-2025-08-07';

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

  // Generate response (no temperature for thinking models, use max_completion_tokens)
  // Thinking models need more tokens as they use tokens for reasoning + output
  const completionTokens = mode === 'detailed' ? 8000 : 4000;
  console.log(`Synthesizer: calling ${MODEL} with mode=${mode}, maxCompletionTokens=${completionTokens}`);
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: generateUserPrompt(query, context) },
    ],
    max_completion_tokens: completionTokens,
  });

  console.log('Synthesizer response:', JSON.stringify({
    finishReason: response.choices[0]?.finish_reason,
    hasContent: !!response.choices[0]?.message?.content,
    contentLength: response.choices[0]?.message?.content?.length,
  }));

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
 * Phase 2: Server-Sent Events streaming support
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

  try {
    // Stream LLM response
    // Thinking models need more tokens as they use tokens for reasoning + output
    const maxTokens = mode === 'detailed' ? 8000 : 4000;
    const stream = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: generateUserPrompt(query, context) },
      ],
      max_completion_tokens: maxTokens,
      stream: true,
    });

    let totalTokens = 0;

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        yield { type: 'token', content: token };
      }

      // Track usage if available
      if (chunk.usage) {
        totalTokens = chunk.usage.completion_tokens || 0;
      }
    }

    // Signal completion with usage info
    yield {
      type: 'done',
      usage: {
        completionTokens: totalTokens,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during synthesis';
    yield { type: 'error', message };
  }
}
