import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { aiControllerService } from '~/services/ai-controller.server';
import { requireUser } from '~/services/auth/auth.server';
import { DebugLogger } from '~/utils/debug-logger';
import { embeddingGenerationService } from '~/services/embedding-generation.server';
import { ragService } from '~/services/rag.server';
import { aiModelConfig } from '~/services/ai-model-config.server';

const logger = new DebugLogger('API:AIController');

// Handle GET requests (fetcher might make these for revalidation)
export async function loader({ request }: LoaderFunctionArgs) {
  // This endpoint only accepts POST requests
  return json({ error: 'This endpoint only accepts POST requests' }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  logger.trace('action', [request.method, request.url]);
  
  const user = await requireUser(request);
  logger.debug('User authenticated', { userId: user.id });
  
  const formData = await request.formData();
  const action = formData.get('action') as string;
  logger.info(`Handling action: ${action}`);

  try {
    switch (action) {
      case 'parse': {
        const command = formData.get('command') as string;
        const workspaceId = formData.get('workspaceId') as string;
        
        // Add extensive debugging
        console.log('[AI_CONTROLLER] Raw form data:', {
          command,
          workspaceId,
          user: user?.id,
          userEmail: user?.email
        });
        
        logger.debug('Parse action parameters', { 
          command, 
          workspaceId,
          userId: user.id 
        });

        if (!command || !workspaceId) {
          logger.warn('Missing required fields', { command: !!command, workspaceId: !!workspaceId });
          return json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check if this is a question/query command rather than an action command
        const commandLower = command.trim().toLowerCase();
        const isQuestion = /^(what|where|when|who|why|how|summarize|list|find|show|tell|explain|describe)/i.test(command.trim());
        const isSummarization = /summarize|summary|overview|describe/i.test(command.trim());
        const isGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)$/i.test(command.trim());
        const isConversational = isGreeting || /^(thanks|thank you|please|help|yes|no|ok|okay|sure|great|nice|cool|awesome)$/i.test(command.trim());
        
        logger.info('Command analysis', {
          command: command.trim(),
          isQuestion,
          isSummarization,
          isGreeting,
          isConversational,
          startsWithSummarize: commandLower.startsWith('summarize')
        });
        
        if (isQuestion || isSummarization || isConversational) {
          logger.info('Detected question/query/conversation, routing to AI system');
          
          try {
            
            // Handle summarization requests
            if (isSummarization) {
              logger.info('Handling summarization request');
              
              // Check if workspace or page summarization
              if (/workspace|everything|all my pages/i.test(command)) {
                const summary = await ragService.generateWorkspaceSummary(
                  workspaceId,
                  'comprehensive'
                );
                
                return json({
                  success: true,
                  isQuestion: true,
                  answer: summary.summary,
                  citations: summary.citations,
                  parseResult: {
                    actions: [],
                    confidence: 1,
                    reasoning: 'Workspace summary requested'
                  }
                });
              }
              
              // For "summarize this page" or general summarization, use RAG search
              // Fall through to regular RAG processing
            }
            
            // Try RAG search first if not a greeting/simple conversation
            let searchResults = [];
            let hasRelevantContent = false;
            
            if (!isGreeting && !isConversational) {
              logger.info('Starting RAG search', { workspaceId, command });
              
              try {
                searchResults = await embeddingGenerationService.searchSimilarDocuments(
                  workspaceId,
                  command,
                  10,
                  0.5
                );
                
                hasRelevantContent = searchResults.length > 0;
                logger.info('Search results', {
                  count: searchResults.length,
                  hasRelevantContent
                });
              } catch (searchError) {
                logger.warn('Search failed, will use direct AI response', searchError);
              }
            }
            
            // Use OpenAI to generate response with or without context
            logger.info('Generating AI response', { hasRelevantContent });
            
            if (hasRelevantContent && searchResults.length > 0) {
              // Use RAG with context from documents
              const context = await ragService.buildAugmentedContext(
                command,
                searchResults,
                {
                  maxTokens: 2000,
                  includeCitations: true
                }
              );
              
              const result = await ragService.generateAnswerWithCitations(
                command,
                context
              );
              
              return json({
                success: true,
                isQuestion: true,
                answer: result.answer,
                citations: result.citations,
                confidence: result.confidence,
                parseResult: {
                  actions: [],
                  confidence: result.confidence,
                  reasoning: 'Question answered using RAG'
                }
              });
            } else {
              // Use direct OpenAI response without document context
              const { openai } = await import('~/services/openai.server');

              const systemPrompt = isGreeting
                ? "You are a helpful AI assistant integrated into a RAG (Retrieval-Augmented Generation) system. Respond to greetings in a friendly, professional manner and briefly explain your capabilities."
                : "You are a helpful AI assistant. Provide clear, accurate, and helpful responses to user queries.";

              const apiParams = aiModelConfig.buildAPIParameters({
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: command }
                ],
                queryType: isGreeting ? 'creative' : 'analysis'
              });

              const response = await openai.chat.completions.create(apiParams);
              
              const answer = response.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.';
              
              return json({
                success: true,
                isQuestion: true,
                answer,
                citations: [],
                confidence: 0.8,
                parseResult: {
                  actions: [],
                  confidence: 0.8,
                  reasoning: 'Direct AI response'
                }
              });
            }
          } catch (error) {
            logger.error('RAG processing failed', {
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
              command,
              workspaceId
            });
            
            // Return error response for questions instead of falling back
            return json({
              success: false,
              isQuestion: true,
              error: error instanceof Error ? error.message : 'Failed to process question',
              answer: `I encountered an error while processing your question: ${error instanceof Error ? error.message : 'Unknown error'}. Please make sure OpenAI API is configured and try again.`,
              parseResult: {
                actions: [],
                confidence: 0,
                reasoning: 'Error occurred'
              }
            });
          }
        }

        // Parse as action command
        logger.info('Parsing as action command');
        const parseResult = await logger.timeOperation(
          'parseCommand',
          () => aiControllerService.parseCommand(
            command,
            workspaceId,
            user.id
          )
        );
        logger.debug('Parse result', parseResult);

        // Generate preview
        logger.info('Generating preview');
        const preview = await logger.timeOperation(
          'generatePreview',
          () => aiControllerService.generatePreview(
            parseResult.actions,
            workspaceId
          )
        );
        logger.debug('Preview generated', { previewCount: preview.length });

        // Store action log (skip if Supabase is not available)
        logger.info('Storing action log');
        let actionLogId = null;
        try {
          actionLogId = await logger.timeOperation(
            'storeActionLog',
            () => aiControllerService.storeActionLog(
              command,
              parseResult,
              preview,
              workspaceId,
              user.id
            )
          );
          logger.info('Action log stored', { actionLogId });
        } catch (error) {
          logger.warn('Failed to store action log (Supabase may be offline)', error);
          // Continue without storing the log
          actionLogId = `temp-${Date.now()}`;
        }

        const response = {
          success: true,
          parseResult,
          preview,
          actionLogId
        };
        
        logger.info('Parse action completed successfully');
        return json(response);
      }

      case 'execute': {
        const actionLogId = formData.get('actionLogId') as string;
        const workspaceId = formData.get('workspaceId') as string;

        if (!actionLogId || !workspaceId) {
          return json({ error: 'Missing required fields' }, { status: 400 });
        }

        // First confirm the action
        await aiControllerService.confirmAction(actionLogId);

        // Get the action log to retrieve the parsed actions
        const { data: actionLog } = await aiControllerService
          .supabase
          .from('action_logs')
          .select('*')
          .eq('id', actionLogId)
          .single();

        if (!actionLog) {
          return json({ error: 'Action log not found' }, { status: 404 });
        }

        // Execute the actions
        const result = await aiControllerService.executeActions(
          actionLogId,
          actionLog.parsed_action.actions,
          workspaceId,
          user.id
        );

        return json({
          success: true,
          executed: true,
          command: actionLog.command,
          result
        });
      }

      case 'cancel': {
        const actionLogId = formData.get('actionLogId') as string;

        if (!actionLogId) {
          return json({ error: 'Missing action log ID' }, { status: 400 });
        }

        // Update status to cancelled
        await aiControllerService.supabase
          .from('action_logs')
          .update({ status: 'cancelled' })
          .eq('id', actionLogId);

        return json({ success: true, cancelled: true });
      }

      case 'history': {
        const workspaceId = formData.get('workspaceId') as string;

        if (!workspaceId) {
          return json({ error: 'Missing workspace ID' }, { status: 400 });
        }

        // Get recent command history
        const { data: history } = await aiControllerService.supabase
          .from('action_logs')
          .select('id, command, status, created_at')
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        return json({ success: true, history });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logger.error('AI Controller API error', error);
    return json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    );
  }
}