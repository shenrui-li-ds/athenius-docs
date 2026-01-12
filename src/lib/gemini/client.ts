// Gemini API client for LLM and embeddings

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
}

/**
 * Call Gemini LLM API
 */
export async function callGemini(
  messages: ChatMessage[],
  model: string = 'gemini-3-flash-preview',
  config: GeminiGenerationConfig = {}
): Promise<LLMResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  // Convert message format to Gemini format
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const geminiContents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  const requestBody: Record<string, unknown> = {
    contents: geminiContents,
    generationConfig: {
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxOutputTokens ?? 8192,
      topP: config.topP,
      topK: config.topK,
    },
  };

  // Add system instruction if present
  if (systemMessage) {
    requestBody.systemInstruction = {
      parts: [{ text: systemMessage }]
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gemini API error: ${error.error?.message || JSON.stringify(error)}`);
  }

  const data = await response.json();
  const usageMetadata = data.usageMetadata;

  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    usage: usageMetadata ? {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0,
      total_tokens: usageMetadata.totalTokenCount || 0,
    } : undefined,
  };
}

/**
 * Call Gemini LLM API with streaming
 */
export async function callGeminiStream(
  messages: ChatMessage[],
  model: string = 'gemini-3-flash-preview',
  config: GeminiGenerationConfig = {}
): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  // Convert message format to Gemini format
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const geminiContents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  const url = `${GEMINI_API_URL}/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const requestBody: Record<string, unknown> = {
    contents: geminiContents,
    generationConfig: {
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxOutputTokens ?? 8192,
      topP: config.topP,
      topK: config.topK,
    },
  };

  // Add system instruction if present
  if (systemMessage) {
    requestBody.systemInstruction = {
      parts: [{ text: systemMessage }]
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gemini API error: ${error.error?.message || JSON.stringify(error)}`);
  }

  return response;
}

/**
 * Call Gemini with JSON response format
 */
export async function callGeminiJSON<T = unknown>(
  messages: ChatMessage[],
  model: string = 'gemini-3-flash-preview',
  config: GeminiGenerationConfig = {}
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  // Convert message format to Gemini format
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const geminiContents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  const requestBody: Record<string, unknown> = {
    contents: geminiContents,
    generationConfig: {
      temperature: config.temperature ?? 0.1, // Lower temperature for JSON
      maxOutputTokens: config.maxOutputTokens ?? 8192,
      responseMimeType: 'application/json',
    },
  };

  // Add system instruction if present
  if (systemMessage) {
    requestBody.systemInstruction = {
      parts: [{ text: systemMessage }]
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gemini API error: ${error.error?.message || JSON.stringify(error)}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  try {
    return JSON.parse(content) as T;
  } catch {
    // Try to salvage truncated JSON by finding the last complete object
    const salvaged = tryRepairJSON(content);
    if (salvaged) {
      console.warn('Salvaged truncated JSON response from Gemini');
      return salvaged as T;
    }
    throw new Error(`Failed to parse Gemini JSON response: ${content.slice(0, 200)}...`);
  }
}

/**
 * Attempt to repair truncated JSON by finding valid partial structure
 */
function tryRepairJSON(content: string): unknown | null {
  const trimmed = content.trim();

  // Strategy 1: Find the last complete entity in the entities array
  // Look for the pattern: complete objects in entities array
  const entitiesStartMatch = trimmed.match(/"entities"\s*:\s*\[/);
  if (entitiesStartMatch) {
    const startIdx = entitiesStartMatch.index! + entitiesStartMatch[0].length;
    const entitiesContent = trimmed.slice(startIdx);

    // Find all complete objects by matching balanced braces
    const completeEntities: string[] = [];
    let depth = 0;
    let currentStart = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < entitiesContent.length; i++) {
      const char = entitiesContent[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        if (depth === 0) currentStart = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          // Found a complete object
          completeEntities.push(entitiesContent.slice(currentStart, i + 1));
        }
      }
    }

    if (completeEntities.length > 0) {
      try {
        const entitiesArray = JSON.parse('[' + completeEntities.join(',') + ']');
        return { entities: entitiesArray, relationships: [] };
      } catch {
        // Continue to other strategies
      }
    }
  }

  // Strategy 2: Try simple bracket closing
  for (const suffix of [']}', '}]}', '"]}', '"}]}', ']]}', '"]}]']) {
    try {
      return JSON.parse(trimmed + suffix);
    } catch {
      // Continue
    }
  }

  // Strategy 3: Remove trailing incomplete content and close
  const lastCompleteObject = trimmed.lastIndexOf('},');
  if (lastCompleteObject > 0) {
    const truncated = trimmed.slice(0, lastCompleteObject + 1);
    for (const suffix of [']}', ']}]', '],"relationships":[]}']) {
      try {
        return JSON.parse(truncated + suffix);
      } catch {
        // Continue
      }
    }
  }

  return null;
}

export type EmbeddingTaskType =
  | 'RETRIEVAL_QUERY'
  | 'RETRIEVAL_DOCUMENT'
  | 'SEMANTIC_SIMILARITY'
  | 'CLASSIFICATION'
  | 'CLUSTERING';

/**
 * Generate embeddings using Gemini
 */
export async function embedWithGemini(
  text: string,
  model: string = 'gemini-embedding-001',
  taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT',
  outputDimensionality: number = 768
): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const url = `${GEMINI_API_URL}/${model}:embedContent?key=${apiKey}`;

  const requestBody = {
    model: `models/${model}`,
    content: {
      parts: [{ text }]
    },
    taskType,
    outputDimensionality,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gemini Embedding API error: ${error.error?.message || JSON.stringify(error)}`);
  }

  const data = await response.json();
  return data.embedding?.values || [];
}

/**
 * Batch embed multiple texts using Gemini
 */
export async function batchEmbedWithGemini(
  texts: string[],
  model: string = 'gemini-embedding-001',
  taskType: EmbeddingTaskType = 'RETRIEVAL_DOCUMENT',
  outputDimensionality: number = 768
): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  if (texts.length === 0) return [];

  const url = `${GEMINI_API_URL}/${model}:batchEmbedContents?key=${apiKey}`;

  const requests = texts.map(text => ({
    model: `models/${model}`,
    content: {
      parts: [{ text }]
    },
    taskType,
    outputDimensionality,
  }));

  const requestBody = { requests };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gemini Batch Embedding API error: ${error.error?.message || JSON.stringify(error)}`);
  }

  const data = await response.json();
  return (data.embeddings || []).map((e: { values: number[] }) => e.values || []);
}
