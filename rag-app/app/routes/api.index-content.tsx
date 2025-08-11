import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { pageContentIndexerService } from '~/services/page-content-indexer.server';
import { indexingQueueWorker } from '~/services/indexing-queue-worker.server';
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
        const workspaceId = formData.get('workspaceId') as string;

        if (!pageId || !workspaceId) {
          return json({ error: 'Missing required fields' }, { status: 400 });
        }

        await pageContentIndexerService.indexPage(pageId, workspaceId);

        return json({
          success: true,
          message: 'Page indexed successfully'
        });
      }

      case 'indexDatabase': {
        const databaseId = formData.get('databaseId') as string;
        const workspaceId = formData.get('workspaceId') as string;

        if (!databaseId || !workspaceId) {
          return json({ error: 'Missing required fields' }, { status: 400 });
        }

        await pageContentIndexerService.indexDatabaseBlock(databaseId, workspaceId);

        return json({
          success: true,
          message: 'Database indexed successfully'
        });
      }

      case 'reindexWorkspace': {
        const workspaceId = formData.get('workspaceId') as string;

        if (!workspaceId) {
          return json({ error: 'Missing workspace ID' }, { status: 400 });
        }

        await pageContentIndexerService.reindexWorkspace(workspaceId);

        return json({
          success: true,
          message: 'Workspace reindexed successfully'
        });
      }

      case 'processQueue': {
        // Manually trigger queue processing
        indexingQueueWorker.start();
        
        return json({
          success: true,
          message: 'Queue processing started'
        });
      }

      case 'cleanupQueue': {
        await indexingQueueWorker.cleanupOldTasks();
        
        return json({
          success: true,
          message: 'Queue cleanup completed'
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