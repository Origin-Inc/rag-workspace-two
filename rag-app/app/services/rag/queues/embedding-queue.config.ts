import { QueueOptions, JobsOptions, WorkerOptions } from 'bullmq';
import { redis, redisWorker } from '~/utils/redis.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('EmbeddingQueueConfig');

/**
 * Configuration for the embedding generation queue
 * Optimized for ultra-light processing with memory constraints
 */
export const EMBEDDING_QUEUE_NAME = 'ultra-light-embeddings';

/**
 * Queue configuration for ultra-light embedding generation
 */
export const embeddingQueueConfig: QueueOptions = {
  connection: redis || undefined,
  defaultJobOptions: {
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 100, // Keep last 100 completed jobs
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
      count: 50, // Keep last 50 failed jobs
    },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 second delay
    },
  },
};

/**
 * Job options for different priority levels
 */
export const embeddingJobOptions = {
  high: {
    priority: 1,
    delay: 0,
  } as JobsOptions,
  
  normal: {
    priority: 5,
    delay: 0,
  } as JobsOptions,
  
  low: {
    priority: 10,
    delay: 1000, // 1 second delay for low priority
  } as JobsOptions,
  
  debounced: {
    priority: 5,
    delay: 1000, // 1 second debounce
    jobId: undefined, // Will be set dynamically to prevent duplicates
  } as JobsOptions,
};

/**
 * Worker configuration for processing embedding jobs
 */
export const embeddingWorkerConfig: WorkerOptions = {
  connection: redisWorker || undefined,
  concurrency: 2, // Process 2 jobs simultaneously to avoid overwhelming OpenAI
  
  // Rate limiting to respect OpenAI rate limits
  limiter: {
    max: 10, // Max 10 jobs
    duration: 60000, // per minute
  },
  
  // Advanced settings for production
  settings: {
    stalledInterval: 30000, // Check for stalled jobs every 30 seconds
    maxStalledCount: 2, // Mark as failed after 2 stalls
  },
  
  // Lock settings
  lockDuration: 60000, // Lock job for 60 seconds while processing
  lockRenewTime: 30000, // Renew lock every 30 seconds
};

/**
 * Interface for embedding job data
 */
export interface UltraLightEmbeddingJobData {
  pageId: string;
  workspaceId: string;
  chunks: Array<{
    text: string;
    index: number;
    metadata?: Record<string, any>;
  }>;
  pageTitle?: string;
  priority?: number;
  retryCount?: number;
  debounced?: boolean;
}

/**
 * Interface for embedding job result
 */
export interface UltraLightEmbeddingJobResult {
  success: boolean;
  pageId: string;
  workspaceId: string;
  embeddingsGenerated: number;
  processingTimeMs: number;
  error?: string;
}

/**
 * Helper to check if queue is available
 */
export function isQueueAvailable(): boolean {
  const available = !!(redis || redisWorker);
  if (!available) {
    logger.warn('Redis not available for queue operations');
  }
  return available;
}

/**
 * Helper to get job ID for deduplication
 */
export function getEmbeddingJobId(pageId: string, debounced: boolean = false): string {
  if (debounced) {
    // For debounced jobs, use a stable ID to prevent duplicates
    return `embed-page-${pageId}`;
  }
  // For immediate jobs, include timestamp to allow multiple
  return `embed-page-${pageId}-${Date.now()}`;
}