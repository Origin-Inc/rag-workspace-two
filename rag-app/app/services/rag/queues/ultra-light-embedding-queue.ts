import { Queue, Job } from 'bullmq';
import { DebugLogger } from '~/utils/debug-logger';
import { 
  EMBEDDING_QUEUE_NAME, 
  embeddingQueueConfig, 
  embeddingJobOptions,
  getEmbeddingJobId,
  isQueueAvailable,
  type UltraLightEmbeddingJobData,
  type UltraLightEmbeddingJobResult 
} from './embedding-queue.config';

/**
 * Queue service for ultra-light embedding generation
 * Handles job queueing, deduplication, and status tracking
 */
export class UltraLightEmbeddingQueue {
  private static instance: UltraLightEmbeddingQueue;
  private logger = new DebugLogger('UltraLightEmbeddingQueue');
  private queue: Queue<UltraLightEmbeddingJobData, UltraLightEmbeddingJobResult> | null = null;
  private initPromise: Promise<void> | null = null;
  
  private constructor() {
    // Initialize on first use
  }
  
  static getInstance(): UltraLightEmbeddingQueue {
    if (!UltraLightEmbeddingQueue.instance) {
      UltraLightEmbeddingQueue.instance = new UltraLightEmbeddingQueue();
    }
    return UltraLightEmbeddingQueue.instance;
  }
  
  /**
   * Initialize the queue (lazy initialization)
   */
  private async initialize(): Promise<void> {
    if (this.queue) return;
    
    // Prevent multiple initialization attempts
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    
    this.initPromise = this.doInitialize();
    await this.initPromise;
  }
  
  private async doInitialize(): Promise<void> {
    try {
      if (!isQueueAvailable()) {
        this.logger.warn('Queue not available - Redis not configured');
        return;
      }
      
      const { Queue } = await import('bullmq');
      this.queue = new Queue<UltraLightEmbeddingJobData, UltraLightEmbeddingJobResult>(
        EMBEDDING_QUEUE_NAME,
        embeddingQueueConfig
      );
      
      // Set up event handlers
      this.setupEventHandlers();
      
      this.logger.info('✅ Embedding queue initialized');
    } catch (error) {
      this.logger.error('Failed to initialize queue', error);
      this.queue = null;
    }
  }
  
  /**
   * Setup queue event handlers for monitoring
   */
  private setupEventHandlers(): void {
    if (!this.queue) return;
    
    this.queue.on('error', (error) => {
      this.logger.error('Queue error', error);
    });
    
    this.queue.on('cleaned', (jobs, type) => {
      this.logger.info(`Cleaned ${jobs.length} ${type} jobs`);
    });
  }
  
  /**
   * Queue embedding generation for page chunks
   */
  async queueEmbedding(
    pageId: string,
    workspaceId: string,
    chunks: UltraLightEmbeddingJobData['chunks'],
    options: {
      pageTitle?: string;
      priority?: 'high' | 'normal' | 'low';
      debounced?: boolean;
    } = {}
  ): Promise<string | null> {
    await this.initialize();
    
    if (!this.queue) {
      this.logger.warn('Queue not available, embeddings will be processed synchronously');
      return null;
    }
    
    try {
      const { pageTitle, priority = 'normal', debounced = false } = options;
      
      // Create job data
      const jobData: UltraLightEmbeddingJobData = {
        pageId,
        workspaceId,
        chunks,
        pageTitle,
        priority: embeddingJobOptions[priority].priority,
        debounced,
      };
      
      // Get job options based on priority and debouncing
      const jobOptions = debounced 
        ? { ...embeddingJobOptions.debounced, jobId: getEmbeddingJobId(pageId, true) }
        : { ...embeddingJobOptions[priority], jobId: getEmbeddingJobId(pageId, false) };
      
      // Remove any existing debounced job if this is a new debounced job
      if (debounced) {
        const existingJob = await this.queue.getJob(jobOptions.jobId!);
        if (existingJob && ['waiting', 'delayed'].includes(await existingJob.getState())) {
          await existingJob.remove();
          this.logger.info('Removed existing debounced job', { pageId });
        }
      }
      
      // Add job to queue
      const job = await this.queue.add(
        'generate-embeddings',
        jobData,
        jobOptions
      );
      
      this.logger.info('📋 Queued embedding job', {
        jobId: job.id,
        pageId,
        chunks: chunks.length,
        priority,
        debounced
      });
      
      return job.id as string;
      
    } catch (error) {
      this.logger.error('Failed to queue embedding job', { pageId, error });
      return null;
    }
  }
  
  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<{
    state: string;
    progress: number;
    result?: UltraLightEmbeddingJobResult;
    error?: string;
  } | null> {
    if (!this.queue) return null;
    
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) return null;
      
      const state = await job.getState();
      const progress = job.progress as number || 0;
      
      return {
        state,
        progress,
        result: job.returnvalue,
        error: job.failedReason,
      };
    } catch (error) {
      this.logger.error('Failed to get job status', { jobId, error });
      return null;
    }
  }
  
  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<{
    isAvailable: boolean;
    waiting?: number;
    active?: number;
    completed?: number;
    failed?: number;
    delayed?: number;
  }> {
    if (!this.queue) {
      return { isAvailable: false };
    }
    
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
        this.queue.getDelayedCount(),
      ]);
      
      return {
        isAvailable: true,
        waiting,
        active,
        completed,
        failed,
        delayed,
      };
    } catch (error) {
      this.logger.error('Failed to get metrics', error);
      return { isAvailable: false };
    }
  }
  
  /**
   * Clear completed jobs older than specified age
   */
  async cleanCompleted(ageMs: number = 3600000): Promise<void> {
    if (!this.queue) return;
    
    try {
      const jobs = await this.queue.clean(ageMs, 100, 'completed');
      this.logger.info(`Cleaned ${jobs.length} completed jobs`);
    } catch (error) {
      this.logger.error('Failed to clean completed jobs', error);
    }
  }
  
  /**
   * Retry failed jobs
   */
  async retryFailed(): Promise<number> {
    if (!this.queue) return 0;
    
    try {
      const failedJobs = await this.queue.getFailed();
      let retriedCount = 0;
      
      for (const job of failedJobs) {
        if (job.attemptsMade < 3) {
          await job.retry();
          retriedCount++;
        }
      }
      
      this.logger.info(`Retried ${retriedCount} failed jobs`);
      return retriedCount;
    } catch (error) {
      this.logger.error('Failed to retry jobs', error);
      return 0;
    }
  }
  
  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    if (!this.queue) return;
    await this.queue.pause();
    this.logger.info('Queue paused');
  }
  
  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    if (!this.queue) return;
    await this.queue.resume();
    this.logger.info('Queue resumed');
  }
  
  /**
   * Close the queue connection
   */
  async close(): Promise<void> {
    if (!this.queue) return;
    
    await this.queue.close();
    this.queue = null;
    this.logger.info('Queue closed');
  }
}

// Export singleton instance
export const ultraLightEmbeddingQueue = UltraLightEmbeddingQueue.getInstance();