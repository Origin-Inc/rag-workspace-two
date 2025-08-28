import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { getWorkersStatus } from '~/services/rag/workers/start-workers.server';
import { requireUser } from '~/services/auth/auth.server';

/**
 * API route to check background worker status
 * GET /api/workers-status
 */
export async function loader({ request }: LoaderFunctionArgs) {
  // Optionally require authentication
  // await requireUser(request);
  
  try {
    const status = await getWorkersStatus();
    
    return json({
      success: true,
      ...status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get worker status'
    }, { status: 500 });
  }
}