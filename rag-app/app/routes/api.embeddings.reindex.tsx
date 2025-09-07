import { json, type ActionFunction } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { asyncEmbeddingService } from '~/services/rag/async-embedding.service';
import { prisma } from '~/utils/db.server';

export const action: ActionFunction = async ({ request }) => {
  const user = await requireUser(request);
  const formData = await request.formData();
  
  const pageId = formData.get('pageId') as string;
  const workspaceId = formData.get('workspaceId') as string;
  const retryFailed = formData.get('retryFailed') === 'true';
  
  try {
    if (retryFailed && workspaceId) {
      // Retry all failed embeddings for workspace
      const retriedCount = await asyncEmbeddingService.retryFailed(workspaceId);
      return json({ 
        success: true, 
        message: `Retrying ${retriedCount} failed embeddings` 
      });
    }
    
    if (!pageId) {
      return json({ error: 'Page ID is required' }, { status: 400 });
    }
    
    // Get page to validate access and get workspaceId
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { 
        id: true, 
        workspaceId: true,
        workspace: {
          select: {
            userWorkspaces: {
              where: { userId: user.id },
              select: { id: true }
            }
          }
        }
      }
    });
    
    if (!page) {
      return json({ error: 'Page not found' }, { status: 404 });
    }
    
    // Check user has access to workspace
    if (page.workspace.userWorkspaces.length === 0) {
      return json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Queue the page for re-indexing with high priority
    const jobId = await asyncEmbeddingService.queueEmbedding(
      page.id,
      page.workspaceId,
      1 // High priority
    );
    
    return json({ 
      success: true, 
      jobId,
      message: 'Page queued for re-indexing' 
    });
    
  } catch (error) {
    console.error('Failed to trigger re-indexing:', error);
    return json(
      { error: 'Failed to trigger re-indexing' },
      { status: 500 }
    );
  }
};