import { prisma } from '~/utils/db.server';
import { DebugLogger } from '~/utils/debug-logger';
import { withRetry } from '~/utils/db.server';
import type { Page } from '@prisma/client';

/**
 * Performance metrics tracker for indexing operations
 */
class PerformanceTracker {
  private metrics: Map<string, number> = new Map();
  private startTimes: Map<string, number> = new Map();
  
  start(operation: string): void {
    this.startTimes.set(operation, Date.now());
  }
  
  end(operation: string): number {
    const startTime = this.startTimes.get(operation);
    if (!startTime) return 0;
    
    const duration = Date.now() - startTime;
    this.metrics.set(operation, duration);
    this.startTimes.delete(operation);
    return duration;
  }
  
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }
  
  getTotalTime(): number {
    return Array.from(this.metrics.values()).reduce((sum, time) => sum + time, 0);
  }
}

/**
 * Ultra-light indexing service V2 - Optimized for Vercel's 10-second limit
 * 
 * Key optimizations:
 * 1. NO transactions - direct operations only
 * 2. Async queue-based processing
 * 3. Minimal database operations
 * 4. Performance tracking for debugging
 */
export class UltraLightIndexingServiceV2 {
  private logger = new DebugLogger('UltraLightIndexingV2');
  private processingPages = new Set<string>();
  
  // Vercel constraints
  private readonly VERCEL_TIMEOUT = 9000; // 9 seconds (leaving 1s buffer)
  private readonly HOBBY_PLAN_TIMEOUT = 10000; // 10 seconds hard limit
  
  // Optimized settings for Vercel
  private readonly MAX_CHUNKS_PER_REQUEST = 10; // Process max 10 chunks per request
  private readonly CHUNK_SIZE = 200; // Smaller chunks for faster processing
  private readonly BATCH_SIZE = 2; // Smaller batches for OpenAI
  
  /**
   * Main entry point - returns quickly and queues work
   */
  async indexPage(pageId: string, immediate: boolean = false): Promise<{ 
    status: 'queued' | 'processing' | 'completed' | 'error';
    message: string;
    metrics?: Record<string, number>;
  }> {
    const tracker = new PerformanceTracker();
    tracker.start('total');
    
    try {
      // Check if already processing
      if (this.processingPages.has(pageId)) {
        return { 
          status: 'processing', 
          message: 'Page is already being indexed' 
        };
      }
      
      this.processingPages.add(pageId);
      tracker.start('fetch_page');
      
      // Fetch page data (should be fast)
      const page = await this.fetchPageQuickly(pageId);
      const fetchTime = tracker.end('fetch_page');
      
      if (!page) {
        this.processingPages.delete(pageId);
        return { 
          status: 'error', 
          message: 'Page not found',
          metrics: tracker.getMetrics()
        };
      }
      
      // Extract content (should be fast)
      tracker.start('extract_content');
      const content = this.extractMinimalContent(page);
      const extractTime = tracker.end('extract_content');
      
      if (!content || content.length < 50) {
        tracker.start('cleanup');
        await this.quickCleanup(pageId);
        tracker.end('cleanup');
        
        this.processingPages.delete(pageId);
        return { 
          status: 'completed', 
          message: 'No content to index',
          metrics: tracker.getMetrics()
        };
      }
      
      // Create chunks (should be fast)
      tracker.start('create_chunks');
      const chunks = this.createOptimizedChunks(content, pageId);
      const chunkTime = tracker.end('create_chunks');
      
      this.logger.info('📊 Pre-processing metrics', {
        pageId,
        fetchTime,
        extractTime,
        chunkTime,
        chunksCount: chunks.length,
        contentLength: content.length
      });
      
      // If we have time, process synchronously (for small pages)
      const elapsedTime = tracker.getTotalTime();
      const remainingTime = this.VERCEL_TIMEOUT - elapsedTime;
      
      if (chunks.length <= 5 && remainingTime > 5000) {
        // Small page, process immediately
        tracker.start('process_sync');
        await this.processSynchronously(page, chunks, remainingTime);
        tracker.end('process_sync');
        
        this.processingPages.delete(pageId);
        
        const totalTime = tracker.end('total');
        this.logger.info('✅ Synchronous indexing completed', {
          pageId,
          totalTime,
          metrics: tracker.getMetrics()
        });
        
        return { 
          status: 'completed', 
          message: `Indexed ${chunks.length} chunks in ${totalTime}ms`,
          metrics: tracker.getMetrics()
        };
      }
      
      // Large page - queue for async processing
      tracker.start('queue_async');
      const queued = await this.queueForAsyncProcessing(page, chunks);
      tracker.end('queue_async');
      
      this.processingPages.delete(pageId);
      
      const totalTime = tracker.end('total');
      
      if (queued) {
        this.logger.info('📋 Async indexing queued', {
          pageId,
          totalTime,
          chunksCount: chunks.length,
          metrics: tracker.getMetrics()
        });
        
        return { 
          status: 'queued', 
          message: `Queued ${chunks.length} chunks for processing`,
          metrics: tracker.getMetrics()
        };
      } else {
        // Queue not available, return partial success
        return { 
          status: 'queued', 
          message: 'Indexing deferred - will process on next request',
          metrics: tracker.getMetrics()
        };
      }
      
    } catch (error) {
      this.processingPages.delete(pageId);
      
      this.logger.error('Indexing failed', {
        pageId,
        error: error instanceof Error ? error.message : 'Unknown error',
        metrics: tracker.getMetrics()
      });
      
      return { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Indexing failed',
        metrics: tracker.getMetrics()
      };
    }
  }
  
  /**
   * Fetch page data as quickly as possible
   */
  private async fetchPageQuickly(pageId: string): Promise<any | null> {
    try {
      // Direct query, no transaction
      const page = await prisma.page.findUnique({
        where: { id: pageId },
        select: {
          id: true,
          title: true,
          workspaceId: true,
          blocks: true,
          content: true
        }
      });
      
      return page;
    } catch (error) {
      this.logger.error('Failed to fetch page', { pageId, error });
      return null;
    }
  }
  
  /**
   * Extract minimal content for processing
   */
  private extractMinimalContent(page: any): string {
    const parts: string[] = [];
    
    // Title only
    if (page.title) {
      parts.push(page.title);
    }
    
    // First few blocks only
    if (page.blocks && Array.isArray(page.blocks)) {
      let totalLength = 0;
      const maxBlocks = 20; // Limit blocks to process
      
      for (let i = 0; i < Math.min(page.blocks.length, maxBlocks); i++) {
        const block = page.blocks[i];
        if (totalLength > 10000) break; // 10KB max
        
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
      parts.push(content.substring(0, 10000));
    }
    
    return parts.join('\n').substring(0, 10000); // Max 10KB
  }
  
  /**
   * Extract text from a block
   */
  private extractBlockText(block: any): string {
    if (!block) return '';
    
    if (typeof block.content === 'string') {
      return block.content.substring(0, 500); // Limit each block
    }
    
    if (block.content?.text) {
      return String(block.content.text).substring(0, 500);
    }
    
    return '';
  }
  
  /**
   * Create optimized chunks for quick processing
   */
  private createOptimizedChunks(
    content: string, 
    pageId: string
  ): Array<{ text: string; index: number }> {
    const chunks: Array<{ text: string; index: number }> = [];
    
    // Split into smaller chunks
    const words = content.split(/\s+/);
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const word of words) {
      if (currentChunk.length + word.length > this.CHUNK_SIZE) {
        if (currentChunk) {
          chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
          if (chunks.length >= this.MAX_CHUNKS_PER_REQUEST) break;
        }
        currentChunk = word;
      } else {
        currentChunk += ' ' + word;
      }
    }
    
    // Add last chunk
    if (currentChunk && chunks.length < this.MAX_CHUNKS_PER_REQUEST) {
      chunks.push({ text: currentChunk.trim(), index: chunkIndex });
    }
    
    return chunks;
  }
  
  /**
   * Process synchronously for small pages
   */
  private async processSynchronously(
    page: any,
    chunks: Array<{ text: string; index: number }>,
    timeLimit: number
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Skip embedding generation in sync mode if we're tight on time
      if (timeLimit < 3000) {
        this.logger.warn('⚠️ Skipping embeddings due to time constraint', {
          pageId: page.id,
          timeLimit
        });
        return;
      }
      
      // Store chunks without embeddings for now
      await this.storeChunksWithoutEmbeddings(page.id, page.workspaceId, chunks);
      
      const elapsed = Date.now() - startTime;
      this.logger.info('📝 Stored chunks without embeddings', {
        pageId: page.id,
        chunks: chunks.length,
        elapsed
      });
      
    } catch (error) {
      this.logger.error('Sync processing failed', {
        pageId: page.id,
        error,
        elapsed: Date.now() - startTime
      });
      throw error;
    }
  }
  
  /**
   * Store chunks without embeddings (for quick response)
   */
  private async storeChunksWithoutEmbeddings(
    pageId: string,
    workspaceId: string,
    chunks: Array<{ text: string; index: number }>
  ): Promise<void> {
    try {
      // Delete old embeddings
      await prisma.pageEmbedding.deleteMany({
        where: { pageId }
      });
      
      // Create new embeddings without vector data
      const embeddings = chunks.map(chunk => ({
        pageId,
        workspaceId,
        chunkText: chunk.text,
        chunkIndex: chunk.index,
        metadata: {
          indexed_at: new Date().toISOString(),
          has_embedding: false
        }
      }));
      
      // Use createMany for efficiency
      await prisma.pageEmbedding.createMany({
        data: embeddings,
        skipDuplicates: true
      });
      
    } catch (error) {
      this.logger.error('Failed to store chunks', { pageId, error });
      throw error;
    }
  }
  
  /**
   * Queue for async processing
   */
  private async queueForAsyncProcessing(
    page: any,
    chunks: Array<{ text: string; index: number }>
  ): Promise<boolean> {
    try {
      // Try to use the embedding queue if available
      const { ultraLightEmbeddingQueue } = await import('./queues/ultra-light-embedding-queue');
      
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
          priority: 'high', // High priority for user-initiated saves
          debounced: false
        }
      );
      
      return !!jobId;
      
    } catch (error) {
      this.logger.warn('Queue not available', { error });
      
      // Store chunks without embeddings as fallback
      await this.storeChunksWithoutEmbeddings(page.id, page.workspaceId, chunks);
      return false;
    }
  }
  
  /**
   * Quick cleanup of old embeddings
   */
  private async quickCleanup(pageId: string): Promise<void> {
    try {
      await prisma.pageEmbedding.deleteMany({
        where: { pageId }
      });
    } catch (error) {
      this.logger.error('Cleanup failed', { pageId, error });
    }
  }
  
  /**
   * Get indexing status for a page
   */
  async getIndexingStatus(pageId: string): Promise<{
    isIndexed: boolean;
    hasEmbeddings: boolean;
    chunkCount: number;
    lastIndexed?: Date;
  }> {
    try {
      const embeddings = await prisma.pageEmbedding.findMany({
        where: { pageId },
        select: {
          id: true,
          embedding: true,
          createdAt: true
        }
      });
      
      const hasEmbeddings = embeddings.some(e => e.embedding != null);
      
      return {
        isIndexed: embeddings.length > 0,
        hasEmbeddings,
        chunkCount: embeddings.length,
        lastIndexed: embeddings[0]?.createdAt
      };
      
    } catch (error) {
      this.logger.error('Failed to get status', { pageId, error });
      return {
        isIndexed: false,
        hasEmbeddings: false,
        chunkCount: 0
      };
    }
  }
}

// Export singleton instance
export const ultraLightIndexingServiceV2 = new UltraLightIndexingServiceV2();