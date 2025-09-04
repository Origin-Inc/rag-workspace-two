import { prisma } from '~/utils/db.server';
import { openai } from '../openai.server';
import { DebugLogger } from '~/utils/debug-logger';
import { ContentExtractor } from './content-extractor';
import { ContentChunker } from './content-chunker';
import { withRetry } from '~/utils/db.server';
import type { Page } from '@prisma/client';

interface IndexingOptions {
  immediate?: boolean;
  forceReindex?: boolean;
  skipCache?: boolean;
}

/**
 * Memory-optimized indexing service for limited Redis environments
 * Works with eviction policies and small memory limits
 */
export class MemoryOptimizedIndexingService {
  private logger = new DebugLogger('MemoryOptimizedIndexing');
  private extractor = new ContentExtractor();
  private chunker = new ContentChunker();
  
  // OpenAI configuration
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIMENSION = 1536;
  private readonly BATCH_SIZE = 3; // Even smaller batches for memory efficiency
  
  // In-memory debouncing (doesn't use Redis)
  private indexingQueue = new Map<string, NodeJS.Timeout>();
  private processingPages = new Set<string>(); // Track pages being processed
  private readonly DEBOUNCE_DELAY = 3000; // 3 seconds
  
  /**
   * Index page with minimal Redis usage
   */
  async indexPage(pageId: string, options: IndexingOptions = {}): Promise<void> {
    const { immediate = false, forceReindex = false, skipCache = false } = options;
    
    // Check if already processing
    if (this.processingPages.has(pageId) && !forceReindex) {
      this.logger.info('⏭️ Already processing page', { pageId });
      return;
    }
    
    if (immediate) {
      // Process immediately
      await this.processPageDirect(pageId, skipCache);
    } else {
      // Debounce in-memory
      this.debounceIndexing(pageId, forceReindex, skipCache);
    }
  }
  
  /**
   * In-memory debouncing without Redis
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
        await this.processPageDirect(pageId, skipCache);
      } catch (error) {
        this.logger.error('Debounced indexing failed', { pageId, error });
      }
    }, this.DEBOUNCE_DELAY);
    
    this.indexingQueue.set(pageId, timeout);
    this.logger.info('⏱️ Indexing scheduled (in-memory)', { pageId, delayMs: this.DEBOUNCE_DELAY });
  }
  
  /**
   * Process page directly without queue
   */
  private async processPageDirect(pageId: string, skipCache: boolean): Promise<void> {
    const startTime = Date.now();
    
    // Mark as processing
    this.processingPages.add(pageId);
    
    try {
      this.logger.info('🚀 Starting direct indexing', { pageId });
      
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
      
      // Check if recently indexed (use database instead of Redis)
      if (!skipCache) {
        const recentlyIndexed = await this.wasRecentlyIndexed(pageId, 3); // 3 minutes
        if (recentlyIndexed) {
          this.logger.info('⏩ Skip - recently indexed', { pageId });
          return;
        }
      }
      
      // Extract content
      const content = this.extractor.extractFromPage(page);
      if (!content || content.trim().length === 0) {
        this.logger.info('No content to index', { pageId });
        await this.cleanupEmbeddings(pageId);
        return;
      }
      
      // Chunk content with smaller chunks for memory efficiency
      const chunks = this.chunker.chunk(content, {
        maxTokens: 300, // Smaller chunks
        overlap: 30,    // Less overlap
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
      
      // Generate embeddings
      const embeddings = await this.generateEmbeddingsEfficient(chunks);
      
      // Store embeddings directly (no queue)
      await this.storeEmbeddingsDirect(page, embeddings);
      
      // Clear minimal cache
      if (!skipCache) {
        await this.clearMinimalCache(pageId, page.workspaceId!);
      }
      
      const processingTime = Date.now() - startTime;
      this.logger.info('✅ Direct indexing completed', {
        pageId,
        chunks: chunks.length,
        processingTimeMs: processingTime,
      });
      
    } catch (error) {
      this.logger.error('❌ Direct indexing failed', {
        pageId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    } finally {
      // Remove from processing set
      this.processingPages.delete(pageId);
    }
  }
  
  /**
   * Check if page was recently indexed using database
   */
  private async wasRecentlyIndexed(pageId: string, maxAgeMinutes: number): Promise<boolean> {
    try {
      const result = await prisma.$queryRaw<any[]>`
        SELECT MAX(created_at) as last_indexed
        FROM page_embeddings
        WHERE page_id = ${pageId}::uuid
        LIMIT 1
      `;
      
      if (!result[0]?.last_indexed) {
        return false;
      }
      
      const ageMinutes = (Date.now() - new Date(result[0].last_indexed).getTime()) / (1000 * 60);
      return ageMinutes < maxAgeMinutes;
      
    } catch (error) {
      return false; // Assume not indexed on error
    }
  }
  
  /**
   * Generate embeddings with memory efficiency
   */
  private async generateEmbeddingsEfficient(
    chunks: Array<{ text: string; metadata: any; index: number }>
  ): Promise<Array<{ text: string; embedding: number[]; metadata: any; chunkIndex: number }>> {
    const results: Array<{ text: string; embedding: number[]; metadata: any; chunkIndex: number }> = [];
    
    // Process in very small batches
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
        
        // Small delay to avoid rate limits
        if (i + this.BATCH_SIZE < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        this.logger.error('Embedding batch failed', { batch: i, error });
        // Continue with other batches
      }
    }
    
    return results;
  }
  
  /**
   * Store embeddings directly without transactions
   */
  private async storeEmbeddingsDirect(
    page: Page,
    embeddings: Array<{ text: string; embedding: number[]; metadata: any; chunkIndex: number }>
  ): Promise<void> {
    this.logger.info('💾 Storing embeddings directly', { 
      pageId: page.id, 
      count: embeddings.length 
    });
    
    // Delete old embeddings first (single operation)
    try {
      await withRetry(() =>
        prisma.$executeRaw`
          DELETE FROM page_embeddings 
          WHERE page_id = ${page.id}::uuid
        `
      );
    } catch (error) {
      this.logger.warn('Failed to cleanup old embeddings', { error });
    }
    
    // Insert new embeddings one by one (no transaction)
    let successCount = 0;
    for (const emb of embeddings) {
      try {
        const vectorString = `[${emb.embedding.join(',')}]`;
        
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
          `
        );
        
        successCount++;
      } catch (error) {
        this.logger.warn('Failed to insert embedding', { 
          chunkIndex: emb.chunkIndex, 
          error 
        });
        // Continue with other embeddings
      }
    }
    
    this.logger.info('✅ Embeddings stored', {
      pageId: page.id,
      total: embeddings.length,
      success: successCount,
      failed: embeddings.length - successCount
    });
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
   * Clear minimal cache (only AI block cache, not Redis)
   */
  private async clearMinimalCache(pageId: string, workspaceId: string): Promise<void> {
    try {
      // Clear AI block cache
      const { aiBlockService } = await import('../ai-block-service.server');
      aiBlockService.clearCacheForPage(workspaceId, pageId);
      
      this.logger.info('🗑️ AI cache cleared', { pageId, workspaceId });
    } catch (error) {
      this.logger.warn('Cache clearing failed', { pageId, error });
    }
  }
  
  /**
   * Process multiple pages in sequence
   */
  async indexPages(pageIds: string[]): Promise<void> {
    for (const pageId of pageIds) {
      try {
        await this.processPageDirect(pageId, false);
        // Delay between pages
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.error('Failed to index page in batch', { pageId, error });
        // Continue with other pages
      }
    }
  }
}

export const memoryOptimizedIndexingService = new MemoryOptimizedIndexingService();