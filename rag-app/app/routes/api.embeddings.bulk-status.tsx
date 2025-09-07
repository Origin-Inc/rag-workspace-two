import { json, type LoaderFunction } from '@remix-run/node';
import { asyncEmbeddingService } from '~/services/rag/async-embedding.service';

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const ids = url.searchParams.get('ids');
  
  if (!ids) {
    return json({ error: 'Page IDs are required' }, { status: 400 });
  }
  
  try {
    const pageIds = ids.split(',').filter(Boolean);
    const statusMap = await asyncEmbeddingService.getBulkStatus(pageIds);
    
    // Convert Map to plain object for JSON serialization
    const statuses: Record<string, any> = {};
    statusMap.forEach((status, pageId) => {
      statuses[pageId] = status;
    });
    
    return json({ statuses });
  } catch (error) {
    console.error('Failed to get bulk embedding status:', error);
    return json(
      { error: 'Failed to get bulk embedding status' },
      { status: 500 }
    );
  }
};