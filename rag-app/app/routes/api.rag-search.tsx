import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { embeddingGenerationService } from '~/services/embedding-generation.server';
import { ragService } from '~/services/rag.server';
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

        if (!query || !workspaceId) {
          return json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check if this is a summarization request
        if (query.toLowerCase().includes('summarize this workspace')) {
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

        // Generate answer
        const result = await ragService.generateAnswerWithCitations(
          query,
          context
        );

        return json({
          success: true,
          ...result
        });
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