import { Worker, Job, Queue } from 'bullmq';
import { redisWorker } from '~/utils/redis.server';
import { optimizedIndexingService } from '../optimized-indexing.service';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('OptimizedIndexingWorker');

interface IndexingJobData {
  pageId: string;
  priority?: number;
  immediate?: boolean;
  forceReindex?: boolean;
}

/**
 * Optimized BullMQ Worker with better timeout and lock handling
 */
export class OptimizedIndexingWorker {
  private worker: Worker<IndexingJobData> | null = null;
  private queue: Queue<IndexingJobData> | null = null;
  private isShuttingDown = false;
  
  /**
   * Start the optimized indexing worker
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
    
    logger.info('🚀 Starting optimized indexing worker');
    
    // Create queue with proper settings
    this.queue = new Queue<IndexingJobData>('optimized-page-indexing', {
      connection: redisWorker,
      defaultJobOptions: {
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
          age: 3600,  // Keep for 1 hour
        },
        removeOnFail: {
          count: 50,  // Keep last 50 failed jobs
          age: 7200,  // Keep for 2 hours
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2 second delay
        },
      },
    });
    
    this.worker = new Worker<IndexingJobData>(
      'optimized-page-indexing',
      async (job: Job<IndexingJobData>) => {
        const startTime = Date.now();
        const { pageId, immediate = false, forceReindex = false } = job.data;
        
        logger.info(`📋 Processing optimized indexing job`, {
          jobId: job.id,
          pageId,
          immediate,
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts
        });
        
        try {
          // Update job progress
          await job.updateProgress(10);
          
          // Check if needs reindexing (skip if indexed recently unless forced)
          if (!forceReindex && !immediate) {
            const needsReindex = await optimizedIndexingService.needsReindexing(pageId, 5);
            if (!needsReindex) {
              logger.info('⏩ Skipping - recently indexed', { pageId });
              return { 
                success: true, 
                skipped: true,
                pageId,
                timestamp: new Date().toISOString()
              };
            }
          }
          
          await job.updateProgress(20);
          
          // Process the page with optimized service
          await optimizedIndexingService.indexPage(pageId, {
            immediate: true, // Always immediate in worker
            forceReindex,
            skipCache: false,
          });
          
          await job.updateProgress(100);
          
          const duration = Date.now() - startTime;
          logger.info(`✅ Successfully indexed page`, { 
            pageId,
            jobId: job.id,
            duration
          });
          
          return { 
            success: true, 
            pageId,
            duration,
            timestamp: new Date().toISOString()
          };
          
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error(`❌ Failed to index page`, {
            pageId,
            jobId: job.id,
            attempt: job.attemptsMade + 1,
            duration,
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
          });
          
          // Re-throw to trigger retry
          throw error;
        }
      },
      {
        connection: redisWorker,
        concurrency: 5, // Process 5 pages simultaneously
        
        // Rate limiting to avoid overwhelming OpenAI
        limiter: {
          max: 20,        // Max 20 jobs
          duration: 60000 // per minute
        },
        
        // Lock settings to prevent timeouts
        lockDuration: 60000,        // 60 seconds lock duration
        lockRenewTime: 30000,       // Renew lock every 30 seconds
        
        // Advanced settings
        settings: {
          stalledInterval: 45000,    // Check for stalled jobs every 45s
          maxStalledCount: 3         // Mark as failed after 3 stalls
        }
      }
    );
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Handle graceful shutdown
    this.setupShutdownHandlers();
    
    logger.info('✅ Optimized indexing worker started successfully');
  }
  
  /**
   * Add a job to the queue
   */
  async addJob(pageId: string, options: Partial<IndexingJobData> = {}): Promise<void> {
    if (!this.queue) {
      logger.warn('Queue not initialized');
      return;
    }
    
    const jobData: IndexingJobData = {
      pageId,
      ...options,
    };
    
    // Use page ID as job ID for deduplication
    const jobId = `page-${pageId}-${Date.now()}`;
    
    await this.queue.add('index', jobData, {
      jobId,
      priority: options.priority || 0,
      delay: options.immediate ? 0 : 1000, // 1 second delay for non-immediate
    });
    
    logger.info('📥 Job added to queue', { jobId, pageId });
  }
  
  /**
   * Set up event handlers for the worker
   */
  private setupEventHandlers(): void {
    if (!this.worker) return;
    
    this.worker.on('completed', (job) => {
      logger.info(`✅ Job completed`, {
        jobId: job.id,
        pageId: job.data.pageId,
        duration: job.finishedOn ? job.finishedOn - (job.processedOn || 0) : 0
      });
    });
    
    this.worker.on('failed', (job, err) => {
      logger.error(`❌ Job failed`, {
        jobId: job?.id,
        pageId: job?.data.pageId,
        attempts: job?.attemptsMade,
        error: err.message,
        stack: err.stack
      });
    });
    
    this.worker.on('error', (err) => {
      logger.error('Worker error', {
        error: err.message,
        stack: err.stack
      });
    });
    
    this.worker.on('stalled', (jobId) => {
      logger.warn(`⚠️ Job stalled`, { jobId });
    });
  }
  
  /**
   * Set up graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      
      logger.info('🛑 Shutting down worker gracefully...');
      
      if (this.worker) {
        await this.worker.close();
      }
      
      if (this.queue) {
        await this.queue.close();
      }
      
      logger.info('✅ Worker shut down complete');
      process.exit(0);
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
  
  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
    
    logger.info('🛑 Worker stopped');
  }
}

// Export singleton instance
export const optimizedIndexingWorker = new OptimizedIndexingWorker();