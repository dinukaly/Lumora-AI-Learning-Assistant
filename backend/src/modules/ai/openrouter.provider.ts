import { config } from '../../config/index.js';
import type {
  ChatProvider,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from './ai-providers.js';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  choices: {
    message: { content: string };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenRouterStreamChunk {
  choices: {
    delta: { content?: string };
    finish_reason: string | null;
  }[];
}

export class OpenRouterChatProvider implements ChatProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly completionsUrl: string;
  private readonly model: string;

  constructor() {
    const cfg = config.chat.openrouter;
    this.apiKey = cfg.apiKey;
    this.baseUrl = normalizeOpenRouterBaseUrl(cfg.baseUrl);
    this.completionsUrl = `${this.baseUrl}/chat/completions`;
    this.model = cfg.model;
  }

  async generate(prompt: string, options?: ChatOptions): Promise<ChatResponse> {
    const data = await this.requestCompletion(prompt, {
      temperature: options?.temperature ?? 0.3,
      maxTokens: options?.maxTokens ?? 1024,
      stream: false,
    });

    return {
      content: data.choices[0]?.message?.content || '',
      finishReason: data.choices[0]?.finish_reason || 'stop',
      tokenUsage: {
        prompt: data.usage?.prompt_tokens ?? 0,
        completion: data.usage?.completion_tokens ?? 0,
        total: data.usage?.total_tokens ?? 0,
      },
    };
  }

  async generateJSON<T>(prompt: string, _schema: string, options?: ChatOptions): Promise<T> {
    const data = await this.requestCompletion(prompt, {
      temperature: options?.temperature ?? 0.3,
      maxTokens: options?.maxTokens ?? 1024,
      stream: false,
    });

    try {
      const content = data.choices[0]?.message?.content || '';
      const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      return JSON.parse(jsonStr) as T;
    } catch {
      throw new Error('Failed to parse structured JSON output from model');
    }
  }

  async *generateStream(prompt: string, options?: ChatOptions): AsyncIterable<ChatChunk> {
    const messages: OpenRouterMessage[] = [
      { role: 'user', content: prompt },
    ];

    const body = {
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 1024,
      stream: true,
    };

    const response = await fetch(this.completionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': config.frontendUrl,
        'X-Title': 'Lumora',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
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
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          yield { content: '', done: true };
          return;
        }

        try {
          const parsed: OpenRouterStreamChunk = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          const isDone = parsed.choices?.[0]?.finish_reason !== null;
          if (content || isDone) {
            yield { content, done: isDone };
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    if (buffer.trim() && buffer.trim() !== 'data: [DONE]') {
      try {
        const data = buffer.trim().replace(/^data: /, '');
        if (data && data !== '[DONE]') {
          const parsed: OpenRouterStreamChunk = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          yield { content, done: parsed.choices?.[0]?.finish_reason !== null };
        }
      } catch {
        // skip
      }
    }

    yield { content: '', done: true };
  }

  private async requestCompletion(
    prompt: string,
    options: { temperature: number; maxTokens: number; stream: boolean },
  ): Promise<OpenRouterResponse> {
    const messages: OpenRouterMessage[] = [
      { role: 'user', content: prompt },
    ];

    const body = {
      model: this.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: options.stream,
    };

    const response = await fetch(this.completionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': config.frontendUrl,
        'X-Title': 'Lumora',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<OpenRouterResponse>;
  }
}

function normalizeOpenRouterBaseUrl(baseUrl: string) {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  return trimmedBaseUrl.replace(/\/chat\/completions$/i, '');
}
