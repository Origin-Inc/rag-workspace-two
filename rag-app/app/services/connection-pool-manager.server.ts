import { prisma, executeWithTransaction } from '~/utils/db.server';
import { getPoolingConfig } from '~/utils/db-pooling.server';
import { DebugLogger } from '~/utils/debug-logger';
import type { PrismaClient } from '@prisma/client';

const logger = new DebugLogger('ConnectionPoolManager');

interface PoolMetrics {
  totalQueries: number;
  failedQueries: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  connectionErrors: number;
  preparedStatementErrors: number;
}

/**
 * Connection Pool Manager for optimized database operations
 * Handles transaction mode compatibility and connection pooling
 */
export class ConnectionPoolManager {
  private metrics: PoolMetrics = {
    totalQueries: 0,
    failedQueries: 0,
    avgLatency: 0,
    p95Latency: 0,
    p99Latency: 0,
    connectionErrors: 0,
    preparedStatementErrors: 0,
  };
  
  private latencies: number[] = [];
  private readonly maxLatencyHistory = 1000;
  
  constructor(private client: PrismaClient = prisma) {}
  
  /**
   * Execute a database operation with proper pooling management
   * Automatically wraps in transaction for transaction mode compatibility
   */
  async executeWithPoolManagement<T>(
    operationName: string,
    operation: (tx: PrismaClient) => Promise<T>,
    options: {
      maxRetries?: number;
      timeout?: number;
      isolationLevel?: 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
    } = {}
  ): Promise<T> {
    const config = getPoolingConfig();
    const { 
      maxRetries = config.port === 6543 ? 3 : 1,
      timeout = 10000,
      isolationLevel = 'ReadCommitted'
    } = options;
    
    const startTime = Date.now();
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.trace(`Executing ${operationName} (attempt ${attempt}/${maxRetries})`);
        
        let result: T;
        
        // In transaction mode, wrap everything in transactions
        if (config.port === 6543) {
          result = await this.client.$transaction(
            async (tx) => {
              return operation(tx as PrismaClient);
            },
            {
              maxWait: 5000,
              timeout,
              isolationLevel,
            }
          );
        } else {
          // In session mode, execute directly
          result = await operation(this.client);
        }
        
        // Record successful query metrics
        const latency = Date.now() - startTime;
        this.recordLatency(latency);
        this.metrics.totalQueries++;
        
        logger.trace(`${operationName} completed in ${latency}ms`);
        
        return result;
      } catch (error: any) {
        lastError = error;
        this.metrics.failedQueries++;
        
        // Handle specific error types
        if (this.isPreparedStatementError(error)) {
          this.metrics.preparedStatementErrors++;
          logger.warn(`Prepared statement error in ${operationName}`, {
            attempt,
            error: error.message,
          });
          
          if (attempt < maxRetries) {
            await this.reconnectClient();
            await this.delay(100 * attempt); // Exponential backoff
            continue;
          }
        }
        
        if (this.isConnectionError(error)) {
          this.metrics.connectionErrors++;
          logger.warn(`Connection error in ${operationName}`, {
            attempt,
            error: error.message,
          });
          
          if (attempt < maxRetries) {
            await this.delay(500 * attempt); // Longer delay for connection errors
            continue;
          }
        }
        
        // Log the error and rethrow
        logger.error(`${operationName} failed after ${attempt} attempts`, error);
        throw error;
      }
    }
    
    throw lastError;
  }
  
  /**
   * Execute multiple operations in a single transaction
   * Optimized for batch operations
   */
  async executeBatch<T>(
    operationName: string,
    operations: Array<(tx: PrismaClient) => Promise<any>>,
    options: {
      parallel?: boolean;
      continueOnError?: boolean;
    } = {}
  ): Promise<T[]> {
    const { parallel = false, continueOnError = false } = options;
    
    return this.executeWithPoolManagement(
      `batch_${operationName}`,
      async (tx) => {
        const results: T[] = [];
        
        if (parallel) {
          // Execute operations in parallel within the transaction
          const promises = operations.map(async (op, index) => {
            try {
              return await op(tx);
            } catch (error) {
              if (!continueOnError) throw error;
              logger.warn(`Batch operation ${index} failed`, error);
              return null;
            }
          });
          
          const batchResults = await Promise.all(promises);
          results.push(...batchResults.filter(r => r !== null));
        } else {
          // Execute operations sequentially
          for (const [index, op] of operations.entries()) {
            try {
              const result = await op(tx);
              results.push(result);
            } catch (error) {
              if (!continueOnError) throw error;
              logger.warn(`Batch operation ${index} failed`, error);
            }
          }
        }
        
        return results;
      }
    );
  }
  
  /**
   * Execute a read-only query with optimizations
   */
  async executeReadOnly<T>(
    operationName: string,
    query: (tx: PrismaClient) => Promise<T>
  ): Promise<T> {
    return this.executeWithPoolManagement(
      `readonly_${operationName}`,
      query,
      {
        isolationLevel: 'ReadCommitted', // Lowest isolation for reads
        timeout: 5000, // Shorter timeout for reads
      }
    );
  }
  
  /**
   * Execute a write operation with stronger consistency
   */
  async executeWrite<T>(
    operationName: string,
    operation: (tx: PrismaClient) => Promise<T>
  ): Promise<T> {
    return this.executeWithPoolManagement(
      `write_${operationName}`,
      operation,
      {
        isolationLevel: 'RepeatableRead', // Stronger isolation for writes
        timeout: 15000, // Longer timeout for writes
        maxRetries: 3, // More retries for important writes
      }
    );
  }
  
  /**
   * Get current pool metrics
   */
  getMetrics(): PoolMetrics & { current: any } {
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);
    
    return {
      ...this.metrics,
      avgLatency: this.latencies.length > 0 
        ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length)
        : 0,
      p95Latency: sortedLatencies[p95Index] || 0,
      p99Latency: sortedLatencies[p99Index] || 0,
      current: {
        poolingMode: getPoolingConfig().port === 6543 ? 'transaction' : 'session',
        connectionLimit: getPoolingConfig().connectionLimit,
      },
    };
  }
  
  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalQueries: 0,
      failedQueries: 0,
      avgLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      connectionErrors: 0,
      preparedStatementErrors: 0,
    };
    this.latencies = [];
  }
  
  // Private helper methods
  
  private recordLatency(latency: number): void {
    this.latencies.push(latency);
    
    // Keep only recent latencies
    if (this.latencies.length > this.maxLatencyHistory) {
      this.latencies.shift();
    }
  }
  
  private isPreparedStatementError(error: any): boolean {
    return (
      error?.message?.includes('prepared statement') ||
      error?.code === '42P05' ||
      error?.code === '25P02' ||
      error?.meta?.code === '42P05'
    );
  }
  
  private isConnectionError(error: any): boolean {
    return (
      error?.code === 'P2024' ||
      error?.message?.includes('connection') ||
      error?.message?.includes('Connection pool timeout') ||
      error?.message?.includes('Too many connections')
    );
  }
  
  private async reconnectClient(): Promise<void> {
    try {
      await this.client.$disconnect();
      await this.delay(100);
      await this.client.$connect();
      logger.info('Client reconnected successfully');
    } catch (error) {
      logger.error('Failed to reconnect client', error);
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const connectionPoolManager = new ConnectionPoolManager();

// Export convenience functions for common patterns

/**
 * Execute a simple query with automatic pooling management
 */
export async function withPooling<T>(
  operation: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return connectionPoolManager.executeWithPoolManagement(
    'query',
    operation
  );
}

/**
 * Execute a batch of operations efficiently
 */
export async function batchWithPooling<T>(
  operations: Array<(tx: PrismaClient) => Promise<any>>,
  options?: { parallel?: boolean; continueOnError?: boolean }
): Promise<T[]> {
  return connectionPoolManager.executeBatch<T>(
    'batch',
    operations,
    options
  );
}

/**
 * Execute a read-only query with optimizations
 */
export async function readWithPooling<T>(
  query: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return connectionPoolManager.executeReadOnly(
    'read',
    query
  );
}

/**
 * Execute a write operation with strong consistency
 */
export async function writeWithPooling<T>(
  operation: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return connectionPoolManager.executeWrite(
    'write',
    operation
  );
}