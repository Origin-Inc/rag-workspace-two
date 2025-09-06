import { prisma } from '~/utils/db.server';
import { DebugLogger } from '~/utils/debug-logger';
import { connectionPoolManager } from '../connection-pool-manager.server';

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
    
    // Use connection pool manager to prevent exhaustion
    return connectionPoolManager.executeWithPoolManagement(
      `cleanup-${pageId || 'all'}`,
      async () => {
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
    );
  }

  private async cleanupPageDuplicates(pageId: string): Promise<number> {
    // More efficient: Delete duplicates in a single query without fetching them first
    try {
      const deleted = await prisma.$executeRaw`
        DELETE FROM page_embeddings
        WHERE page_id = ${pageId}::uuid
        AND id NOT IN (
          SELECT DISTINCT ON (page_id, chunk_index) id
          FROM page_embeddings
          WHERE page_id = ${pageId}::uuid
          ORDER BY page_id, chunk_index, created_at DESC
        )
      `;
      
      if (deleted > 0) {
        this.logger.info('Deleted duplicate embeddings', { 
          pageId, 
          deletedCount: deleted 
        });
      }
      
      return Number(deleted); // Convert BigInt to number
    } catch (error) {
      this.logger.error('Failed to cleanup duplicates', { pageId, error });
      return 0;
    }
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