import { QueueOptions, JobsOptions, WorkerOptions } from 'bullmq';
import { getRedis, getRedisWorker } from '~/utils/redis.server';
import { DebugLogger } from '~/utils/debug-logger';
import type Redis from 'ioredis';

const logger = new DebugLogger('EmbeddingQueueConfig');

/**
 * Configuration for the embedding generation queue
 * Optimized for ultra-light processing with memory constraints
 */
export const EMBEDDING_QUEUE_NAME = 'ultra-light-embeddings';

/**
 * Get queue configuration for ultra-light embedding generation
 * Returns config with properly initialized Redis connection
 */
export async function getEmbeddingQueueConfig(): Promise<QueueOptions> {
  let connection: Redis | undefined;
  
  try {
    connection = await getRedis();
    logger.trace('Redis connection obtained for queue config');
    
    // Verify the connection is actually working
    await connection.ping();
    logger.trace('Redis connection verified with ping');
  } catch (error) {
    logger.warn('Redis not available for queue config:', error);
    // In production, we should not try to create a queue without Redis
    if (process.env["NODE_ENV"] === "production") {
      logger.error('Cannot create queue in production without Redis');
      throw new Error('Redis is required for queue operations in production');
    }
    connection = undefined;
  }
  
  return {
    connection,
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
}

/**
 * Legacy config for backward compatibility (may have undefined connection)
 * @deprecated Use getEmbeddingQueueConfig() instead
 */
export const embeddingQueueConfig: QueueOptions = {
  connection: undefined, // Will be undefined at module load
  defaultJobOptions: {
    removeOnComplete: {
      age: 3600,
      count: 100,
    },
    removeOnFail: {
      age: 86400,
      count: 50,
    },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
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
 * Get worker configuration for processing embedding jobs
 * Returns config with properly initialized Redis worker connection
 */
export async function getEmbeddingWorkerConfig(): Promise<WorkerOptions> {
  let connection: Redis | undefined;
  
  try {
    connection = await getRedisWorker();
    logger.trace('Redis worker connection obtained for worker config');
  } catch (error) {
    logger.warn('Redis worker not available for worker config:', error);
    connection = undefined;
  }
  
  return {
    connection,
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
  };
}

/**
 * Legacy config for backward compatibility (may have undefined connection)
 * @deprecated Use getEmbeddingWorkerConfig() instead
 */
export const embeddingWorkerConfig: WorkerOptions = {
  connection: undefined, // Will be undefined at module load
  concurrency: 2,
  limiter: {
    max: 10,
    duration: 60000,
  },
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 2,
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
 * @returns Promise that resolves to true if Redis is available
 */
export async function isQueueAvailable(): Promise<boolean> {
  try {
    // Try to get Redis connection
    await getRedis();
    return true;
  } catch (error) {
    logger.warn('Redis not available for queue operations:', error);
    return false;
  }
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