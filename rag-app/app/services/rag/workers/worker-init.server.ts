import { DebugLogger } from '~/utils/debug-logger';
import { ultraLightEmbeddingWorker } from './ultra-light-embedding-worker';
import { embeddingWorker } from './embedding-worker';

const logger = new DebugLogger('WorkerInit');

/**
 * Initialize all background workers
 * This should be called once when the application starts
 */
export async function initializeWorkers(): Promise<void> {
  logger.info('🚀 Initializing background workers...');
  
  try {
    // Start ultra-light embedding worker (for new async queue)
    await ultraLightEmbeddingWorker.start();
    logger.info('✅ Ultra-light embedding worker started');
    
    // Start regular embedding worker (for existing async-embedding service)
    await embeddingWorker.start();
    logger.info('✅ Regular embedding worker started');
    
    logger.info('✅ All workers initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize workers', error);
    // Don't throw - allow app to start even if workers fail
    // The queue services have fallback to synchronous processing
  }
}

/**
 * Gracefully shutdown all workers
 */
export async function shutdownWorkers(): Promise<void> {
  logger.info('🛑 Shutting down workers...');
  
  try {
    await Promise.all([
      ultraLightEmbeddingWorker.stop(),
      embeddingWorker.stop()
    ]);
    
    logger.info('✅ All workers shut down successfully');
  } catch (error) {
    logger.error('Error during worker shutdown', error);
  }
}

/**
 * Get status of all workers
 */
export async function getWorkersStatus(): Promise<{
  ultraLightEmbedding: any;
  regularEmbedding: any;
}> {
  const [ultraLight, regular] = await Promise.all([
    ultraLightEmbeddingWorker.getMetrics(),
    embeddingWorker.getMetrics()
  ]);
  
  return {
    ultraLightEmbedding: ultraLight,
    regularEmbedding: regular
  };
}

// Initialize workers if running in worker mode
if (process.env.WORKER_MODE === 'true') {
  initializeWorkers().catch(error => {
    logger.error('Failed to start workers in worker mode', error);
    process.exit(1);
  });
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    await shutdownWorkers();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    await shutdownWorkers();
    process.exit(0);
  });
}