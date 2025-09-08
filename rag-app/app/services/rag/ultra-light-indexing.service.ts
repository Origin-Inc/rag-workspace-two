import { prisma } from '~/utils/db.server';
import { DebugLogger } from '~/utils/debug-logger';
import { ContentExtractor } from './processors/content-extractor';
import { DocumentChunkingService } from '../document-chunking.server';
import { withRetry } from '~/utils/db.server';
import { connectionPoolManager } from '../connection-pool-manager.server';
import { ultraLightEmbeddingQueue } from './queues/ultra-light-embedding-queue';
import type { Page } from '@prisma/client';

/**
 * Ultra-light indexing service for severely constrained environments
 * Works with 10MB request limit and 100MB Redis with eviction
 */
export class UltraLightIndexingService {
  private logger = new DebugLogger('UltraLightIndexing');
  private extractor = new ContentExtractor();
  private chunker = new DocumentChunkingService();
  
  /**
   * Helper to safely convert BigInt to number for JSON serialization
   */
  private safeBigIntToNumber(value: any): number {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    return value;
  }
  
  // Optimized configuration for production
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIMENSION = 1536;
  private readonly MAX_CHUNKS_PER_PAGE = 50; // Increased to handle full pages
  private readonly MAX_CHUNK_SIZE = 400; // Larger chunks for better context
  private readonly BATCH_SIZE = 5; // Slightly larger batches for efficiency
  private readonly MAX_REQUEST_SIZE = 8 * 1024 * 1024; // 8MB (leaving 2MB buffer)
  
  // In-memory processing (no Redis for indexing)
  private processingPages = new Set<string>();
  private indexingTimeouts = new Map<string, NodeJS.Timeout>();
  
  /**
   * Index page with extreme memory constraints
   */
  async indexPage(pageId: string, immediate: boolean = false): Promise<void> {
    // Skip if already processing
    if (this.processingPages.has(pageId)) {
      this.logger.info('⏭️ Already processing', { pageId });
      return;
    }
    
    if (!immediate) {
      // 1-second debounce to batch rapid saves but still feel instant
      this.debounceIndexing(pageId, 1000);
    } else {
      // Use connection pool manager to prevent exhaustion
      await connectionPoolManager.executeWithPoolManagement(
        `index-${pageId}`,
        () => this.processPageUltraLight(pageId)
      );
    }
  }
  
  /**
   * Debounce indexing - now supports async queue
   */
  private debounceIndexing(pageId: string, delayMs: number = 1000): void {
    const existing = this.indexingTimeouts.get(pageId);
    if (existing) clearTimeout(existing);
    
    const timeout = setTimeout(async () => {
      this.indexingTimeouts.delete(pageId);
      
      // First try to queue with debouncing flag
      const queueResult = await this.tryQueueDebounced(pageId);
      
      if (!queueResult) {
        // Fallback to direct processing if queue not available
        await connectionPoolManager.executeWithPoolManagement(
          `index-debounced-${pageId}`,
          () => this.processPageUltraLight(pageId)
        );
      }
    }, delayMs); // Default 1 second for real-time feel
    
    this.indexingTimeouts.set(pageId, timeout);
  }
  
  /**
   * Try to queue a debounced embedding job
   */
  private async tryQueueDebounced(pageId: string): Promise<boolean> {
    try {
      // Get page data first
      const page = await withRetry(() => 
        prisma.page.findUnique({
          where: { id: pageId },
          select: {
            id: true,
            title: true,
            workspaceId: true,
            blocks: true,
            content: true
          }
        })
      );
      
      if (!page || !page.workspaceId) return false;
      
      // Extract content
      const content = this.extractEssentialContent(page);
      if (!content || content.length < 50) {
        await this.cleanupEmbeddings(pageId);
        return true; // No content to index, but handled successfully
      }
      
      // Create chunks
      const chunks = this.createMinimalChunks(content, page.id, page.workspaceId);
      
      // Queue with debouncing
      const jobId = await ultraLightEmbeddingQueue.queueEmbedding(
        page.id,
        page.workspaceId,
        chunks.map(chunk => ({
          text: chunk.text,
          index: chunk.index,
          metadata: {
            pageTitle: page.title,
            chunkSize: chunk.text.length,
            indexedAt: new Date().toISOString()
          }
        })),
        {
          pageTitle: page.title,
          priority: 'normal',
          debounced: true // This ensures job deduplication
        }
      );
      
      if (jobId) {
        this.logger.info('📋 Debounced embedding job queued', {
          pageId,
          jobId,
          chunks: chunks.length
        });
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Failed to queue debounced job', { pageId, error });
      return false;
    }
  }
  
  /**
   * Process with ultra-light footprint
   */
  private async processPageUltraLight(pageId: string): Promise<void> {
    this.processingPages.add(pageId);
    
    try {
      this.logger.info('🪶 Ultra-light indexing', { pageId });
      
      // Get page
      const page = await withRetry(() => 
        prisma.page.findUnique({
          where: { id: pageId },
          select: {
            id: true,
            title: true,
            workspaceId: true,
            blocks: true,
            content: true
          }
        })
      );
      
      if (!page) return;
      
      // NO COOLDOWN - Always re-index for real-time updates
      // Users expect immediate results when they save content
      this.logger.info('🔄 Processing page for real-time indexing', { pageId });
      
      // Extract only essential content
      const content = this.extractEssentialContent(page);
      if (!content || content.length < 50) {
        await this.cleanupEmbeddings(pageId);
        return;
      }
      
      // Create minimal chunks
      const chunks = this.createMinimalChunks(content, page.id, page.workspaceId!);
      
      // Process in tiny batches
      await this.processTinyBatches(page, chunks);
      
      // Clear only AI cache (not Redis)
      await this.clearAICache(pageId, page.workspaceId!);
      
      // Count and verify final embeddings
      const finalCount = await withRetry(() =>
        prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count FROM page_embeddings 
          WHERE page_id = ${pageId}::uuid
        `
      );
      
      // Clean up any duplicates or old entries (safety measure)
      const finalCountNumber = this.safeBigIntToNumber(finalCount[0]?.count) || 0;
      if (finalCountNumber > chunks.length) {
        this.logger.warn('⚠️ Too many embeddings found, cleaning up', {
          pageId,
          expected: chunks.length,
          actual: finalCountNumber
        });
        
        // Keep only the most recent chunks
        await withRetry(() =>
          prisma.$executeRaw`
            DELETE FROM page_embeddings
            WHERE page_id = ${pageId}::uuid
            AND id NOT IN (
              SELECT id FROM page_embeddings
              WHERE page_id = ${pageId}::uuid
              ORDER BY created_at DESC
              LIMIT ${chunks.length}
            )
          `
        );
      }
      
      this.logger.info('✅ Ultra-light indexing complete', { 
        pageId,
        chunks: chunks.length,
        finalEmbeddingsCount: this.safeBigIntToNumber(finalCount[0]?.count) || 0,
        contentPreview: content.substring(0, 200)
      });
      
    } catch (error) {
      this.logger.error('Indexing failed', { 
        pageId, 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name
      });
      throw error; // Re-throw to trigger retry in calling code
    } finally {
      this.processingPages.delete(pageId);
    }
  }
  
  /**
   * Extract only the most important content
   */
  private extractEssentialContent(page: any): string {
    const parts: string[] = [];
    
    // Add title
    if (page.title) {
      parts.push(page.title);
    }
    
    // Extract text from ALL blocks (increased limit for full page content)
    if (page.blocks && Array.isArray(page.blocks)) {
      let totalLength = 0;
      for (const block of page.blocks) {
        if (totalLength > 50000) break; // Increased to 50KB for full pages
        
        const text = this.extractBlockText(block);
        if (text) {
          parts.push(text);
          totalLength += text.length;
        }
      }
    }
    
    // Fallback to content field
    if (parts.length === 1 && page.content) {
      const content = typeof page.content === 'string' 
        ? page.content 
        : JSON.stringify(page.content);
      parts.push(content.substring(0, 50000)); // Increased limit
    }
    
    return parts.join('\n').substring(0, 50000); // Max 50KB of text for full content
  }
  
  /**
   * Extract text from a block
   */
  private extractBlockText(block: any): string {
    if (!block) return '';
    
    if (typeof block.content === 'string') {
      return block.content; // Return full content, no truncation
    }
    
    if (block.content?.text) {
      return String(block.content.text); // Return full content, no truncation
    }
    
    return '';
  }
  
  /**
   * Create minimal chunks
   */
  private createMinimalChunks(
    content: string, 
    pageId: string, 
    workspaceId: string
  ): Array<{ text: string; index: number }> {
    const chunks: Array<{ text: string; index: number }> = [];
    
    // Split into small chunks
    const chunkSize = this.MAX_CHUNK_SIZE;
    const words = content.split(/\s+/);
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const word of words) {
      if (currentChunk.length + word.length > chunkSize) {
        if (currentChunk) {
          chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
          if (chunks.length >= this.MAX_CHUNKS_PER_PAGE) break;
        }
        currentChunk = word;
      } else {
        currentChunk += ' ' + word;
      }
    }
    
    // Add last chunk
    if (currentChunk && chunks.length < this.MAX_CHUNKS_PER_PAGE) {
      chunks.push({ text: currentChunk.trim(), index: chunkIndex });
    }
    
    return chunks;
  }
  
  /**
   * Process in tiny batches to stay under request limit
   * Now uses async queue for embedding generation
   */
  private async processTinyBatches(
    page: any,
    chunks: Array<{ text: string; index: number }>
  ): Promise<void> {
    // Try to use async queue
    const jobId = await ultraLightEmbeddingQueue.queueEmbedding(
      page.id,
      page.workspaceId,
      chunks.map(chunk => ({
        text: chunk.text,
        index: chunk.index,
        metadata: {
          pageTitle: page.title,
          chunkSize: chunk.text.length,
          indexedAt: new Date().toISOString()
        }
      })),
      {
        pageTitle: page.title,
        priority: 'normal',
        debounced: false // Immediate processing for real-time updates
      }
    );
    
    if (jobId) {
      // Successfully queued
      this.logger.info('✅ Embedding job queued', {
        pageId: page.id,
        jobId,
        chunks: chunks.length
      });
      
      // Optionally wait for completion (for synchronous behavior)
      // In production, we'd typically not wait and let it process async
      if (process.env.WAIT_FOR_EMBEDDINGS === 'true') {
        await this.waitForJobCompletion(jobId);
      }
    } else {
      // Fallback to synchronous processing if queue not available
      this.logger.warn('Queue not available, falling back to synchronous processing');
      await this.processTinyBatchesSync(page, chunks);
    }
  }
  
  /**
   * Synchronous fallback for when queue is not available
   * (Original implementation kept as fallback)
   */
  private async processTinyBatchesSync(
    page: any,
    chunks: Array<{ text: string; index: number }>
  ): Promise<void> {
    // Only import openai when needed for fallback
    const { openai } = await import('../openai.server');
    
    // Delete ALL old embeddings for this page - aggressive cleanup
    // First count existing embeddings
    const countBefore = await withRetry(() =>
      prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count FROM page_embeddings 
        WHERE page_id = ${page.id}::uuid
      `
    );
    
    // Delete with explicit transaction
    const deleteResult = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        // Delete ALL embeddings for this page
        const deleted = await tx.$executeRaw`
          DELETE FROM page_embeddings 
          WHERE page_id = ${page.id}::uuid
        `;
        
        // Verify deletion
        const remaining = await tx.$queryRaw<any[]>`
          SELECT COUNT(*) as count FROM page_embeddings 
          WHERE page_id = ${page.id}::uuid
        `;
        
        const remainingCount = this.safeBigIntToNumber(remaining[0]?.count) || 0;
        if (remainingCount > 0) {
          throw new Error(`Failed to delete embeddings: ${remainingCount} still remain`);
        }
        
        return deleted;
      })
    );
    
    this.logger.info('🗑️ Deleted old embeddings (sync)', { 
      pageId: page.id, 
      countBefore: this.safeBigIntToNumber(countBefore[0]?.count) || 0,
      deletedCount: this.safeBigIntToNumber(deleteResult),
      newChunksCount: chunks.length,
      chunkPreviews: chunks.slice(0, 2).map(c => c.text.substring(0, 100))
    });
    
    // Process 2 at a time
    for (let i = 0; i < chunks.length; i += this.BATCH_SIZE) {
      const batch = chunks.slice(i, i + this.BATCH_SIZE);
      
      try {
        // Generate embeddings
        const response = await openai.embeddings.create({
          model: this.EMBEDDING_MODEL,
          input: batch.map(c => c.text),
          dimensions: this.EMBEDDING_DIMENSION,
        });
        
        // Store one by one
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = response.data[j].embedding;
          
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
                  ${page.id}::uuid,
                  ${page.workspaceId}::uuid,
                  ${chunk.text},
                  ${chunk.index},
                  ${vectorString}::extensions.vector,
                  ${JSON.stringify({
                    pageTitle: page.title,
                    chunkSize: chunk.text.length,
                    indexedAt: new Date().toISOString()
                  })}::jsonb
                )
              `
            );
          }
        }
        
        // Delay between batches
        if (i + this.BATCH_SIZE < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (error) {
        this.logger.warn('Batch failed (sync)', { batch: i, error });
      }
    }
  }
  
  /**
   * Wait for job completion (optional for synchronous behavior)
   */
  private async waitForJobCompletion(jobId: string, timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const status = await ultraLightEmbeddingQueue.getJobStatus(jobId);
      
      if (!status) {
        this.logger.warn('Job status not available', { jobId });
        return;
      }
      
      if (status.state === 'completed') {
        this.logger.info('Job completed', { jobId, result: status.result });
        return;
      }
      
      if (status.state === 'failed') {
        this.logger.error('Job failed', { jobId, error: status.error });
        throw new Error(`Embedding job failed: ${status.error}`);
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    this.logger.warn('Job completion timeout', { jobId, timeoutMs });
  }
  
  /**
   * Check if recently indexed
   * @param pageId - The page ID to check
   * @param maxAgeMinutes - Maximum age in minutes (e.g., 0.17 for 10 seconds)
   */
  private async wasRecentlyIndexed(pageId: string, maxAgeMinutes: number): Promise<boolean> {
    try {
      const result = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count, MAX(created_at) as last_indexed
        FROM page_embeddings
        WHERE page_id = ${pageId}::uuid
        LIMIT 1
      `;
      
      const count = this.safeBigIntToNumber(result[0]?.count) || 0;
      if (count === 0) return false;
      
      const lastIndexed = result[0].last_indexed;
      if (!lastIndexed) return false;
      
      const ageMinutes = (Date.now() - new Date(lastIndexed).getTime()) / (1000 * 60);
      this.logger.info('Checking if recently indexed', { 
        pageId,
        lastIndexed,
        ageMinutes,
        maxAgeMinutes,
        willSkip: ageMinutes < maxAgeMinutes
      });
      return ageMinutes < maxAgeMinutes;
      
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Cleanup embeddings
   */
  private async cleanupEmbeddings(pageId: string): Promise<void> {
    try {
      await withRetry(() =>
        prisma.$executeRaw`
          DELETE FROM page_embeddings 
          WHERE page_id = ${pageId}::uuid
        `
      );
    } catch (error) {
      this.logger.warn('Cleanup failed', { pageId, error });
    }
  }
  
  /**
   * Clear AI cache only
   */
  private async clearAICache(pageId: string, workspaceId: string): Promise<void> {
    try {
      const { aiBlockService } = await import('../ai-block-service.server');
      aiBlockService.clearCacheForPage(workspaceId, pageId);
    } catch (error) {
      // Ignore cache errors
    }
  }
}

export const ultraLightIndexingService = new UltraLightIndexingService();