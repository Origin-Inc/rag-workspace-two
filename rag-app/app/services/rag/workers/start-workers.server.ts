import { indexingWorker } from './indexing-worker';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('WorkerManager');

let workersStarted = false;

/**
 * Start all background workers
 * Called once when the server starts
 */
export async function startWorkers(): Promise<void> {
  if (workersStarted) {
    logger.info('Workers already started');
    return;
  }
  
  logger.info('🚀 Starting background workers...');
  
  try {
    // Start the indexing worker
    await indexingWorker.start();
    
    workersStarted = true;
    logger.info('✅ All workers started successfully');
    
  } catch (error) {
    logger.error('Failed to start workers', error);
    // Don't throw - app should still work without workers
  }
}

/**
 * Stop all background workers
 * Called during graceful shutdown
 */
export async function stopWorkers(): Promise<void> {
  if (!workersStarted) return;
  
  logger.info('Stopping background workers...');
  
  try {
    await indexingWorker.stop();
    workersStarted = false;
    logger.info('All workers stopped');
  } catch (error) {
    logger.error('Error stopping workers', error);
  }
}

/**
 * Get status of all workers
 */
export async function getWorkersStatus() {
  const indexingMetrics = await indexingWorker.getMetrics();
  
  return {
    workersStarted,
    indexing: indexingMetrics
  };
}

// Auto-start workers in production
if (process.env.NODE_ENV === 'production' || process.env.START_WORKERS === 'true') {
  startWorkers().catch(error => {
    logger.error('Failed to auto-start workers', error);
  });
}