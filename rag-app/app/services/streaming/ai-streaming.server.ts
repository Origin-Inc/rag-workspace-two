import { OpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat';

export interface StreamingOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  systemPrompt?: string;
}

export interface StreamChunk {
  type: 'token' | 'error' | 'done' | 'metadata';
  content?: string;
  error?: string;
  metadata?: {
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    firstTokenMs?: number;
    totalTimeMs?: number;
    tokensPerSecond?: number;
  };
}

/**
 * AI Streaming Service for real-time token streaming
 * Targets: <500ms to first token, 2-3s total response time
 */
export class AIStreamingService {
  private openai: OpenAI;
  private performanceMetrics: Map<string, number> = new Map();
  
  constructor(apiKey?: string) {
    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }
  
  /**
   * Stream AI response with Server-Sent Events format
   */
  async *streamCompletion(
    messages: ChatCompletionMessageParam[],
    options: StreamingOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let tokenCount = 0;
    let fullResponse = '';
    
    try {
      // Add system prompt if provided
      const allMessages: ChatCompletionMessageParam[] = options.systemPrompt
        ? [{ role: 'system', content: options.systemPrompt }, ...messages]
        : messages;
      
      // Create streaming completion
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: allMessages,
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000,
        top_p: options.topP ?? 1,
        frequency_penalty: options.frequencyPenalty ?? 0,
        presence_penalty: options.presencePenalty ?? 0,
        stop: options.stopSequences,
      });
      
      // Stream tokens
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        
        if (content) {
          tokenCount++;
          fullResponse += content;
          
          // Record first token time
          if (firstTokenTime === null) {
            firstTokenTime = Date.now();
            const firstTokenMs = firstTokenTime - startTime;
            this.performanceMetrics.set('firstTokenMs', firstTokenMs);
            
            // Log if we miss our target
            if (firstTokenMs > 500) {
              console.warn(`[AIStreaming] First token took ${firstTokenMs}ms (target: <500ms)`);
            }
          }
          
          yield {
            type: 'token',
            content,
          };
        }
        
        // Check for finish reason
        if (chunk.choices[0]?.finish_reason === 'stop') {
          break;
        }
      }
      
      // Calculate final metrics
      const totalTimeMs = Date.now() - startTime;
      const tokensPerSecond = tokenCount / (totalTimeMs / 1000);
      
      // Send completion metadata
      yield {
        type: 'metadata',
        metadata: {
          totalTokens: tokenCount,
          firstTokenMs: firstTokenTime ? firstTokenTime - startTime : undefined,
          totalTimeMs,
          tokensPerSecond,
        },
      };
      
      // Log performance
      this.logPerformance(totalTimeMs, firstTokenTime ? firstTokenTime - startTime : 0, tokenCount);
      
      yield { type: 'done' };
      
    } catch (error) {
      console.error('[AIStreaming] Error:', error);
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
  
  /**
   * Create Server-Sent Events response
   */
  createSSEResponse(
    messages: ChatCompletionMessageParam[],
    options: StreamingOptions = {}
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    
    return new ReadableStream({
      async start(controller) {
        try {
          // Send initial connection event
          controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));
          
          // Stream tokens
          for await (const chunk of this.streamCompletion(messages, options)) {
            const eventData = JSON.stringify(chunk);
            const event = `event: ${chunk.type}\ndata: ${eventData}\n\n`;
            controller.enqueue(encoder.encode(event));
          }
          
          controller.close();
        } catch (error) {
          const errorEvent = `event: error\ndata: ${JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Stream error' 
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          controller.close();
        }
      },
    });
  }
  
  /**
   * Optimized streaming for chat responses
   */
  async streamChatResponse(
    prompt: string,
    context?: string,
    options: StreamingOptions = {}
  ): Promise<ReadableStream<Uint8Array>> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: context ? `Context: ${context}\n\nQuestion: ${prompt}` : prompt,
      },
    ];
    
    return this.createSSEResponse(messages, options);
  }
  
  /**
   * Performance logging
   */
  private logPerformance(totalMs: number, firstTokenMs: number, tokenCount: number) {
    const performance = {
      firstTokenMs,
      totalMs,
      tokenCount,
      tokensPerSecond: tokenCount / (totalMs / 1000),
      meetsTarget: firstTokenMs < 500 && totalMs < 3000,
    };
    
    if (!performance.meetsTarget) {
      console.warn('[AIStreaming] Performance target missed:', performance);
    } else {
      console.log('[AIStreaming] Performance target met:', performance);
    }
    
    // Store metrics for monitoring
    this.performanceMetrics.set('lastResponseMs', totalMs);
    this.performanceMetrics.set('lastFirstTokenMs', firstTokenMs);
    this.performanceMetrics.set('lastTokenCount', tokenCount);
  }
  
  /**
   * Get performance metrics
   */
  getMetrics() {
    return Object.fromEntries(this.performanceMetrics);
  }
  
  /**
   * Warm up the connection (pre-connect to reduce latency)
   */
  async warmUp(): Promise<void> {
    try {
      // Make a minimal API call to establish connection
      await this.openai.models.list();
      console.log('[AIStreaming] Connection warmed up');
    } catch (error) {
      console.error('[AIStreaming] Warmup failed:', error);
    }
  }
}

// Export singleton instance
export const aiStreamingService = new AIStreamingService();