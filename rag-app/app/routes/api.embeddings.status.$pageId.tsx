import { json, type LoaderFunction } from '@remix-run/node';
import { asyncEmbeddingService } from '~/services/rag/async-embedding.service';

export const loader: LoaderFunction = async ({ params }) => {
  const { pageId } = params;
  
  if (!pageId) {
    return json({ error: 'Page ID is required' }, { status: 400 });
  }
  
  try {
    const status = await asyncEmbeddingService.getStatus(pageId);
    
    return json({ status });
  } catch (error) {
    console.error('Failed to get embedding status:', error);
    return json(
      { error: 'Failed to get embedding status' },
      { status: 500 }
    );
  }
};