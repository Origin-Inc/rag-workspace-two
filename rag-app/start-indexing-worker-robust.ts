#!/usr/bin/env node
/**
 * Production-ready BullMQ worker for processing page indexing jobs
 * Handles RAG content indexing with automatic retries and error recovery
 */

import { IndexingWorker } from './app/services/rag/workers/indexing-worker';
import { DebugLogger } from './app/utils/debug-logger';
import { redisWorker } from './app/utils/redis.server';

const logger = new DebugLogger('WorkerManager');

class WorkerManager {
  private worker: IndexingWorker | null = null;
  private isShuttingDown = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();
  private processedJobs = 0;

  async start() {
    logger.info('🚀 === STARTING INDEXING WORKER MANAGER ===');
    
    // Check Redis connection
    if (!redisWorker) {
      logger.error('❌ Redis connection not available. Please ensure Redis is running.');
      process.exit(1);
    }

    try {
      // Test Redis connection
      await redisWorker.ping();
      logger.info('✅ Redis connection verified');
    } catch (error) {
      logger.error('❌ Failed to connect to Redis:', error);
      process.exit(1);
    }

    // Create and start worker
    this.worker = new IndexingWorker();
    await this.worker.start();
    
    logger.info('✅ Indexing worker started successfully');
    logger.info('📊 Worker configuration:');
    logger.info('   - Queue: page-indexing');
    logger.info('   - Concurrency: 3 jobs');
    logger.info('   - Rate limit: 10 jobs/minute');
    logger.info('   - Auto-retry: 3 attempts');
    
    // Set up health monitoring
    this.setupHealthCheck();
    
    // Set up graceful shutdown
    this.setupShutdownHandlers();
    
    // Log startup complete
    logger.info('🎯 Worker manager ready and processing jobs');
    logger.info('   Press Ctrl+C to gracefully shutdown\n');
  }

  private setupHealthCheck() {
    // Health check every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        const stats = await this.getWorkerStats();
        logger.info('💓 Health check:', stats);
      } catch (error) {
        logger.error('❌ Health check failed:', error);
      }
    }, 30000);
  }

  private async getWorkerStats() {
    if (!this.worker) {
      return { status: 'not_started' };
    }

    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    return {
      status: 'running',
      uptime: `${hours}h ${minutes}m ${seconds}s`,
      processedJobs: this.processedJobs,
      timestamp: new Date().toISOString()
    };
  }

  private setupShutdownHandlers() {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.info(`\n📛 Received ${signal}, starting graceful shutdown...`);

      // Clear health check
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Stop worker
      if (this.worker) {
        logger.info('⏸️  Stopping worker...');
        await this.worker.stop();
        logger.info('✅ Worker stopped');
      }

      // Close Redis connection
      if (redisWorker) {
        logger.info('🔌 Closing Redis connection...');
        await redisWorker.quit();
        logger.info('✅ Redis connection closed');
      }

      logger.info('👋 Shutdown complete');
      process.exit(0);
    };

    // Handle various shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGHUP', () => shutdown('SIGHUP'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }

  // Track processed jobs (called by worker events)
  incrementProcessedJobs() {
    this.processedJobs++;
  }
}

// Auto-restart on failure with exponential backoff
async function startWithRetry(retryCount = 0) {
  const maxRetries = 5;
  const manager = new WorkerManager();

  try {
    await manager.start();
  } catch (error) {
    logger.error('❌ Failed to start worker:', error);
    
    if (retryCount < maxRetries) {
      const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000);
      logger.info(`⏳ Retrying in ${backoffMs / 1000} seconds... (attempt ${retryCount + 1}/${maxRetries})`);
      
      setTimeout(() => {
        startWithRetry(retryCount + 1);
      }, backoffMs);
    } else {
      logger.error('❌ Max retries reached. Exiting.');
      process.exit(1);
    }
  }
}

// Start the worker
logger.info('🏁 Initializing Indexing Worker...\n');
startWithRetry();