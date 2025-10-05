import { eventStream } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { queryIntentAnalyzer } from "~/services/query-intent-analyzer.server";
import { UnifiedIntelligenceService } from "~/services/unified-intelligence.server";
import { ResponseComposer } from "~/services/response-composer.server";
import { ConversationContextManager } from "~/services/conversation-context.server";
import { createChatCompletion, isOpenAIConfigured } from "~/services/openai.server";
import { requireUser } from '~/services/auth/auth.server';
import { DebugLogger } from '~/utils/debug-logger';
import { aiModelConfig } from '~/services/ai-model-config.server';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const logger = new DebugLogger('api.chat-query-stream');

export const action: ActionFunction = async ({ request }) => {
  const startTime = Date.now();
  const requestId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return eventStream(request.signal, function setup(send) {
    (async () => {
      try {
        // Send initial connection event
        send({ 
          event: "connected", 
          data: JSON.stringify({ requestId, timestamp: Date.now() })
        });
        
        // Require authentication
        const user = await requireUser(request);
        logger.trace('[Stream] User authenticated', { requestId, userId: user.id });
        
        if (!isOpenAIConfigured()) {
          send({
            event: "error",
            data: JSON.stringify({
              message: "AI features are not configured. Please set up your OpenAI API key.",
              code: "OPENAI_NOT_CONFIGURED"
            })
          });
          return;
        }
        
        const body = await request.json();
        const { query, files, pageId, workspaceId, conversationHistory, sessionId } = body;
        
        // Generate session ID if not provided
        const currentSessionId = sessionId || `session_${user.id}_${Date.now()}`;
        
        // Get or create conversation context
        const context = ConversationContextManager.getContext(
          currentSessionId,
          user.id,
          workspaceId,
          pageId
        );
        
        // Send progress update
        send({
          event: "progress",
          data: JSON.stringify({
            stage: "analyzing_intent",
            message: "Understanding your query..."
          })
        });
        
        // Analyze query intent
        const intent = queryIntentAnalyzer.analyzeIntent(query);
        logger.trace('[Stream] Query intent analyzed', {
          requestId,
          queryType: intent.queryType,
          confidence: intent.confidence
        });
        
        // Update context with query and intent
        ConversationContextManager.updateWithQuery(context, query, intent, files || []);
        
        // Send intent analysis result
        send({
          event: "intent",
          data: JSON.stringify({
            queryType: intent.queryType,
            formatPreference: intent.formatPreference,
            confidence: intent.confidence,
            needsDataAccess: queryIntentAnalyzer.needsDataAccess(intent)
          })
        });
        
        // Initialize services
        const intelligence = new UnifiedIntelligenceService();
        const composer = new ResponseComposer();
        
        // Prepare file data if needed
        if (files && files.length > 0) {
          send({
            event: "progress",
            data: JSON.stringify({
              stage: "preparing_data",
              message: `Processing ${files.length} file(s)...`
            })
          });
          
          const fileData = await prepareFileDataStreaming(files, pageId, requestId, send);
          
          // Process with intelligence service
          send({
            event: "progress",
            data: JSON.stringify({
              stage: "analyzing_data",
              message: "Analyzing your data..."
            })
          });
          
          const analysis = await intelligence.process(
            query,
            fileData,
            intent,
            requestId,
            undefined,
            conversationHistory || []
          );
          
          // Compose response
          send({
            event: "progress",
            data: JSON.stringify({
              stage: "composing_response",
              message: "Generating response..."
            })
          });
          
          const response = await composer.compose(analysis, intent, requestId);
          
          // Send final response
          send({
            event: "response",
            data: JSON.stringify({
              content: response.content,
              metadata: response.metadata,
              sessionId: currentSessionId
            })
          });
          
          // Update context with response
          const processingTime = Date.now() - startTime;
          ConversationContextManager.updateWithResponse(
            context,
            response.content,
            'data-query',
            processingTime,
            response.metadata?.tokens?.total
          );
          
        } else {
          // Handle general chat query without files
          send({
            event: "progress",
            data: JSON.stringify({
              stage: "generating_response",
              message: "Thinking..."
            })
          });
          
          const messages: ChatCompletionMessageParam[] = [
            { 
              role: "system", 
              content: "You are a helpful AI assistant. Provide clear, concise, and informative responses."
            }
          ];
          
          // Add conversation history
          const formattedHistory = ConversationContextManager.getFormattedHistory(context, 5);
          formattedHistory.forEach(msg => {
            messages.push({
              role: msg.role as 'user' | 'assistant',
              content: msg.content
            });
          });
          
          // Add current query
          messages.push({ role: "user", content: query });
          
          // Stream OpenAI response
          const stream = await createChatCompletion({
            messages,
            stream: true
          });
          
          let fullResponse = '';
          
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullResponse += content;
              
              // Send chunk to client
              send({
                event: "chunk",
                data: JSON.stringify({ content })
              });
            }
          }
          
          // Send completion event
          send({
            event: "response",
            data: JSON.stringify({
              content: fullResponse,
              sessionId: currentSessionId
            })
          });
          
          // Update context
          const processingTime = Date.now() - startTime;
          ConversationContextManager.updateWithResponse(
            context,
            fullResponse,
            'general-chat',
            processingTime
          );
        }
        
        // Send completion metrics
        send({
          event: "complete",
          data: JSON.stringify({
            processingTime: Date.now() - startTime,
            requestId
          })
        });
        
      } catch (error) {
        logger.error('[Stream] Request failed', {
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
        
        send({
          event: "error",
          data: JSON.stringify({
            message: error instanceof Error ? error.message : 'An error occurred',
            code: "PROCESSING_ERROR"
          })
        });
      }
    })();
    
    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      send({ event: "heartbeat", data: JSON.stringify({ timestamp: Date.now() }) });
    }, 30000);
    
    // Cleanup on close
    return function clear() {
      clearInterval(heartbeat);
      logger.trace('[Stream] Connection closed', { requestId });
    };
  });
};

/**
 * Prepare file data with streaming progress updates
 */
async function prepareFileDataStreaming(
  files: any[],
  pageId: string | undefined,
  requestId: string,
  send: (event: { event: string; data: string }) => void
): Promise<any[]> {
  const preparedFiles: any[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    send({
      event: "file_progress",
      data: JSON.stringify({
        current: i + 1,
        total: files.length,
        filename: file.filename,
        action: "processing"
      })
    });
    
    // Process file based on type
    const fileInfo: any = {
      id: file.id,
      filename: file.filename,
      type: file.type || 'unknown',
      content: '',
      metadata: {},
      uploadedAt: file.uploadedAt || new Date().toISOString()
    };
    
    // For PDFs
    if (file.type === 'pdf') {
      const contentArray = Array.isArray(file.content) ? file.content : 
                          (file.data && Array.isArray(file.data) ? 
                            file.data.map((row: any) => row.text || JSON.stringify(row)) : 
                            []);
      
      if (contentArray.length > 0) {
        fileInfo.content = contentArray.join('\n\n');
        fileInfo.extractedContent = contentArray;
        fileInfo.sample = fileInfo.content.slice(0, 2000);
      }
    }
    // For CSVs
    else if (file.type === 'csv') {
      if (file.data && Array.isArray(file.data)) {
        fileInfo.data = file.data;
        fileInfo.sampleData = file.data.slice(0, 100);
        
        // Generate content string for AI
        if (file.data.length > 0) {
          const headers = Object.keys(file.data[0]);
          const rows = file.data.slice(0, 50).map((row: any) => 
            headers.map(h => row[h]).join(', ')
          );
          fileInfo.content = headers.join(', ') + '\n' + rows.join('\n');
          fileInfo.sample = fileInfo.content.slice(0, 2000);
        }
      }
    }
    // For text files
    else if (file.type === 'text' || file.type === 'markdown') {
      fileInfo.content = file.content || '';
      fileInfo.sample = fileInfo.content.slice(0, 2000);
    }
    
    preparedFiles.push(fileInfo);
  }
  
  return preparedFiles;
}