import { ChatMessage, UploadedFile } from '../types';
import { logService } from './logService';

export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIService {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://api.openai.com/v1') {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  // Check if an API key is NewAPI format (starts with sk-)
  public static isNewAPIKey(apiKey: string): boolean {
    return apiKey.startsWith('sk-') && apiKey.length > 10;
  }

  // Convert chat messages to OpenAI format
  private convertMessagesToOpenAI(
    messages: ChatMessage[], 
    systemInstruction?: string
  ): OpenAIMessage[] {
    const openaiMessages: OpenAIMessage[] = [];

    // Add system instruction if provided
    if (systemInstruction && systemInstruction.trim()) {
      openaiMessages.push({
        role: 'system',
        content: systemInstruction.trim()
      });
    }

    // Convert chat messages
    for (const msg of messages) {
      if (msg.role === 'error') continue; // Skip error messages
      
      let content = msg.content;
      
      // If message has files, add file information to content
      if (msg.files && msg.files.length > 0) {
        const fileDescriptions = msg.files
          .filter(f => f.textContent || f.name)
          .map(f => {
            if (f.textContent) {
              return `[文件: ${f.name}]\n${f.textContent}`;
            } else {
              return `[文件: ${f.name}]`;
            }
          })
          .join('\n\n');
        
        if (fileDescriptions) {
          content = fileDescriptions + '\n\n' + content;
        }
      }

      openaiMessages.push({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: content
      });
    }

    return openaiMessages;
  }

  // Send message to OpenAI-compatible API
  public async sendMessage(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    systemInstruction?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
    },
    signal?: AbortSignal
  ): Promise<{ content: string; usage?: any }> {
    try {
      const openaiMessages = this.convertMessagesToOpenAI(messages, systemInstruction);
      
      const requestBody = {
        model: model || 'gpt-3.5-turbo',
        messages: openaiMessages,
        stream: false,
        ...options
      };

      logService.info(`Sending OpenAI request to ${model}`, {
        messageCount: openaiMessages.length,
        temperature: options?.temperature,
        maxTokens: options?.max_tokens
      });

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data: OpenAIResponse = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from OpenAI API');
      }

      const content = data.choices[0].message.content;
      
      logService.info('OpenAI response received', {
        responseLength: content.length,
        usage: data.usage
      });

      return {
        content,
        usage: data.usage
      };
    } catch (error) {
      logService.error('OpenAI API call failed:', error);
      throw error;
    }
  }

  // Get available models (for API testing)
  public async getModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal
      });

      if (!response.ok) {
        throw new Error(`Models API error (${response.status}): ${response.statusText}`);
      }

      const data = await response.json();
      return data.data ? data.data.map((m: any) => m.id) : [];
    } catch (error) {
      logService.error('Failed to get OpenAI models:', error);
      throw error;
    }
  }
}

export const openaiService = new OpenAIService();