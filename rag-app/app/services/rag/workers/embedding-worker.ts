import { Worker, Job } from 'bullmq';
import { getRedisWorker } from '~/utils/redis.server';
import { asyncEmbeddingService } from '../async-embedding.service';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('EmbeddingWorker');

interface EmbeddingJobData {
  pageId: string;
  workspaceId: string;
  priority?: number;
  retryCount?: number;
}

/**
 * BullMQ Worker for processing embedding generation jobs
 * Handles the background processing of page embeddings with retry logic
 */
export class EmbeddingWorker {
  private worker: Worker<EmbeddingJobData> | null = null;
  private isShuttingDown = false;
  
  /**
   * Start the embedding worker
   */
  async start(): Promise<void> {
    // Get Redis worker client asynchronously
    let redisWorkerClient;
    try {
      redisWorkerClient = await getRedisWorker();
      logger.info('Redis worker client obtained successfully');
    } catch (error) {
      logger.error('Failed to get Redis worker client:', error);
      logger.warn('Worker will not start without Redis');
      return;
    }
    
    if (this.worker) {
      logger.info('Worker already running');
      return;
    }
    
    logger.info('🚀 Starting embedding worker');
    
    this.worker = new Worker<EmbeddingJobData>(
      'embedding-generation',
      async (job: Job<EmbeddingJobData>) => {
        const { pageId, workspaceId, retryCount = 0 } = job.data;
        
        logger.info(`📋 Processing embedding job`, {
          jobId: job.id,
          pageId,
          workspaceId,
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts
        });
        
        try {
          // Process the embedding
          await asyncEmbeddingService.processEmbedding(pageId, workspaceId);
          
          logger.info(`✅ Successfully generated embeddings`, { 
            pageId,
            jobId: job.id 
          });
          
          return { 
            success: true, 
            pageId,
            workspaceId,
            timestamp: new Date().toISOString()
          };
          
        } catch (error) {
          logger.error(`❌ Failed to generate embeddings`, {
            pageId,
            jobId: job.id,
            attempt: job.attemptsMade + 1,
            error: error instanceof Error ? error.message : error
          });
          
          // Re-throw to trigger retry
          throw error;
        }
      },
      {
        connection: redisWorkerClient,
        concurrency: 2, // Process 2 embedding jobs simultaneously
        
        // Rate limiting to avoid overwhelming OpenAI
        limiter: {
          max: 5,         // Max 5 jobs
          duration: 60000 // per minute
        },
        
        // Advanced settings
        settings: {
          stalledInterval: 60000,  // Check for stalled jobs every minute
          maxStalledCount: 2       // Mark as failed after 2 stalls
        }
      }
    );
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Handle graceful shutdown
    this.setupShutdownHandlers();
    
    logger.info('✅ Embedding worker started successfully');
  }
  
  /**
   * Setup event handlers for monitoring
   */
  private setupEventHandlers(): void {
    if (!this.worker) return;
    
    this.worker.on('completed', (job) => {
      logger.info(`✅ Job completed`, {
        jobId: job.id,
        pageId: job.data.pageId,
        duration: job.finishedOn ? job.finishedOn - job.processedOn! : 0
      });
    });
    
    this.worker.on('failed', (job, error) => {
      logger.error(`❌ Job failed`, {
        jobId: job?.id,
        pageId: job?.data.pageId,
        attempts: job?.attemptsMade,
        error: error.message
      });
    });
    
    this.worker.on('active', (job) => {
      logger.info(`⚡ Job started`, {
        jobId: job.id,
        pageId: job.data.pageId
      });
    });
    
    this.worker.on('stalled', (jobId) => {
      logger.warn(`⚠️ Job stalled`, { jobId });
    });
    
    this.worker.on('error', (error) => {
      logger.error(`Worker error`, error);
    });
    
    this.worker.on('progress', (job, progress) => {
      logger.info(`📊 Job progress`, {
        jobId: job.id,
        pageId: job.data.pageId,
        progress
      });
    });
  }
  
  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const gracefulShutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      
      logger.info(`🛑 Received ${signal}, shutting down gracefully...`);
      
      try {
        if (this.worker) {
          // Stop accepting new jobs
          await this.worker.pause();
          
          // Wait for current jobs to complete (max 60 seconds for embeddings)
          await this.worker.close(60000);
          
          logger.info('✅ Worker shut down gracefully');
        }
      } catch (error) {
        logger.error('Error during shutdown', error);
      } finally {
        process.exit(0);
      }
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
  
  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (!this.worker) return;
    
    logger.info('Stopping embedding worker...');
    
    await this.worker.pause();
    await this.worker.close();
    
    this.worker = null;
    
    logger.info('Worker stopped');
  }
  
  /**
   * Get worker metrics
   */
  async getMetrics(): Promise<{
    isRunning: boolean;
    queue?: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
  }> {
    if (!this.worker) {
      return { isRunning: false };
    }
    
    const queue = this.worker.queue;
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ]);
    
    return {
      isRunning: true,
      queue: {
        waiting,
        active,
        completed,
        failed,
        delayed
      }
    };
  }
}

// Export singleton instance
export const embeddingWorker = new EmbeddingWorker();