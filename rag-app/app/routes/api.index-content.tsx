import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { ragIndexingService } from '~/services/rag/rag-indexing.service';
import { getWorkersStatus } from '~/services/rag/workers/start-workers.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('API:IndexContent');

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  
  const formData = await request.formData();
  const action = formData.get('action') as string;

  logger.info('Index content action', { action });

  try {
    switch (action) {
      case 'indexPage': {
        const pageId = formData.get('pageId') as string;

        if (!pageId) {
          return json({ error: 'Missing page ID' }, { status: 400 });
        }

        // Queue page for indexing
        await ragIndexingService.queueForIndexing(pageId);

        return json({
          success: true,
          message: 'Page queued for indexing'
        });
      }

      case 'reindexWorkspace': {
        const workspaceId = formData.get('workspaceId') as string;

        if (!workspaceId) {
          return json({ error: 'Missing workspace ID' }, { status: 400 });
        }

        // Index all pages in workspace
        const result = await ragIndexingService.indexWorkspacePages(workspaceId);

        return json({
          success: true,
          message: `Workspace reindexing started: ${result.queued} pages queued, ${result.skipped} skipped`,
          ...result
        });
      }

      case 'reindexAll': {
        // Admin operation to reindex entire system
        const result = await ragIndexingService.indexAllPages();

        return json({
          success: true,
          message: `System-wide reindexing started: ${result.queued} pages queued, ${result.skipped} skipped`,
          ...result
        });
      }

      case 'getIndexStatus': {
        const pageId = formData.get('pageId') as string;

        if (!pageId) {
          return json({ error: 'Missing page ID' }, { status: 400 });
        }

        const status = await ragIndexingService.getIndexingStatus(pageId);

        return json({
          success: true,
          ...status
        });
      }

      case 'getWorkerStatus': {
        // Get status of background workers
        const status = await getWorkersStatus();
        
        return json({
          success: true,
          ...status
        });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logger.error('Index content action failed', error);
    return json(
      { error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    );
  }
}