import { json, type ActionFunction, type LoaderFunction } from '@remix-run/node';
import { LLMOrchestrator } from '~/services/llm-orchestration/orchestrator.server';
import { getUser } from '~/services/auth/production-auth.server';
import { DebugLogger } from '~/utils/debug-logger';
import { z } from 'zod';

const logger = new DebugLogger('api.llm-orchestration');

// Request validation schema
const QueryRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  workspaceId: z.string().uuid(),
  options: z.object({
    includeDebug: z.boolean().optional(),
    bypassCache: z.boolean().optional(),
    maxResponseTime: z.number().optional()
  }).optional()
});

// Singleton orchestrator instance
let orchestrator: LLMOrchestrator | null = null;

function getOrchestrator(): LLMOrchestrator {
  if (!orchestrator) {
    orchestrator = new LLMOrchestrator({
      enabled: true,
      ttl: 300, // 5 minutes
      maxSize: 100
    });
  }
  return orchestrator;
}

export const action: ActionFunction = async ({ request }) => {
  try {
    // Authenticate user
    const user = await getUser(request);
    
    // For development, allow test user if no auth
    const authUser = user || { 
      id: 'test-user-id', 
      email: 'test@example.com',
      workspaceId: null,
      roleId: 'test-role',
      permissions: []
    };
    
    // Parse request body
    const body = await request.json();
    
    // Validate request
    const validation = QueryRequestSchema.safeParse(body);
    if (!validation.success) {
      return json(
        { 
          error: 'Invalid request', 
          details: validation.error.errors 
        },
        { status: 400 }
      );
    }
    
    const { query, workspaceId, options = {} } = validation.data;
    
    logger.info('Processing LLM query', {
      query,
      workspaceId,
      userId: authUser.id,
      options
    });
    
    // Get orchestrator instance
    const orchestrator = getOrchestrator();
    
    // Process the query with timeout
    const timeoutMs = options.maxResponseTime || 10000; // Default 10 seconds
    const processPromise = orchestrator.processQuery(
      query,
      workspaceId,
      authUser.id,
      options
    );
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Query processing timeout')), timeoutMs);
    });
    
    try {
      const result = await Promise.race([processPromise, timeoutPromise]);
      
      // Log performance metrics
      logger.info('Query processed successfully', {
        success: result.success,
        totalTime: result.performance.totalTime,
        blockCount: result.response.blocks.length
      });
      
      // Return the result
      return json({
        success: result.success,
        response: result.response,
        performance: result.performance,
        debug: result.debug
      });
    } catch (timeoutError) {
      logger.error('Query processing timeout', { query, timeoutMs });
      
      return json(
        {
          success: false,
          error: 'Query processing timeout',
          response: {
            blocks: [{
              type: 'text',
              content: 'Your query took too long to process. Please try a simpler query or try again later.'
            }],
            metadata: {
              confidence: 0,
              dataSources: [],
              suggestions: [
                'Try a more specific query',
                'Reduce the scope of your search',
                'Check back in a few moments'
              ]
            }
          }
        },
        { status: 408 }
      );
    }
  } catch (error) {
    logger.error('LLM orchestration error', error);
    
    return json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        response: {
          blocks: [{
            type: 'text',
            content: 'An error occurred while processing your request. Please try again.'
          }],
          metadata: {
            confidence: 0,
            dataSources: []
          }
        }
      },
      { status: 500 }
    );
  }
};

// GET endpoint for cache stats (admin only)
export const loader: LoaderFunction = async ({ request }) => {
  try {
    // Authenticate user
    const user = await getUser(request);
    
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // TODO: Check if user is admin
    
    const orchestrator = getOrchestrator();
    const stats = orchestrator.getCacheStats();
    
    return json({
      cache: stats,
      status: 'healthy'
    });
  } catch (error) {
    logger.error('Failed to get stats', error);
    return json(
      { error: 'Failed to get stats' },
      { status: 500 }
    );
  }
};