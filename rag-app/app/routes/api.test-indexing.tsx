import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { ragIndexingService } from '~/services/rag/rag-indexing.service';
import { prisma } from '~/utils/db.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('API:TestIndexing');

// GET to check indexing status
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const pageId = url.searchParams.get('pageId');
  
  if (!pageId) {
    return json({ error: 'Missing pageId parameter' }, { status: 400 });
  }
  
  // Get indexing status
  const status = await ragIndexingService.getIndexingStatus(pageId);
  
  // Get actual embeddings count
  const embeddings = await prisma.$queryRaw<any[]>`
    SELECT 
      id,
      chunk_index,
      LENGTH(chunk_text) as text_length,
      (metadata->>'indexedAt')::text as indexed_at
    FROM page_embeddings
    WHERE page_id = ${pageId}::uuid
    ORDER BY chunk_index
  `;
  
  return json({
    pageId,
    status,
    embeddings: embeddings.map(e => ({
      id: e.id,
      chunkIndex: e.chunk_index,
      textLength: e.text_length,
      indexedAt: e.indexed_at
    })),
    embeddingCount: embeddings.length
  });
}

// POST to force immediate indexing
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const pageId = formData.get('pageId') as string;
  
  if (!pageId) {
    return json({ error: 'Missing pageId' }, { status: 400 });
  }
  
  logger.info('🔧 Force indexing page', { pageId });
  
  try {
    // Force immediate processing (bypass queue)
    await ragIndexingService.processPage(pageId);
    
    // Get updated status
    const status = await ragIndexingService.getIndexingStatus(pageId);
    
    return json({
      success: true,
      message: 'Page indexed successfully',
      pageId,
      status
    });
  } catch (error) {
    logger.error('Force indexing failed', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Indexing failed',
      pageId
    }, { status: 500 });
  }
}