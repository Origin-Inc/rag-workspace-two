/**
 * Vercel Cron Job for processing indexing queue
 * Runs every minute to process pending indexing jobs
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Queue } from 'bullmq';
import { IndexingWorker } from '~/services/rag/workers/indexing-worker';
import { DebugLogger } from '~/utils/debug-logger';
import IORedis from 'ioredis';

const logger = new DebugLogger('CronIndexing');

// Vercel Edge Function timeout is 30 seconds max
const CRON_TIMEOUT_MS = 25000;

export async function loader({ request }: LoaderFunctionArgs) {
  // Verify this is called by Vercel Cron (in production)
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production') {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      logger.warn('Unauthorized cron request');
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const startTime = Date.now();
  logger.info('Starting cron indexing job');

  let redis: IORedis | null = null;
  let processedCount = 0;
  let errorCount = 0;

  try {
    // Create Redis connection for this cron run
    redis = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    await redis.connect();

    // Check queue status
    const queue = new Queue('page-indexing', { connection: redis });
    const waitingCount = await queue.getWaitingCount();
    const activeCount = await queue.getActiveCount();
    
    logger.info('Queue status', { waitingCount, activeCount });

    if (waitingCount === 0 && activeCount === 0) {
      logger.info('No jobs to process');
      await redis.quit();
      return json({ 
        status: 'idle',
        processed: 0,
        waiting: 0,
        duration: Date.now() - startTime
      });
    }

    // Process jobs for up to 25 seconds
    const worker = new IndexingWorker();
    
    // Create a temporary worker that will process jobs
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve('timeout'), CRON_TIMEOUT_MS);
    });

    const processingPromise = new Promise(async (resolve) => {
      // Start the worker temporarily
      await worker.start();
      
      // Wait for jobs to be processed
      worker.on('completed', () => {
        processedCount++;
      });
      
      worker.on('failed', () => {
        errorCount++;
      });

      // Keep processing until timeout
      while (Date.now() - startTime < CRON_TIMEOUT_MS) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const waiting = await queue.getWaitingCount();
        if (waiting === 0) {
          resolve('complete');
          break;
        }
      }
    });

    // Wait for either timeout or completion
    await Promise.race([timeoutPromise, processingPromise]);

    // Stop the worker
    await worker.stop();

    const finalWaitingCount = await queue.getWaitingCount();
    
    logger.info('Cron job completed', {
      processed: processedCount,
      errors: errorCount,
      remaining: finalWaitingCount,
      duration: Date.now() - startTime
    });

    await redis.quit();

    return json({
      status: 'success',
      processed: processedCount,
      errors: errorCount,
      remaining: finalWaitingCount,
      duration: Date.now() - startTime
    });

  } catch (error) {
    logger.error('Cron job failed', error);
    
    if (redis) {
      try {
        await redis.quit();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      processed: processedCount,
      errors: errorCount,
      duration: Date.now() - startTime
    }, { status: 500 });
  }
}

// Health check endpoint
export async function action({ request }: LoaderFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const formData = await request.formData();
  const action = formData.get('action');

  if (action === 'health') {
    let redis: IORedis | null = null;
    
    try {
      redis = new IORedis(process.env.REDIS_URL!, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        lazyConnect: true,
        commandTimeout: 5000,
      });

      await redis.connect();
      await redis.ping();

      const queue = new Queue('page-indexing', { connection: redis });
      const health = await queue.getJobCounts();
      
      await redis.quit();

      return json({
        status: 'healthy',
        queue: health,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (redis) {
        try {
          await redis.quit();
        } catch (e) {
          // Ignore
        }
      }
      
      return json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, { status: 503 });
    }
  }

  return json({ error: 'Invalid action' }, { status: 400 });
}