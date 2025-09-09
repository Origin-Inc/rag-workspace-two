import { prisma } from '~/utils/db.server';
import { openai } from '../openai.server';
import { DebugLogger } from '~/utils/debug-logger';
import { ContentExtractor } from './processors/content-extractor';
import { DocumentChunkingService } from '../document-chunking.server';
import { withRetry } from '~/utils/db.server';
import { ensureVectorSearchPath } from '~/utils/db-vector.server';
import type { Page } from '@prisma/client';

interface IndexingOptions {
  immediate?: boolean; // Process synchronously for immediate availability
  forceReindex?: boolean; // Force reindex even if recent
  skipCache?: boolean; // Skip cache clearing
}

export class OptimizedIndexingService {
  private logger = new DebugLogger('OptimizedIndexing');
  private extractor = new ContentExtractor();
  private chunker = new DocumentChunkingService();
  
  // OpenAI configuration
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIMENSION = 1536;
  private readonly BATCH_SIZE = 5; // Smaller batch size for faster processing
  private readonly TRANSACTION_TIMEOUT = 30000; // 30 seconds
  
  // Debouncing
  private indexingQueue = new Map<string, NodeJS.Timeout>();
  private readonly DEBOUNCE_DELAY = 2000; // 2 seconds
  
  /**
   * Index page content with optimizations
   */
  async indexPage(pageId: string, options: IndexingOptions = {}): Promise<void> {
    const { immediate = false, forceReindex = false, skipCache = false } = options;
    
    if (immediate) {
      // Process immediately for critical updates
      await this.processPageImmediate(pageId, skipCache);
    } else {
      // Debounce for normal saves
      this.debounceIndexing(pageId, forceReindex, skipCache);
    }
  }
  
  /**
   * Debounce indexing to avoid processing on every keystroke
   */
  private debounceIndexing(pageId: string, forceReindex: boolean, skipCache: boolean): void {
    // Clear existing timeout
    const existing = this.indexingQueue.get(pageId);
    if (existing) {
      clearTimeout(existing);
    }
    
    // Set new timeout
    const timeout = setTimeout(async () => {
      this.indexingQueue.delete(pageId);
      try {
        await this.processPageImmediate(pageId, skipCache);
      } catch (error) {
        this.logger.error('Debounced indexing failed', { pageId, error });
      }
    }, this.DEBOUNCE_DELAY);
    
    this.indexingQueue.set(pageId, timeout);
    this.logger.info('⏱️ Indexing scheduled', { pageId, delayMs: this.DEBOUNCE_DELAY });
  }
  
  /**
   * Process page immediately with optimizations
   */
  private async processPageImmediate(pageId: string, skipCache: boolean): Promise<void> {
    const startTime = Date.now();
    this.logger.info('🚀 Starting optimized indexing', { pageId });
    
    try {
      // Get page data
      const page = await withRetry(() => 
        prisma.page.findUnique({
          where: { id: pageId },
        })
      );
      
      if (!page) {
        this.logger.warn('Page not found', { pageId });
        return;
      }
      
      // Extract content
      const content = this.extractor.extractFromPage(page);
      if (!content || content.trim().length === 0) {
        this.logger.info('No content to index', { pageId });
        await this.cleanupEmbeddings(pageId);
        return;
      }
      
      // Chunk content
      const chunks = this.chunker.chunk(content, {
        maxTokens: 400, // Smaller chunks for faster processing
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
      
      // Generate embeddings in smaller batches
      const embeddings = await this.generateEmbeddingsOptimized(chunks);
      
      // Store embeddings with batch insert
      await this.storeEmbeddingsOptimized(page, embeddings);
      
      // Clear cache if needed
      if (!skipCache) {
        await this.clearCaches(pageId, page.workspaceId!);
      }
      
      const processingTime = Date.now() - startTime;
      this.logger.info('✅ Indexing completed', {
        pageId,
        chunks: chunks.length,
        processingTimeMs: processingTime,
      });
      
    } catch (error) {
      this.logger.error('❌ Indexing failed', {
        pageId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
  
  /**
   * Generate embeddings with optimized batching
   */
  private async generateEmbeddingsOptimized(
    chunks: Array<{ text: string; metadata: any; index: number }>
  ): Promise<Array<{ text: string; embedding: number[]; metadata: any; chunkIndex: number }>> {
    const results: Array<{ text: string; embedding: number[]; metadata: any; chunkIndex: number }> = [];
    
    // Process in smaller batches for faster response
    for (let i = 0; i < chunks.length; i += this.BATCH_SIZE) {
      const batch = chunks.slice(i, i + this.BATCH_SIZE);
      
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
        
      } catch (error) {
        this.logger.error('Embedding generation failed', { batch: i, error });
        // Skip failed batch and continue
      }
    }
    
    return results;
  }
  
  /**
   * Store embeddings with optimized batch insert
   */
  private async storeEmbeddingsOptimized(
    page: Page,
    embeddings: Array<{ text: string; embedding: number[]; metadata: any; chunkIndex: number }>
  ): Promise<void> {
    this.logger.info('💾 Storing embeddings optimized', { 
      pageId: page.id, 
      count: embeddings.length 
    });
    
    // Split into smaller transactions to avoid timeout
    const CHUNK_SIZE = 10; // Insert 10 at a time
    
    // First, cleanup old embeddings (separate transaction)
    await withRetry(() =>
      prisma.$executeRaw`
        DELETE FROM page_embeddings 
        WHERE page_id = ${page.id}::uuid
      `
    );
    
    // Insert new embeddings in batches
    for (let i = 0; i < embeddings.length; i += CHUNK_SIZE) {
      const batch = embeddings.slice(i, i + CHUNK_SIZE);
      
      // Use a shorter transaction for each batch
      await withRetry(() =>
        prisma.$transaction(async (tx) => {
          for (const emb of batch) {
            const vectorString = `[${emb.embedding.join(',')}]`;
            
            await ensureVectorSearchPath();
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
                ${emb.text},
                ${emb.chunkIndex},
                ${vectorString}::vector,
                ${JSON.stringify({
                  ...emb.metadata,
                  indexedAt: new Date().toISOString(),
                })}::jsonb
              )
            `;
          }
        }, {
          timeout: 10000, // 10 second timeout per batch
        })
      );
      
      this.logger.info(`Batch ${Math.floor(i / CHUNK_SIZE) + 1} stored`);
    }
    
    this.logger.info('✅ All embeddings stored');
  }
  
  /**
   * Cleanup old embeddings
   */
  private async cleanupEmbeddings(pageId: string): Promise<void> {
    try {
      await withRetry(() =>
        prisma.$executeRaw`
          DELETE FROM page_embeddings 
          WHERE page_id = ${pageId}::uuid
        `
      );
      this.logger.info('🧹 Cleaned up embeddings', { pageId });
    } catch (error) {
      this.logger.error('Cleanup failed', { pageId, error });
    }
  }
  
  /**
   * Clear relevant caches
   */
  private async clearCaches(pageId: string, workspaceId: string): Promise<void> {
    try {
      // Clear AI block cache
      const { aiBlockService } = await import('../ai-block-service.server');
      aiBlockService.clearCacheForPage(workspaceId, pageId);
      
      // Clear Redis cache patterns
      const { redis } = await import('~/utils/redis.server');
      if (redis) {
        const patterns = [
          `ai:*:${pageId}:*`,
          `search:${workspaceId}:*`,
          `embeddings:${pageId}:*`,
        ];
        
        for (const pattern of patterns) {
          const keys = await redis.keys(pattern);
          if (keys.length > 0) {
            await redis.del(...keys);
          }
        }
      }
      
      this.logger.info('🗑️ Caches cleared', { pageId, workspaceId });
    } catch (error) {
      this.logger.warn('Cache clearing failed', { pageId, error });
    }
  }
  
  /**
   * Check if page needs reindexing
   */
  async needsReindexing(pageId: string, maxAgeMinutes: number = 5): Promise<boolean> {
    try {
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*) as count,
          MAX(created_at) as last_indexed
        FROM page_embeddings
        WHERE page_id = ${pageId}::uuid
      `;
      
      if (!result[0] || result[0].count === 0) {
        return true; // No embeddings, needs indexing
      }
      
      const lastIndexed = result[0].last_indexed;
      if (!lastIndexed) {
        return true;
      }
      
      const ageMinutes = (Date.now() - new Date(lastIndexed).getTime()) / (1000 * 60);
      return ageMinutes > maxAgeMinutes;
      
    } catch (error) {
      this.logger.error('Failed to check indexing status', { pageId, error });
      return true; // Assume needs indexing on error
    }
  }
}

export const optimizedIndexingService = new OptimizedIndexingService();