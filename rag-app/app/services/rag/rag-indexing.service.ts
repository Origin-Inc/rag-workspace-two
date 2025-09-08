import { Queue } from 'bullmq';
import { prisma } from '~/utils/db.server';
import { DebugLogger } from '~/utils/debug-logger';
import { openai } from '../openai.server';
import { SemanticChunker } from './processors/semantic-chunker';
import { ContentExtractor } from './processors/content-extractor';
import type { Page } from '@prisma/client';

interface IndexingJob {
  pageId: string;
  priority?: number;
  retryCount?: number;
}

interface ChunkWithEmbedding {
  text: string;
  embedding: number[];
  metadata: Record<string, any>;
  chunkIndex: number;
}

export class RAGIndexingService {
  private static instance: RAGIndexingService;
  private readonly logger = new DebugLogger('RAGIndexing');
  private readonly chunker = new SemanticChunker();
  private readonly extractor = new ContentExtractor();
  private indexingQueue: Queue<IndexingJob> | null = null;
  
  // Configuration
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIMENSION = 1536;
  private readonly DEBOUNCE_MS = 500;
  
  private constructor() {
    this.initializeQueue();
  }
  
  static getInstance(): RAGIndexingService {
    if (!RAGIndexingService.instance) {
      RAGIndexingService.instance = new RAGIndexingService();
    }
    return RAGIndexingService.instance;
  }
  
  private async initializeQueue() {
    try {
      // Only initialize queue if Redis is available
      const redisModule = await import('~/utils/redis.server');
      if (redisModule.redis) {
        const { Queue } = await import('bullmq');
        this.indexingQueue = new Queue('page-indexing', {
          connection: redisModule.redis,
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          },
        });
        this.logger.info('BullMQ queue initialized successfully');
      }
    } catch (error) {
      this.logger.warn('BullMQ not available, using direct processing', error);
    }
  }
  
  /**
   * Queue a page for indexing (public API)
   * This is what gets called from the editor
   */
  async queueForIndexing(pageId: string, priority: number = 0): Promise<void> {
    this.logger.info('📥 Queueing page for indexing', { pageId, priority });
    
    try {
      // Apply rate limiting for production
      if (process.env.NODE_ENV === 'production') {
        const { indexingRateLimiter } = await import('~/services/rate-limiter.server');
        const rateLimitResult = await indexingRateLimiter.checkLimit(`page-${pageId}`);
        
        if (!rateLimitResult.allowed) {
          this.logger.warn('Indexing rate limit exceeded', { 
            pageId, 
            retryAfter: rateLimitResult.retryAfter 
          });
          // Queue with additional delay
          const delayMs = (rateLimitResult.retryAfter || 60) * 1000;
          if (this.indexingQueue) {
            const timestamp = Date.now();
            const jobId = `page-${pageId}-${timestamp}-delayed`;
            await this.indexingQueue.add(
              'index-page',
              { pageId, priority, timestamp },
              {
                delay: delayMs,
                priority,
                jobId
              }
            );
            return;
          }
        }
      }

      if (this.indexingQueue) {
        // Use BullMQ for queuing with debouncing
        // Include timestamp in jobId to ensure content updates trigger new indexing
        // This prevents the issue where rapid saves on new pages only index the title
        const timestamp = Date.now();
        const jobId = `page-${pageId}-${timestamp}`;
        
        await this.indexingQueue.add(
          'index-page',
          { pageId, priority, timestamp },
          {
            delay: this.DEBOUNCE_MS,
            priority,
            jobId,
            // Remove completed jobs after 1 hour to keep queue clean
            removeOnComplete: {
              age: 3600, // 1 hour in seconds
              count: 100 // Keep last 100 completed jobs
            }
          }
        );
        this.logger.info('✅ Page queued successfully', { pageId, jobId });
      } else {
        // Fallback to direct processing if queue not available
        this.logger.info('⚡ Processing directly (no queue)', { pageId });
        
        // Process immediately - the debouncing happens naturally because 
        // saves take time and users don't save every millisecond
        await this.processPage(pageId);
        this.logger.info('✅ Direct processing completed', { pageId });
      }
    } catch (error) {
      this.logger.error('❌ Failed to queue page', { pageId, error });
      // Try direct processing as last resort
      try {
        await this.processPage(pageId);
      } catch (processError) {
        this.logger.error('❌ Fallback processing also failed', { pageId, error: processError });
      }
    }
  }
  
  /**
   * Process a page for indexing (internal)
   * This does the actual work
   */
  async processPage(pageId: string): Promise<void> {
    const startTime = Date.now();
    this.logger.info('🔄 Starting page indexing', { pageId });
    
    try {
      // Step 1: Get page data
      const page = await this.fetchPage(pageId);
      if (!page) {
        this.logger.warn('Page not found', { pageId });
        return;
      }
      
      // Step 2: Extract content
      const content = this.extractor.extractFromPage(page);
      if (!content || content.trim().length === 0) {
        this.logger.info('No content to index', { pageId });
        await this.cleanupExistingEmbeddings(pageId);
        return;
      }
      
      this.logger.info('📝 Content extracted', { 
        pageId, 
        contentLength: content.length 
      });
      
      // Step 3: Chunk content with semantic awareness
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
      
      this.logger.info('📦 Content chunked', { 
        pageId, 
        chunkCount: chunks.length 
      });
      
      // Step 4: Generate embeddings for chunks
      const chunksWithEmbeddings = await this.generateEmbeddings(chunks);
      
      // Step 5: Store in database (transactional)
      await this.storeEmbeddings(page, chunksWithEmbeddings);
      
      // Step 6: Clear AI block cache for this page
      await this.clearAIBlockCache(pageId, page.workspaceId!);
      
      const processingTime = Date.now() - startTime;
      this.logger.info('✅ Page indexed successfully', {
        pageId,
        chunks: chunks.length,
        processingTimeMs: processingTime,
      });
      
    } catch (error) {
      this.logger.error('❌ Failed to index page', {
        pageId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
  
  /**
   * Fetch page from database
   */
  private async fetchPage(pageId: string): Promise<Page | null> {
    try {
      return await prisma.page.findUnique({
        where: { id: pageId },
      });
    } catch (error) {
      this.logger.error('Failed to fetch page', { pageId, error });
      return null;
    }
  }
  
  /**
   * Generate embeddings for text chunks
   */
  private async generateEmbeddings(
    chunks: Array<{ text: string; metadata: any; index: number }>
  ): Promise<ChunkWithEmbedding[]> {
    this.logger.info('🧮 Generating embeddings', { count: chunks.length });
    
    const results: ChunkWithEmbedding[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      try {
        const response = await openai.embeddings.create({
          model: this.EMBEDDING_MODEL,
          input: batch.map(c => c.text),
          dimensions: this.EMBEDDING_DIMENSION,
        });
        
        batch.forEach((chunk, idx) => {
          results.push({
            text: chunk.text,
            embedding: response.data[idx].embedding,
            metadata: chunk.metadata,
            chunkIndex: chunk.index,
          });
        });
        
        this.logger.info(`Batch ${Math.floor(i / batchSize) + 1} completed`);
      } catch (error) {
        this.logger.error('Failed to generate embeddings for batch', { 
          batch: i, 
          error 
        });
        throw error;
      }
    }
    
    return results;
  }
  
  /**
   * Store embeddings in database
   */
  private async storeEmbeddings(
    page: Page,
    chunks: ChunkWithEmbedding[]
  ): Promise<void> {
    this.logger.info('💾 Storing embeddings', { 
      pageId: page.id, 
      count: chunks.length 
    });
    
    // Use transaction for consistency
    await prisma.$transaction(async (tx) => {
      // Clean up old embeddings
      await tx.$executeRaw`
        DELETE FROM page_embeddings 
        WHERE page_id = ${page.id}::uuid
      `;
      
      // Insert new embeddings
      for (const chunk of chunks) {
        const vectorString = `[${chunk.embedding.join(',')}]`;
        
        await tx.$executeRaw`
          INSERT INTO page_embeddings (
            page_id,
            workspace_id,
            chunk_text,
            chunk_index,
            embedding,
            metadata
          ) VALUES (
            ${page.id}::uuid,
            ${page.workspaceId}::uuid,
            ${chunk.text},
            ${chunk.chunkIndex},
            ${vectorString}::extensions.vector,
            ${JSON.stringify({
              ...chunk.metadata,
              indexedAt: new Date().toISOString(),
            })}::jsonb
          )
        `;
      }
    });
    
    this.logger.info('✅ Embeddings stored successfully');
  }
  
  /**
   * Clean up existing embeddings for a page
   */
  private async cleanupExistingEmbeddings(pageId: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        DELETE FROM page_embeddings 
        WHERE page_id = ${pageId}::uuid
      `;
      this.logger.info('🧹 Cleaned up existing embeddings', { pageId });
    } catch (error) {
      this.logger.error('Failed to cleanup embeddings', { pageId, error });
    }
  }
  
  /**
   * Clear AI block cache for a page after indexing
   * This ensures AI responses reflect the latest content
   */
  private async clearAIBlockCache(pageId: string, workspaceId: string): Promise<void> {
    try {
      // Import the AI block service
      const { aiBlockService } = await import('../ai-block-service.server');
      
      // Clear cache for this page
      aiBlockService.clearCacheForPage(workspaceId, pageId);
      
      this.logger.info('🗑️ Cleared AI block cache', { pageId, workspaceId });
    } catch (error) {
      // Don't fail indexing if cache clearing fails
      this.logger.warn('Failed to clear AI block cache', { pageId, error });
    }
  }
  
  /**
   * Get indexing status for a page
   */
  async getIndexingStatus(pageId: string): Promise<{
    indexed: boolean;
    chunkCount: number;
    lastIndexed?: Date;
  }> {
    const result = await prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*) as count,
        MAX(created_at) as last_indexed
      FROM page_embeddings
      WHERE page_id = ${pageId}::uuid
    `;
    
    return {
      indexed: result[0]?.count > 0,
      chunkCount: parseInt(result[0]?.count || '0'),
      lastIndexed: result[0]?.last_indexed,
    };
  }
  
  /**
   * Bulk index all pages in a workspace
   * Useful for initial setup or re-indexing
   */
  async indexWorkspacePages(workspaceId: string): Promise<{
    total: number;
    queued: number;
    skipped: number;
  }> {
    this.logger.info('📚 Starting workspace indexing', { workspaceId });
    
    try {
      // Get all pages in workspace
      const pages = await prisma.page.findMany({
        where: { workspaceId },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' } // Index recently updated pages first
      });
      
      let queued = 0;
      let skipped = 0;
      
      for (const page of pages) {
        // Check if page needs indexing
        const status = await this.getIndexingStatus(page.id);
        
        // Skip if already indexed recently (within last hour)
        if (status.indexed && status.lastIndexed) {
          const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
          if (new Date(status.lastIndexed) > hourAgo) {
            skipped++;
            continue;
          }
        }
        
        // Queue for indexing with lower priority for bulk operations
        await this.queueForIndexing(page.id, -1);
        queued++;
      }
      
      this.logger.info('✅ Workspace indexing queued', {
        workspaceId,
        total: pages.length,
        queued,
        skipped
      });
      
      return {
        total: pages.length,
        queued,
        skipped
      };
    } catch (error) {
      this.logger.error('Failed to index workspace pages', { workspaceId, error });
      throw error;
    }
  }
  
  /**
   * Index all pages in the system
   * Admin operation for system-wide re-indexing
   */
  async indexAllPages(): Promise<{
    total: number;
    queued: number;
    skipped: number;
  }> {
    this.logger.info('🌍 Starting system-wide indexing');
    
    try {
      // Get all pages
      const pages = await prisma.page.findMany({
        select: { id: true, workspaceId: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' }
      });
      
      let queued = 0;
      let skipped = 0;
      
      // Process in batches to avoid overwhelming the queue
      const batchSize = 100;
      for (let i = 0; i < pages.length; i += batchSize) {
        const batch = pages.slice(i, i + batchSize);
        
        for (const page of batch) {
          // Check if page needs indexing
          const status = await this.getIndexingStatus(page.id);
          
          // Skip if already indexed recently
          if (status.indexed && status.lastIndexed) {
            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            if (new Date(status.lastIndexed) > dayAgo) {
              skipped++;
              continue;
            }
          }
          
          // Queue with very low priority
          await this.queueForIndexing(page.id, -10);
          queued++;
        }
        
        // Small delay between batches
        if (i + batchSize < pages.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      this.logger.info('✅ System-wide indexing queued', {
        total: pages.length,
        queued,
        skipped
      });
      
      return {
        total: pages.length,
        queued,
        skipped
      };
    } catch (error) {
      this.logger.error('Failed to index all pages', error);
      throw error;
    }
  }
}

// Export singleton instance
export const ragIndexingService = RAGIndexingService.getInstance();