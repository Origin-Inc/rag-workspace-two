import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { ragIndexingService } from '~/services/rag/rag-indexing.service';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('API:IndexExistingContent');

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  
  const formData = await request.formData();
  const action = formData.get('action') as string;
  const workspaceId = formData.get('workspaceId') as string;

  logger.info('Index existing content request', { action, workspaceId });

  try {
    switch (action) {
      case 'indexWorkspace': {
        if (!workspaceId) {
          return json({ error: 'Missing workspace ID' }, { status: 400 });
        }

        // Start background indexing
        ragIndexingService.indexWorkspacePages(workspaceId)
          .then(() => {
            logger.info('Workspace indexing completed', { workspaceId });
          })
          .catch(error => {
            logger.error('Workspace indexing failed', { workspaceId, error });
          });

        return json({ 
          success: true, 
          message: 'Workspace indexing started in background'
        });
      }

      case 'indexAllPages': {
        // System-wide indexing (admin only or for development)
        ragIndexingService.indexAllPages()
          .then(() => {
            logger.info('System-wide indexing completed');
          })
          .catch(error => {
            logger.error('System-wide indexing failed', error);
          });

        return json({ 
          success: true, 
          message: 'System-wide indexing started in background'
        });
      }

      case 'indexPage': {
        const pageId = formData.get('pageId') as string;
        
        if (!pageId) {
          return json({ error: 'Missing page ID' }, { status: 400 });
        }

        await ragIndexingService.indexPageContent(pageId);

        return json({ 
          success: true, 
          message: 'Page indexed successfully'
        });
      }

      case 'getIndexingStatus': {
        if (!workspaceId) {
          return json({ error: 'Missing workspace ID' }, { status: 400 });
        }

        // Check how many documents are indexed vs pages
        const { createSupabaseAdmin } = await import('~/utils/supabase.server');
        const supabase = createSupabaseAdmin();

        const [pagesResult, documentsResult] = await Promise.all([
          supabase
            .from('pages')
            .select('count')
            .eq('workspace_id', workspaceId)
            .eq('is_archived', false)
            .single(),
          supabase
            .from('documents')
            .select('count')
            .eq('workspace_id', workspaceId)
            .single()
        ]);

        const pageCount = pagesResult.count || 0;
        const documentCount = documentsResult.count || 0;
        
        return json({
          success: true,
          indexingStatus: {
            totalPages: pageCount,
            indexedDocuments: documentCount,
            indexingComplete: documentCount > 0,
            estimatedProgress: pageCount > 0 ? Math.min(100, (documentCount / pageCount) * 100) : 0
          }
        });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logger.error('Indexing operation failed', { action, error });
    return json(
      { error: error instanceof Error ? error.message : 'Operation failed' },
      { status: 500 }
    );
  }
}

// Also support GET for simple status checks
export async function loader({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspaceId');

  if (!workspaceId) {
    return json({ error: 'Missing workspace ID' }, { status: 400 });
  }

  try {
    const { createSupabaseAdmin } = await import('~/utils/supabase.server');
    const supabase = createSupabaseAdmin();

    // Get indexing status
    const [pagesResult, documentsResult] = await Promise.all([
      supabase
        .from('pages')
        .select('id, title, updated_at')
        .eq('workspace_id', workspaceId)
        .eq('is_archived', false)
        .order('updated_at', { ascending: false })
        .limit(10),
      supabase
        .from('documents')
        .select('id, passage_id, metadata, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    return json({
      success: true,
      recentPages: pagesResult.data || [],
      recentDocuments: documentsResult.data || [],
      hasIndexedContent: (documentsResult.data?.length || 0) > 0
    });
  } catch (error) {
    logger.error('Status check failed', error);
    return json(
      { error: error instanceof Error ? error.message : 'Status check failed' },
      { status: 500 }
    );
  }
}