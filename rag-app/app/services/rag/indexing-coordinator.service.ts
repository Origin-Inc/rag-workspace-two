import { DebugLogger } from '~/utils/debug-logger';
import { ultraLightIndexingServiceV2 } from './ultra-light-indexing-v2.service';
import { ultraLightIndexingService } from './ultra-light-indexing.service';

/**
 * Indexing Coordinator - Routes indexing requests to appropriate service
 * based on environment and constraints
 */
export class IndexingCoordinator {
  private logger = new DebugLogger('IndexingCoordinator');
  
  // Environment detection
  private readonly isVercel = process.env.VERCEL === '1';
  private readonly isHobbyPlan = !process.env.VERCEL_PRO;
  private readonly functionTimeout = this.getFunctionTimeout();
  
  /**
   * Determine function timeout based on environment
   */
  private getFunctionTimeout(): number {
    // Check for explicit timeout configuration
    if (process.env.FUNCTION_TIMEOUT) {
      return parseInt(process.env.FUNCTION_TIMEOUT, 10);
    }
    
    // Vercel Hobby = 10s, Pro = 60s, Enterprise = 900s
    if (this.isVercel) {
      if (this.isHobbyPlan) return 10000;
      if (process.env.VERCEL_ENTERPRISE) return 900000;
      return 60000; // Pro
    }
    
    // Local development or other platforms
    return 300000; // 5 minutes
  }
  
  /**
   * Index a page using the most appropriate strategy
   */
  async indexPage(
    pageId: string, 
    options: {
      immediate?: boolean;
      source?: 'user-save' | 'background' | 'api';
    } = {}
  ): Promise<{
    success: boolean;
    message: string;
    metrics?: Record<string, any>;
  }> {
    const { immediate = false, source = 'api' } = options;
    
    this.logger.info('🎯 Routing indexing request', {
      pageId,
      immediate,
      source,
      isVercel: this.isVercel,
      isHobbyPlan: this.isHobbyPlan,
      functionTimeout: this.functionTimeout
    });
    
    try {
      // Use V2 for Vercel Hobby plan (10s limit)
      if (this.isVercel && this.functionTimeout <= 10000) {
        this.logger.info('Using V2 indexing for Vercel Hobby constraints');
        
        const result = await ultraLightIndexingServiceV2.indexPage(pageId, immediate);
        
        return {
          success: result.status !== 'error',
          message: result.message,
          metrics: {
            ...result.metrics,
            service: 'v2',
            timeout: this.functionTimeout
          }
        };
      }
      
      // Use V1 for environments with longer timeouts
      if (this.functionTimeout >= 30000) {
        this.logger.info('Using V1 indexing with transaction support');
        
        const startTime = Date.now();
        await ultraLightIndexingService.indexPage(pageId, immediate);
        const elapsed = Date.now() - startTime;
        
        return {
          success: true,
          message: `Indexed successfully in ${elapsed}ms`,
          metrics: {
            elapsed,
            service: 'v1',
            timeout: this.functionTimeout
          }
        };
      }
      
      // Medium timeout (10-30s) - use V2 with extended limits
      this.logger.info('Using V2 indexing with extended limits');
      
      const result = await ultraLightIndexingServiceV2.indexPage(pageId, immediate);
      
      return {
        success: result.status !== 'error',
        message: result.message,
        metrics: {
          ...result.metrics,
          service: 'v2-extended',
          timeout: this.functionTimeout
        }
      };
      
    } catch (error) {
      this.logger.error('Indexing failed in coordinator', {
        pageId,
        error: error instanceof Error ? error.message : 'Unknown error',
        service: this.functionTimeout <= 10000 ? 'v2' : 'v1'
      });
      
      // Fallback to V2 if V1 fails
      if (this.functionTimeout > 10000) {
        try {
          this.logger.warn('Falling back to V2 indexing after V1 failure');
          const result = await ultraLightIndexingServiceV2.indexPage(pageId, immediate);
          
          return {
            success: result.status !== 'error',
            message: `Fallback: ${result.message}`,
            metrics: {
              ...result.metrics,
              service: 'v2-fallback',
              timeout: this.functionTimeout
            }
          };
        } catch (fallbackError) {
          this.logger.error('Fallback also failed', { pageId, fallbackError });
        }
      }
      
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Indexing failed',
        metrics: {
          service: this.functionTimeout <= 10000 ? 'v2' : 'v1',
          timeout: this.functionTimeout,
          error: true
        }
      };
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
    service: string;
  }> {
    // Always use V2 for status checks (faster)
    const status = await ultraLightIndexingServiceV2.getIndexingStatus(pageId);
    
    return {
      ...status,
      service: 'v2'
    };
  }
  
  /**
   * Get coordinator configuration
   */
  getConfiguration(): {
    environment: string;
    functionTimeout: number;
    preferredService: string;
    features: string[];
  } {
    return {
      environment: this.isVercel ? 'vercel' : 'other',
      functionTimeout: this.functionTimeout,
      preferredService: this.functionTimeout <= 10000 ? 'v2' : 'v1',
      features: [
        this.functionTimeout <= 10000 ? 'async-queue' : 'transactions',
        this.functionTimeout <= 10000 ? 'no-embeddings-sync' : 'embeddings-sync',
        'performance-tracking',
        'fallback-support'
      ]
    };
  }
}

// Export singleton instance
export const indexingCoordinator = new IndexingCoordinator();