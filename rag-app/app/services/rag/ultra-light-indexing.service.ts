import { prisma } from '~/utils/db.server';
import { openai } from '../openai.server';
import { DebugLogger } from '~/utils/debug-logger';
import { ContentExtractor } from './processors/content-extractor';
import { DocumentChunkingService } from '../document-chunking.server';
import { withRetry } from '~/utils/db.server';
import type { Page } from '@prisma/client';

/**
 * Ultra-light indexing service for severely constrained environments
 * Works with 10MB request limit and 100MB Redis with eviction
 */
export class UltraLightIndexingService {
  private logger = new DebugLogger('UltraLightIndexing');
  private extractor = new ContentExtractor();
  private chunker = new DocumentChunkingService();
  
  // Severely constrained configuration
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIMENSION = 1536;
  private readonly MAX_CHUNKS_PER_PAGE = 10; // Hard limit
  private readonly MAX_CHUNK_SIZE = 200; // Smaller chunks
  private readonly BATCH_SIZE = 2; // Tiny batches
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
      // Debounce for 5 seconds
      this.debounceIndexing(pageId);
    } else {
      await this.processPageUltraLight(pageId);
    }
  }
  
  /**
   * Debounce without Redis
   */
  private debounceIndexing(pageId: string): void {
    const existing = this.indexingTimeouts.get(pageId);
    if (existing) clearTimeout(existing);
    
    const timeout = setTimeout(async () => {
      this.indexingTimeouts.delete(pageId);
      await this.processPageUltraLight(pageId);
    }, 5000); // 5 second delay
    
    this.indexingTimeouts.set(pageId, timeout);
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
      
      // Check if recently indexed (10 seconds to prevent rapid re-indexing)
      const recentlyIndexed = await this.wasRecentlyIndexed(pageId, 0.17); // 10 seconds = 0.17 minutes
      if (recentlyIndexed) {
        this.logger.info('⏩ Skip - recently indexed (within 10 seconds)', { pageId });
        return;
      }
      
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
      
      // Count final embeddings
      const finalCount = await withRetry(() =>
        prisma.$executeRaw`
          SELECT COUNT(*) FROM page_embeddings 
          WHERE page_id = ${pageId}::uuid
        `
      );
      
      this.logger.info('✅ Ultra-light indexing complete', { 
        pageId,
        chunks: chunks.length,
        finalEmbeddingsCount: finalCount,
        contentPreview: content.substring(0, 200)
      });
      
    } catch (error) {
      this.logger.error('Failed', { pageId, error });
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
    
    // Extract text from blocks (limit to first 5000 chars)
    if (page.blocks && Array.isArray(page.blocks)) {
      let totalLength = 0;
      for (const block of page.blocks) {
        if (totalLength > 5000) break;
        
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
      parts.push(content.substring(0, 5000));
    }
    
    return parts.join('\n').substring(0, 8000); // Max 8KB of text
  }
  
  /**
   * Extract text from a block
   */
  private extractBlockText(block: any): string {
    if (!block) return '';
    
    if (typeof block.content === 'string') {
      return block.content.substring(0, 500);
    }
    
    if (block.content?.text) {
      return String(block.content.text).substring(0, 500);
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
   */
  private async processTinyBatches(
    page: any,
    chunks: Array<{ text: string; index: number }>
  ): Promise<void> {
    // Delete old embeddings first
    const deleteResult = await withRetry(() =>
      prisma.$executeRaw`
        DELETE FROM page_embeddings 
        WHERE page_id = ${page.id}::uuid
      `
    );
    
    this.logger.info('🗑️ Deleted old embeddings', { 
      pageId: page.id, 
      deletedCount: deleteResult,
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
                  ${vectorString}::vector,
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
        this.logger.warn('Batch failed', { batch: i, error });
      }
    }
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
      
      if (!result[0]?.count || result[0].count === '0') return false;
      
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