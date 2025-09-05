import { prisma } from '~/utils/db.server';
import { DebugLogger } from '~/utils/debug-logger';

/**
 * Service to clean up stale and duplicate embeddings
 */
export class EmbeddingCleanupService {
  private logger = new DebugLogger('EmbeddingCleanup');

  /**
   * Remove all duplicate embeddings, keeping only the most recent ones
   */
  async cleanupDuplicates(pageId?: string): Promise<number> {
    this.logger.info('Starting duplicate cleanup', { pageId });
    
    try {
      if (pageId) {
        // Clean specific page
        return await this.cleanupPageDuplicates(pageId);
      } else {
        // Clean all pages
        return await this.cleanupAllDuplicates();
      }
    } catch (error) {
      this.logger.error('Cleanup failed', { error });
      throw error;
    }
  }

  private async cleanupPageDuplicates(pageId: string): Promise<number> {
    // Find duplicates - embeddings with same page_id and chunk_index
    const duplicates = await prisma.$queryRaw<any[]>`
      WITH duplicates AS (
        SELECT 
          page_id,
          chunk_index,
          COUNT(*) as count,
          MAX(created_at) as latest
        FROM page_embeddings
        WHERE page_id = ${pageId}::uuid
        GROUP BY page_id, chunk_index
        HAVING COUNT(*) > 1
      )
      SELECT 
        pe.id
      FROM page_embeddings pe
      INNER JOIN duplicates d 
        ON pe.page_id = d.page_id 
        AND pe.chunk_index = d.chunk_index
        AND pe.created_at < d.latest
      WHERE pe.page_id = ${pageId}::uuid
    `;

    if (duplicates.length > 0) {
      const idsToDelete = duplicates.map(d => d.id);
      
      const deleted = await prisma.$executeRaw`
        DELETE FROM page_embeddings
        WHERE id = ANY(${idsToDelete}::uuid[])
      `;
      
      this.logger.info('Deleted duplicate embeddings', { 
        pageId, 
        deletedCount: deleted 
      });
      
      return deleted;
    }
    
    return 0;
  }

  private async cleanupAllDuplicates(): Promise<number> {
    // Get all pages with embeddings
    const pages = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT page_id 
      FROM page_embeddings
    `;
    
    let totalDeleted = 0;
    
    for (const page of pages) {
      const deleted = await this.cleanupPageDuplicates(page.page_id);
      totalDeleted += deleted;
    }
    
    this.logger.info('Cleanup complete', { totalDeleted });
    return totalDeleted;
  }

  /**
   * Remove orphaned embeddings (no matching page)
   */
  async cleanupOrphaned(): Promise<number> {
    const deleted = await prisma.$executeRaw`
      DELETE FROM page_embeddings
      WHERE page_id NOT IN (
        SELECT id FROM pages
      )
    `;
    
    this.logger.info('Deleted orphaned embeddings', { deletedCount: deleted });
    return deleted;
  }

  /**
   * Complete cleanup - removes all stale data
   */
  async fullCleanup(): Promise<void> {
    this.logger.info('Starting full cleanup');
    
    // 1. Remove orphaned embeddings
    await this.cleanupOrphaned();
    
    // 2. Remove duplicates
    await this.cleanupDuplicates();
    
    // 3. Vacuum to reclaim space (optional, requires superuser)
    try {
      await prisma.$executeRaw`VACUUM ANALYZE page_embeddings`;
    } catch (error) {
      this.logger.warn('Vacuum failed (expected on managed databases)', { error });
    }
    
    this.logger.info('Full cleanup complete');
  }
}

export const embeddingCleanupService = new EmbeddingCleanupService();