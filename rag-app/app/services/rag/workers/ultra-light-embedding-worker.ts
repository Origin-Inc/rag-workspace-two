import { Worker, Job } from 'bullmq';
import { openai } from '../../openai.server';
import { prisma } from '~/utils/db.server';
import { withRetry } from '~/utils/db.server';
import { connectionPoolManager } from '../../connection-pool-manager.server';
import { DebugLogger } from '~/utils/debug-logger';
import {
  EMBEDDING_QUEUE_NAME,
  embeddingWorkerConfig,
  isQueueAvailable,
  type UltraLightEmbeddingJobData,
  type UltraLightEmbeddingJobResult
} from '../queues/embedding-queue.config';

/**
 * Worker for processing ultra-light embedding generation jobs
 * Handles OpenAI API calls and database storage with connection pooling
 */
export class UltraLightEmbeddingWorker {
  private static instance: UltraLightEmbeddingWorker;
  private logger = new DebugLogger('UltraLightEmbeddingWorker');
  private worker: Worker<UltraLightEmbeddingJobData, UltraLightEmbeddingJobResult> | null = null;
  private isShuttingDown = false;
  
  // Configuration
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIMENSION = 1536;
  private readonly BATCH_SIZE = 5; // Process 5 chunks at a time
  private readonly MAX_REQUEST_SIZE = 8 * 1024 * 1024; // 8MB limit
  
  private constructor() {}
  
  static getInstance(): UltraLightEmbeddingWorker {
    if (!UltraLightEmbeddingWorker.instance) {
      UltraLightEmbeddingWorker.instance = new UltraLightEmbeddingWorker();
    }
    return UltraLightEmbeddingWorker.instance;
  }
  
  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (!isQueueAvailable()) {
      this.logger.warn('Redis not available, worker will not start');
      return;
    }
    
    if (this.worker) {
      this.logger.info('Worker already running');
      return;
    }
    
    this.logger.info('🚀 Starting ultra-light embedding worker');
    
    const { Worker } = await import('bullmq');
    
    this.worker = new Worker<UltraLightEmbeddingJobData, UltraLightEmbeddingJobResult>(
      EMBEDDING_QUEUE_NAME,
      async (job: Job<UltraLightEmbeddingJobData>) => {
        return await this.processJob(job);
      },
      embeddingWorkerConfig
    );
    
    this.setupEventHandlers();
    this.setupShutdownHandlers();
    
    this.logger.info('✅ Ultra-light embedding worker started');
  }
  
  /**
   * Process a single embedding job
   */
  private async processJob(job: Job<UltraLightEmbeddingJobData>): Promise<UltraLightEmbeddingJobResult> {
    const startTime = Date.now();
    const { pageId, workspaceId, chunks, pageTitle } = job.data;
    
    this.logger.info(`📋 Processing embedding job`, {
      jobId: job.id,
      pageId,
      workspaceId,
      chunks: chunks.length,
      attempt: job.attemptsMade + 1
    });
    
    try {
      // Use connection pool manager to prevent exhaustion
      const result = await connectionPoolManager.executeWithPoolManagement(
        `embed-job-${job.id}`,
        async () => {
          // First, clean up old embeddings
          await this.cleanupOldEmbeddings(pageId);
          
          // Process chunks in batches
          let totalEmbeddings = 0;
          const totalChunks = chunks.length;
          
          for (let i = 0; i < chunks.length; i += this.BATCH_SIZE) {
            const batch = chunks.slice(i, i + this.BATCH_SIZE);
            const progress = Math.floor((i / totalChunks) * 100);
            
            // Update job progress
            await job.updateProgress(progress);
            
            // Generate embeddings for batch
            const embeddings = await this.generateBatchEmbeddings(batch);
            
            // Store embeddings in database
            await this.storeEmbeddings(
              pageId,
              workspaceId,
              pageTitle || '',
              batch,
              embeddings
            );
            
            totalEmbeddings += embeddings.length;
            
            // Small delay between batches to avoid rate limiting
            if (i + this.BATCH_SIZE < chunks.length) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
          
          // Clear AI cache for the page
          await this.clearAICache(pageId, workspaceId);
          
          return totalEmbeddings;
        }
      );
      
      const processingTime = Date.now() - startTime;
      
      this.logger.info(`✅ Successfully generated embeddings`, {
        pageId,
        jobId: job.id,
        embeddingsGenerated: result,
        processingTimeMs: processingTime
      });
      
      return {
        success: true,
        pageId,
        workspaceId,
        embeddingsGenerated: result,
        processingTimeMs: processingTime
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error(`❌ Failed to generate embeddings`, {
        pageId,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        error: errorMessage
      });
      
      // Re-throw to trigger retry
      throw error;
    }
  }
  
  /**
   * Generate embeddings for a batch of chunks
   */
  private async generateBatchEmbeddings(
    chunks: UltraLightEmbeddingJobData['chunks']
  ): Promise<number[][]> {
    try {
      const response = await openai.embeddings.create({
        model: this.EMBEDDING_MODEL,
        input: chunks.map(c => c.text),
        dimensions: this.EMBEDDING_DIMENSION,
      });
      
      return response.data.map(d => d.embedding);
    } catch (error) {
      this.logger.error('OpenAI API error', error);
      throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Clean up old embeddings for a page
   */
  private async cleanupOldEmbeddings(pageId: string): Promise<void> {
    try {
      const countBefore = await withRetry(() =>
        prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count FROM page_embeddings 
          WHERE page_id = ${pageId}::uuid
        `
      );
      
      const deleteResult = await withRetry(() =>
        prisma.$transaction(async (tx) => {
          const deleted = await tx.$executeRaw`
            DELETE FROM page_embeddings 
            WHERE page_id = ${pageId}::uuid
          `;
          
          // Verify deletion
          const remaining = await tx.$queryRaw<any[]>`
            SELECT COUNT(*) as count FROM page_embeddings 
            WHERE page_id = ${pageId}::uuid
          `;
          
          const remainingCount = this.safeBigIntToNumber(remaining[0]?.count) || 0;
          if (remainingCount > 0) {
            throw new Error(`Failed to delete embeddings: ${remainingCount} still remain`);
          }
          
          return deleted;
        })
      );
      
      this.logger.info('🗑️ Deleted old embeddings', {
        pageId,
        countBefore: this.safeBigIntToNumber(countBefore[0]?.count) || 0,
        deletedCount: this.safeBigIntToNumber(deleteResult)
      });
    } catch (error) {
      this.logger.warn('Failed to cleanup old embeddings', { pageId, error });
    }
  }
  
  /**
   * Store embeddings in database
   */
  private async storeEmbeddings(
    pageId: string,
    workspaceId: string,
    pageTitle: string,
    chunks: UltraLightEmbeddingJobData['chunks'],
    embeddings: number[][]
  ): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      
      // Check size before storing
      const vectorString = `[${embedding.join(',')}]`;
      const estimatedSize = vectorString.length + chunk.text.length + 200;
      
      if (estimatedSize < this.MAX_REQUEST_SIZE) {
        await withRetry(() =>
          prisma.$executeRaw`
            INSERT INTO page_embeddings (
              page_id,
              workspace_id,
              chunk_text,
              chunk_index,
              embedding,
              metadata
            ) VALUES (
              ${pageId}::uuid,
              ${workspaceId}::uuid,
              ${chunk.text},
              ${chunk.index},
              ${vectorString}::vector,
              ${JSON.stringify({
                pageTitle,
                chunkSize: chunk.text.length,
                indexedAt: new Date().toISOString(),
                ...chunk.metadata
              })}::jsonb
            )
          `
        );
      } else {
        this.logger.warn('Chunk too large, skipping', {
          pageId,
          chunkIndex: chunk.index,
          estimatedSize
        });
      }
    }
  }
  
  /**
   * Clear AI cache for a page
   */
  private async clearAICache(pageId: string, workspaceId: string): Promise<void> {
    try {
      const { aiBlockService } = await import('../../ai-block-service.server');
      aiBlockService.clearCacheForPage(workspaceId, pageId);
    } catch (error) {
      // Ignore cache errors
      this.logger.debug('Could not clear AI cache', { pageId, error });
    }
  }
  
  /**
   * Helper to safely convert BigInt to number
   */
  private safeBigIntToNumber(value: any): number {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    return value;
  }
  
  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    if (!this.worker) return;
    
    this.worker.on('completed', (job) => {
      this.logger.info(`✅ Job completed`, {
        jobId: job.id,
        pageId: job.data.pageId,
        duration: job.finishedOn ? job.finishedOn - job.processedOn! : 0
      });
    });
    
    this.worker.on('failed', (job, error) => {
      this.logger.error(`❌ Job failed`, {
        jobId: job?.id,
        pageId: job?.data.pageId,
        attempts: job?.attemptsMade,
        error: error.message
      });
    });
    
    this.worker.on('active', (job) => {
      this.logger.info(`⚡ Job started`, {
        jobId: job.id,
        pageId: job.data.pageId,
        chunks: job.data.chunks.length
      });
    });
    
    this.worker.on('stalled', (jobId) => {
      this.logger.warn(`⚠️ Job stalled`, { jobId });
    });
    
    this.worker.on('error', (error) => {
      this.logger.error(`Worker error`, error);
    });
    
    this.worker.on('progress', (job, progress) => {
      this.logger.debug(`📊 Job progress`, {
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
      
      this.logger.info(`🛑 Received ${signal}, shutting down gracefully...`);
      
      try {
        if (this.worker) {
          // Stop accepting new jobs
          await this.worker.pause();
          
          // Wait for current jobs to complete (max 60 seconds)
          await this.worker.close(60000);
          
          this.logger.info('✅ Worker shut down gracefully');
        }
      } catch (error) {
        this.logger.error('Error during shutdown', error);
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
    
    this.logger.info('Stopping worker...');
    
    await this.worker.pause();
    await this.worker.close();
    
    this.worker = null;
    
    this.logger.info('Worker stopped');
  }
  
  /**
   * Get worker metrics
   */
  async getMetrics(): Promise<{
    isRunning: boolean;
    jobs?: {
      processed: number;
      failed: number;
      completed: number;
    };
  }> {
    if (!this.worker) {
      return { isRunning: false };
    }
    
    // Note: Worker doesn't directly provide these metrics
    // You would need to track them separately or get from queue
    return {
      isRunning: true,
      jobs: {
        processed: 0, // Would need to track
        failed: 0,    // Would need to track
        completed: 0  // Would need to track
      }
    };
  }
}

// Export singleton instance
export const ultraLightEmbeddingWorker = UltraLightEmbeddingWorker.getInstance();