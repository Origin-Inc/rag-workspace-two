import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { embeddingGenerationService } from '~/services/embedding-generation.server';
import { ragService } from '~/services/rag.server';
import { aiBlockService } from '~/services/ai-block-service.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('API:RAGSearch');

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  
  const url = new URL(request.url);
  const query = url.searchParams.get('query');
  const workspaceId = url.searchParams.get('workspaceId');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const includeContext = url.searchParams.get('includeContext') === 'true';

  if (!query || !workspaceId) {
    return json({ error: 'Missing required parameters' }, { status: 400 });
  }

  logger.info('Search request', {
    query,
    workspaceId,
    limit,
    includeContext
  });

  try {
    // Perform hybrid search
    const searchResults = await embeddingGenerationService.searchSimilarDocuments(
      workspaceId,
      query,
      limit,
      0.5 // Lower threshold for broader results
    );

    logger.info('Search completed', { resultsCount: searchResults.length });

    // If context is requested, build augmented context
    if (includeContext && searchResults.length > 0) {
      const context = await ragService.buildAugmentedContext(
        query,
        searchResults,
        {
          maxTokens: 2000,
          includeCitations: true
        }
      );

      return json({
        success: true,
        query,
        results: searchResults,
        context
      });
    }

    return json({
      success: true,
      query,
      results: searchResults
    });
  } catch (error) {
    logger.error('Search failed', error);
    return json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  
  const formData = await request.formData();
  const action = formData.get('action') as string;

  logger.info('RAG action', { action });

  try {
    switch (action) {
      case 'generateAnswer': {
        const query = formData.get('query') as string;
        const workspaceId = formData.get('workspaceId') as string;
        const context = formData.get('context') as string;
        const systemPrompt = formData.get('systemPrompt') as string;

        if (!query || !workspaceId) {
          return json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Generate answer using RAG
        const answer = await ragService.generateAnswer(
          query,
          context || '',
          {
            systemPrompt,
            temperature: 0.7,
            maxTokens: 1500
          }
        );

        return json({
          success: true,
          answer
        });
      }

      case 'summarizeWorkspace': {
        const workspaceId = formData.get('workspaceId') as string;
        const summaryType = formData.get('summaryType') as string || 'comprehensive';

        if (!workspaceId) {
          return json({ error: 'Missing workspace ID' }, { status: 400 });
        }

        // Generate workspace summary
        const summary = await ragService.generateWorkspaceSummary(
          workspaceId,
          summaryType
        );

        return json({
          success: true,
          summary
        });
      }

      case 'searchAndAnswer': {
        const query = formData.get('query') as string;
        const workspaceId = formData.get('workspaceId') as string;
        const pageId = formData.get('pageId') as string;
        const blockId = formData.get('blockId') as string;

        logger.info('searchAndAnswer request', { query, workspaceId, pageId, blockId });

        if (!query) {
          logger.error('Missing query parameter');
          return json({ error: 'Missing query parameter' }, { status: 400 });
        }

        if (!workspaceId) {
          logger.error('Missing workspaceId parameter');
          return json({ error: 'Missing workspaceId parameter' }, { status: 400 });
        }

        // Use the production AI block service for better reliability
        try {
          const response = await aiBlockService.processQuery({
            query,
            workspaceId,
            pageId: pageId || undefined,
            blockId: blockId || undefined,
            maxRetries: 3,
            timeoutMs: 25000
          });

          if (!response.success) {
            logger.error('AI block service failed', { error: response.error });
            return json({
              success: false,
              error: response.error,
              debugInfo: response.debugInfo
            }, { status: 500 });
          }

          return json({
            success: true,
            answer: response.answer,
            citations: response.citations,
            debugInfo: response.debugInfo
          });
        } catch (error) {
          logger.error('Unexpected error in AI block service', error);
          
          // Fallback to original implementation
          logger.info('Falling back to original RAG implementation');
        }

        // Original implementation as fallback
        // Check if this is a summarization request
        const lowerQuery = query.toLowerCase();
        if (lowerQuery.includes('summarize this workspace')) {
          const summary = await ragService.generateWorkspaceSummary(
            workspaceId,
            'comprehensive'
          );

          return json({
            success: true,
            answer: summary.summary,
            citations: summary.citations,
            isWorkspaceSummary: true
          });
        }
        
        // Handle "summarize this page" request
        if (lowerQuery.includes('summarize this page') || lowerQuery.includes('summarize the page')) {
          // For page summarization, we'll search for content in the current context
          // and generate a focused summary
          const searchResults = await embeddingGenerationService.searchSimilarDocuments(
            workspaceId,
            'page content current document', // Search for page-related content
            5,
            0.3 // Lower threshold for broader results
          );

          if (searchResults.length === 0) {
            return json({
              success: true,
              answer: "This page appears to be empty or hasn't been indexed yet. Try adding some content to the page first.",
              citations: []
            });
          }

          // Build context for page summarization
          const context = await ragService.buildAugmentedContext(
            'Summarize the following page content',
            searchResults,
            {
              maxTokens: 2000,
              includeCitations: true
            }
          );

          // Generate page summary with timeout protection
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout after 25 seconds')), 25000);
          });

          try {
            const result = await Promise.race([
              ragService.generateAnswerWithCitations(
                `Please provide a concise summary of this page's content. Focus on the main topics, key points, and important information.`,
                context
              ),
              timeoutPromise
            ]) as any;

            logger.info('Page summary generated successfully', { 
              answerLength: result.answer?.length || 0,
              citationsCount: result.citations?.length || 0
            });

            return json({
              success: true,
              answer: result.answer,
              citations: result.citations,
              isPageSummary: true
            });
          } catch (timeoutError) {
            logger.error('Page summary generation timed out or failed', timeoutError);
            
            return json({
              success: false,
              error: 'The page summary request took too long to complete. Please try again.',
              timeout: true
            }, { status: 408 });
          }
        }

        // Perform search
        const searchResults = await embeddingGenerationService.searchSimilarDocuments(
          workspaceId,
          query,
          10,
          0.5
        );

        if (searchResults.length === 0) {
          return json({
            success: true,
            answer: "I couldn't find any relevant information in your workspace to answer this question.",
            citations: []
          });
        }

        // Build context
        const context = await ragService.buildAugmentedContext(
          query,
          searchResults,
          {
            maxTokens: 2000,
            includeCitations: true
          }
        );

        // Generate answer with timeout protection
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout after 25 seconds')), 25000);
        });

        try {
          const result = await Promise.race([
            ragService.generateAnswerWithCitations(query, context),
            timeoutPromise
          ]) as any;

          logger.info('Answer generated successfully', { 
            answerLength: result.answer?.length || 0,
            citationsCount: result.citations?.length || 0
          });

          return json({
            success: true,
            ...result
          });
        } catch (timeoutError) {
          logger.error('Answer generation timed out or failed', timeoutError);
          
          // Return a timeout-specific error response
          return json({
            success: false,
            error: 'The AI request took too long to complete. Please try with a shorter query.',
            timeout: true
          }, { status: 408 });
        }
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logger.error('RAG action failed', error);
    return json(
      { error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    );
  }
}