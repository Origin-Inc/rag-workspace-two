import { DebugLogger } from '~/utils/debug-logger';

/**
 * Connection Pool Manager
 * Manages database operations to prevent connection pool exhaustion
 */
export class ConnectionPoolManager {
  private logger = new DebugLogger('ConnectionPool');
  private activeOperations = new Set<string>();
  private operationQueue: Array<() => Promise<void>> = [];
  private readonly MAX_CONCURRENT_OPERATIONS = 10; // Limit concurrent DB operations
  private processingQueue = false;

  /**
   * Execute an operation with connection pool management
   */
  async executeWithPoolManagement<T>(
    operationId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // If we're at capacity, queue the operation
    if (this.activeOperations.size >= this.MAX_CONCURRENT_OPERATIONS) {
      this.logger.info('🚦 Operation queued (pool at capacity)', {
        operationId,
        activeCount: this.activeOperations.size,
        queueLength: this.operationQueue.length
      });

      return new Promise((resolve, reject) => {
        this.operationQueue.push(async () => {
          try {
            const result = await this.executeOperation(operationId, operation);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
        
        // Process queue if not already processing
        if (!this.processingQueue) {
          this.processQueue();
        }
      });
    }

    // Execute immediately if under capacity
    return this.executeOperation(operationId, operation);
  }

  private async executeOperation<T>(
    operationId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    this.activeOperations.add(operationId);
    
    try {
      this.logger.info('🟢 Starting operation', {
        operationId,
        activeCount: this.activeOperations.size
      });

      const result = await operation();
      
      this.logger.info('✅ Operation completed', {
        operationId,
        activeCount: this.activeOperations.size - 1
      });

      return result;
    } catch (error) {
      this.logger.error('❌ Operation failed', {
        operationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
      
      // Process next in queue if any
      if (this.operationQueue.length > 0 && !this.processingQueue) {
        this.processQueue();
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;

    while (
      this.operationQueue.length > 0 && 
      this.activeOperations.size < this.MAX_CONCURRENT_OPERATIONS
    ) {
      const operation = this.operationQueue.shift();
      if (operation) {
        operation().catch(error => {
          this.logger.error('Queue operation failed', { error });
        });
      }
    }

    this.processingQueue = false;
  }

  /**
   * Get current pool status
   */
  getStatus(): {
    activeOperations: number;
    queuedOperations: number;
    maxConcurrent: number;
  } {
    return {
      activeOperations: this.activeOperations.size,
      queuedOperations: this.operationQueue.length,
      maxConcurrent: this.MAX_CONCURRENT_OPERATIONS
    };
  }
}

// Singleton instance
export const connectionPoolManager = new ConnectionPoolManager();