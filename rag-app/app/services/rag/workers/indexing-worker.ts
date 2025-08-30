import { Worker, Job } from 'bullmq';
import { redisWorker } from '~/utils/redis.server';
import { ragIndexingService } from '../rag-indexing.service';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('IndexingWorker');

interface IndexingJobData {
  pageId: string;
  priority?: number;
  retryCount?: number;
}

/**
 * BullMQ Worker for processing page indexing jobs
 * Handles the background processing of page content for RAG
 */
export class IndexingWorker {
  private worker: Worker<IndexingJobData> | null = null;
  private isShuttingDown = false;
  
  /**
   * Start the indexing worker
   */
  async start(): Promise<void> {
    if (!redisWorker) {
      logger.warn('Redis not available, worker will not start');
      return;
    }
    
    if (this.worker) {
      logger.info('Worker already running');
      return;
    }
    
    logger.info('🚀 Starting indexing worker');
    
    this.worker = new Worker<IndexingJobData>(
      'page-indexing',
      async (job: Job<IndexingJobData>) => {
        const { pageId, retryCount = 0 } = job.data;
        
        logger.info(`📋 Processing indexing job`, {
          jobId: job.id,
          pageId,
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts
        });
        
        try {
          // Process the page
          await ragIndexingService.processPage(pageId);
          
          logger.info(`✅ Successfully indexed page`, { 
            pageId,
            jobId: job.id 
          });
          
          return { 
            success: true, 
            pageId,
            timestamp: new Date().toISOString()
          };
          
        } catch (error) {
          logger.error(`❌ Failed to index page`, {
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
        connection: redisWorker,
        concurrency: 3, // Process 3 pages simultaneously
        
        // Rate limiting to avoid overwhelming OpenAI
        limiter: {
          max: 10,        // Max 10 jobs
          duration: 60000 // per minute
        },
        
        // Advanced settings
        settings: {
          stalledInterval: 30000,  // Check for stalled jobs every 30s
          maxStalledCount: 2       // Mark as failed after 2 stalls
        }
      }
    );
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Handle graceful shutdown
    this.setupShutdownHandlers();
    
    logger.info('✅ Indexing worker started successfully');
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
          
          // Wait for current jobs to complete (max 30 seconds)
          await this.worker.close(30000);
          
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
    
    logger.info('Stopping indexing worker...');
    
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
export const indexingWorker = new IndexingWorker();