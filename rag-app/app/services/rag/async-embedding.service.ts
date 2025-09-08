import { Queue, Job } from 'bullmq';
import { prisma } from '~/utils/db.server';
import { DebugLogger } from '~/utils/debug-logger';
import { openai } from '../openai.server';
import { SemanticChunker } from './processors/semantic-chunker';
import { ContentExtractor } from './processors/content-extractor';
import type { Page, IndexingQueue } from '@prisma/client';

interface EmbeddingJob {
  pageId: string;
  workspaceId: string;
  priority?: number;
  retryCount?: number;
}

interface EmbeddingStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  lastProcessedAt?: Date;
}

export class AsyncEmbeddingService {
  private static instance: AsyncEmbeddingService;
  private readonly logger = new DebugLogger('AsyncEmbedding');
  private readonly chunker = new SemanticChunker();
  private readonly extractor = new ContentExtractor();
  private embeddingQueue: Queue<EmbeddingJob> | null = null;
  
  // Configuration
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIMENSION = 1536;
  private readonly BATCH_SIZE = 5;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000; // Base delay for exponential backoff
  
  private constructor() {
    this.initializeQueue();
  }
  
  static getInstance(): AsyncEmbeddingService {
    if (!AsyncEmbeddingService.instance) {
      AsyncEmbeddingService.instance = new AsyncEmbeddingService();
    }
    return AsyncEmbeddingService.instance;
  }
  
  private async initializeQueue() {
    try {
      const redisModule = await import('~/utils/redis.server');
      if (redisModule.redis) {
        const { Queue } = await import('bullmq');
        this.embeddingQueue = new Queue('embedding-generation', {
          connection: redisModule.redis,
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: this.MAX_RETRIES,
            backoff: {
              type: 'exponential',
              delay: this.RETRY_DELAY,
            },
          },
        });
        this.logger.info('Embedding queue initialized successfully');
      }
    } catch (error) {
      this.logger.warn('Queue not available, using direct processing', error);
    }
  }
  
  /**
   * Queue a page for embedding generation with status tracking
   */
  async queueEmbedding(pageId: string, workspaceId: string, priority: number = 5): Promise<string> {
    this.logger.info('Queueing page for embedding', { pageId, workspaceId, priority });
    
    try {
      // Create or update IndexingQueue entry
      const queueEntry = await prisma.indexingQueue.upsert({
        where: {
          entityType_entityId: {
            entityType: 'page',
            entityId: pageId,
          },
        },
        update: {
          status: 'pending',
          priority,
          retryCount: 0,
          errorMessage: null,
          updatedAt: new Date(),
        },
        create: {
          entityType: 'page',
          entityId: pageId,
          workspaceId,
          operation: 'update',
          status: 'pending',
          priority,
          metadata: {},
        },
      });
      
      if (this.embeddingQueue) {
        // Queue the job
        const job = await this.embeddingQueue.add(
          'generate-embedding',
          { pageId, workspaceId, priority },
          {
            priority,
            jobId: `embedding-${pageId}-${Date.now()}`,
          }
        );
        
        this.logger.info('Embedding job queued', { jobId: job.id, pageId });
        return job.id as string;
      } else {
        // Process directly if no queue
        await this.processEmbedding(pageId, workspaceId);
        return `direct-${pageId}`;
      }
    } catch (error) {
      this.logger.error('Failed to queue embedding', { pageId, error });
      throw error;
    }
  }
  
  /**
   * Process embedding generation for a page
   */
  async processEmbedding(pageId: string, workspaceId: string, attempt: number = 1): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Update status to processing
      await this.updateStatus(pageId, 'processing', 0);
      
      // Fetch page
      const page = await prisma.page.findUnique({
        where: { id: pageId },
      });
      
      if (!page) {
        throw new Error(`Page not found: ${pageId}`);
      }
      
      // Extract content
      const content = this.extractor.extractFromPage(page);
      if (!content || content.trim().length === 0) {
        await this.updateStatus(pageId, 'completed', 100);
        this.logger.info('No content to embed', { pageId });
        return;
      }
      
      // Chunk content
      const chunks = this.chunker.chunk(content, {
        maxTokens: 512,
        overlap: 50,
        preserveStructure: true,
        metadata: {
          pageId: page.id,
          pageTitle: page.title,
          workspaceId: page.workspaceId,
        },
      });
      
      this.logger.info('Content chunked', { pageId, chunkCount: chunks.length });
      
      // Generate embeddings with progress tracking
      const totalChunks = chunks.length;
      const embeddings = [];
      
      for (let i = 0; i < chunks.length; i += this.BATCH_SIZE) {
        const batch = chunks.slice(i, i + this.BATCH_SIZE);
        const progress = Math.floor((i / totalChunks) * 100);
        
        await this.updateStatus(pageId, 'processing', progress);
        
        try {
          // Generate embeddings for batch
          const batchEmbeddings = await Promise.all(
            batch.map(async (chunk) => {
              const response = await openai.embeddings.create({
                model: this.EMBEDDING_MODEL,
                input: chunk.text,
              });
              
              return {
                text: chunk.text,
                embedding: response.data[0].embedding,
                metadata: chunk.metadata,
                chunkIndex: chunk.index,
              };
            })
          );
          
          embeddings.push(...batchEmbeddings);
          
          // Small delay to avoid rate limiting
          if (i + this.BATCH_SIZE < chunks.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          this.logger.error('Failed to generate embeddings for batch', { 
            pageId, 
            batchIndex: i, 
            error 
          });
          
          // On error, retry with exponential backoff
          if (attempt < this.MAX_RETRIES) {
            const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1);
            this.logger.info(`Retrying after ${delay}ms`, { pageId, attempt });
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.processEmbedding(pageId, workspaceId, attempt + 1);
          }
          
          throw error;
        }
      }
      
      // Store embeddings in database
      await this.storeEmbeddings(page, embeddings);
      
      // Update status to completed
      await this.updateStatus(pageId, 'completed', 100);
      
      const processingTime = Date.now() - startTime;
      this.logger.info('Embedding generation completed', {
        pageId,
        chunks: chunks.length,
        processingTimeMs: processingTime,
      });
      
    } catch (error) {
      this.logger.error('Failed to process embedding', { pageId, error });
      
      // Update status to failed
      await this.updateStatus(
        pageId, 
        'failed', 
        0, 
        error instanceof Error ? error.message : 'Unknown error'
      );
      
      throw error;
    }
  }
  
  /**
   * Store embeddings in database
   */
  private async storeEmbeddings(page: Page, embeddings: any[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Delete existing embeddings
      await tx.pageEmbedding.deleteMany({
        where: { pageId: page.id },
      });
      
      // Insert new embeddings
      for (const embedding of embeddings) {
        await tx.$executeRaw`
          INSERT INTO page_embeddings (
            id, page_id, workspace_id, chunk_text, chunk_index, 
            embedding, metadata, created_at, updated_at
          ) VALUES (
            gen_random_uuid(),
            ${page.id}::uuid,
            ${page.workspaceId}::uuid,
            ${embedding.text},
            ${embedding.chunkIndex},
            ${embedding.embedding}::extensions.vector,
            ${JSON.stringify(embedding.metadata)}::jsonb,
            NOW(),
            NOW()
          )
        `;
      }
    });
  }
  
  /**
   * Update embedding status in IndexingQueue
   */
  private async updateStatus(
    pageId: string, 
    status: 'pending' | 'processing' | 'completed' | 'failed',
    progress: number,
    error?: string
  ): Promise<void> {
    try {
      await prisma.indexingQueue.updateMany({
        where: {
          entityType: 'page',
          entityId: pageId,
        },
        data: {
          status,
          metadata: {
            progress,
            lastUpdated: new Date().toISOString(),
          },
          errorMessage: error || null,
          processedAt: status === 'completed' ? new Date() : undefined,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Failed to update status', { pageId, status, error });
    }
  }
  
  /**
   * Get embedding status for a page
   */
  async getStatus(pageId: string): Promise<EmbeddingStatus | null> {
    try {
      const queueEntry = await prisma.indexingQueue.findFirst({
        where: {
          entityType: 'page',
          entityId: pageId,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });
      
      if (!queueEntry) {
        return null;
      }
      
      const metadata = queueEntry.metadata as any;
      
      return {
        status: queueEntry.status as EmbeddingStatus['status'],
        progress: metadata?.progress || 0,
        error: queueEntry.errorMessage || undefined,
        lastProcessedAt: queueEntry.processedAt || undefined,
      };
    } catch (error) {
      this.logger.error('Failed to get status', { pageId, error });
      return null;
    }
  }
  
  /**
   * Get bulk status for multiple pages
   */
  async getBulkStatus(pageIds: string[]): Promise<Map<string, EmbeddingStatus>> {
    const statusMap = new Map<string, EmbeddingStatus>();
    
    try {
      const queueEntries = await prisma.indexingQueue.findMany({
        where: {
          entityType: 'page',
          entityId: { in: pageIds },
        },
      });
      
      for (const entry of queueEntries) {
        const metadata = entry.metadata as any;
        statusMap.set(entry.entityId, {
          status: entry.status as EmbeddingStatus['status'],
          progress: metadata?.progress || 0,
          error: entry.errorMessage || undefined,
          lastProcessedAt: entry.processedAt || undefined,
        });
      }
    } catch (error) {
      this.logger.error('Failed to get bulk status', { error });
    }
    
    return statusMap;
  }
  
  /**
   * Retry failed embeddings
   */
  async retryFailed(workspaceId?: string): Promise<number> {
    try {
      const failedEntries = await prisma.indexingQueue.findMany({
        where: {
          entityType: 'page',
          status: 'failed',
          retryCount: { lt: this.MAX_RETRIES },
          ...(workspaceId && { workspaceId }),
        },
      });
      
      let retriedCount = 0;
      
      for (const entry of failedEntries) {
        await this.queueEmbedding(entry.entityId, entry.workspaceId, entry.priority);
        retriedCount++;
      }
      
      this.logger.info(`Retried ${retriedCount} failed embeddings`);
      return retriedCount;
    } catch (error) {
      this.logger.error('Failed to retry embeddings', { error });
      return 0;
    }
  }
}

// Export singleton instance
export const asyncEmbeddingService = AsyncEmbeddingService.getInstance();