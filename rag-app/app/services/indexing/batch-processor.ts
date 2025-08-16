// Task 19.5: Batch processor with concurrency control for efficient indexing
import { createSupabaseAdmin } from '~/utils/supabase.server';
import { DebugLogger } from '~/utils/debug-logger';
import pLimit from 'p-limit';
import { pageContentIndexerService } from '../page-content-indexer.server';
import { embeddingGenerationService } from '../embedding-generation.server';
import { incrementalIndexer } from './incremental-indexer';
import { indexingPerformanceMonitor } from './performance-monitor';
import { cacheInvalidator } from './cache-invalidator';
import { indexingErrorHandler } from './error-handler';

interface IndexingTask {
  id: string;
  entity_type: string;
  entity_id: string;
  workspace_id: string;
  operation: 'insert' | 'update' | 'delete';
  priority: number;
  metadata?: Record<string, any>;
  retry_count: number;
}

interface ProcessingResult {
  taskId: string;
  success: boolean;
  error?: string;
  processingTimeMs?: number;
}

export class BatchIndexProcessor {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('BatchIndexProcessor');
  
  // Configuration
  private readonly BATCH_SIZE = 100;
  private readonly MAX_CONCURRENT = 5;
  private readonly RETRY_DELAY_BASE = 1000; // Base delay for retries in ms
  
  // Concurrency limiter
  private readonly limit = pLimit(this.MAX_CONCURRENT);
  
  // Performance tracking
  private processingStats = {
    totalProcessed: 0,
    totalFailed: 0,
    avgProcessingTime: 0
  };

  /**
   * Process a batch of indexing tasks
   */
  async processBatch(workerId?: string): Promise<ProcessingResult[]> {
    const startTime = Date.now();
    
    try {
      // Fetch tasks from queue
      const tasks = await this.getTopPriorityTasks(this.BATCH_SIZE, workerId);
      
      if (tasks.length === 0) {
        this.logger.debug('No tasks to process');
        return [];
      }
      
      this.logger.info('Processing batch', {
        taskCount: tasks.length,
        workerId
      });
      
      // Update queue depth metric
      const { data: queueStats } = await this.supabase
        .from('indexing_queue')
        .select('count')
        .eq('status', 'pending');
      
      if (queueStats && queueStats[0]) {
        indexingPerformanceMonitor.updateQueueDepth(queueStats[0].count);
      }
      
      // Group tasks by entity type for efficiency
      const grouped = this.groupTasksByType(tasks);
      
      // Process each group with concurrency control
      const results = await Promise.all(
        Object.entries(grouped).map(([entityType, entityTasks]) =>
          this.limit(() => this.processEntityBatch(entityType, entityTasks))
        )
      );
      
      // Flatten results
      const flatResults = results.flat();
      
      // Record batch metrics
      const duration = Date.now() - startTime;
      const successCount = flatResults.filter(r => r.success).length;
      indexingPerformanceMonitor.recordBatchProcessed(tasks.length, duration, successCount);
      
      // Update statistics
      this.updateStatistics(flatResults, duration);
      
      // Check error threshold
      if (indexingPerformanceMonitor.checkErrorThreshold()) {
        this.logger.warn('Error threshold exceeded, consider reducing batch size');
      }
      
      return flatResults;
      
    } catch (error) {
      this.logger.error('Batch processing failed', error);
      throw error;
    }
  }

  /**
   * Get top priority tasks from the queue
   */
  private async getTopPriorityTasks(
    batchSize: number,
    workerId?: string
  ): Promise<IndexingTask[]> {
    try {
      const { data, error } = await this.supabase.rpc('get_next_indexing_batch', {
        p_batch_size: batchSize,
        p_worker_id: workerId
      });
      
      if (error) {
        throw new Error(`Failed to fetch tasks: ${error.message}`);
      }
      
      return (data || []).map((row: any) => ({
        id: row.task_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        workspace_id: row.workspace_id,
        operation: row.operation,
        priority: row.priority,
        metadata: row.metadata,
        retry_count: row.retry_count
      }));
      
    } catch (error) {
      this.logger.error('Failed to fetch tasks from queue', error);
      return [];
    }
  }

  /**
   * Group tasks by entity type
   */
  private groupTasksByType(tasks: IndexingTask[]): Record<string, IndexingTask[]> {
    return tasks.reduce((groups, task) => {
      const key = task.entity_type;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(task);
      return groups;
    }, {} as Record<string, IndexingTask[]>);
  }

  /**
   * Process a batch of tasks for a specific entity type
   */
  private async processEntityBatch(
    entityType: string,
    tasks: IndexingTask[]
  ): Promise<ProcessingResult[]> {
    this.logger.debug('Processing entity batch', {
      entityType,
      count: tasks.length
    });
    
    const results: ProcessingResult[] = [];
    
    // Process tasks based on entity type
    switch (entityType) {
      case 'page':
        results.push(...await this.processPages(tasks));
        break;
      case 'block':
        results.push(...await this.processBlocks(tasks));
        break;
      case 'database':
        results.push(...await this.processDatabases(tasks));
        break;
      case 'document':
        results.push(...await this.processDocuments(tasks));
        break;
      default:
        this.logger.warn(`Unknown entity type: ${entityType}`);
        // Mark tasks as failed
        for (const task of tasks) {
          results.push({
            taskId: task.id,
            success: false,
            error: `Unknown entity type: ${entityType}`
          });
        }
    }
    
    // Mark tasks as completed or failed
    await this.updateTaskStatuses(results);
    
    return results;
  }

  /**
   * Process page indexing tasks
   */
  private async processPages(tasks: IndexingTask[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    
    // Use incremental indexing for non-delete operations
    const nonDeleteTasks = tasks.filter(t => t.operation !== 'delete');
    const deleteTasks = tasks.filter(t => t.operation === 'delete');
    
    // Process deletions
    for (const task of deleteTasks) {
      const operationId = `page-delete-${task.id}`;
      indexingPerformanceMonitor.recordOperationStart(operationId);
      const startTime = Date.now();
      
      try {
        await this.removePageFromIndex(task.entity_id, task.workspace_id);
        
        // Invalidate cache for deleted page
        await cacheInvalidator.invalidate('page', task.entity_id, 'delete');
        
        results.push({
          taskId: task.id,
          success: true,
          processingTimeMs: Date.now() - startTime
        });
        indexingPerformanceMonitor.recordOperationComplete(operationId, 'page', true);
      } catch (error) {
        this.logger.error(`Failed to delete page ${task.entity_id}`, error);
        results.push({
          taskId: task.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTimeMs: Date.now() - startTime
        });
        indexingPerformanceMonitor.recordOperationComplete(
          operationId, 
          'page', 
          false, 
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }
    
    // Process updates/inserts with incremental indexing
    if (nonDeleteTasks.length > 0) {
      const pageIds = nonDeleteTasks.map(t => t.entity_id);
      const startTime = Date.now();
      
      try {
        // Use incremental indexer for efficiency
        await incrementalIndexer.indexPages(pageIds);
        
        // Invalidate cache for updated pages
        for (const task of nonDeleteTasks) {
          await cacheInvalidator.invalidate('page', task.entity_id, task.operation as 'insert' | 'update');
        }
        
        // Mark all as successful
        for (const task of nonDeleteTasks) {
          results.push({
            taskId: task.id,
            success: true,
            processingTimeMs: Date.now() - startTime
          });
        }
      } catch (error) {
        this.logger.error('Failed to index pages incrementally', error);
        
        // Handle batch error with retry logic
        for (const task of nonDeleteTasks) {
          const shouldRetry = await indexingErrorHandler.handleError(
            error as Error,
            {
              taskId: task.id,
              entityType: 'page',
              entityId: task.entity_id,
              operation: task.operation
            }
          );
          
          if (!shouldRetry) {
            results.push({
              taskId: task.id,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              processingTimeMs: Date.now() - startTime
            });
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Process block indexing tasks
   */
  private async processBlocks(tasks: IndexingTask[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    
    // Separate delete and non-delete operations
    const nonDeleteTasks = tasks.filter(t => t.operation !== 'delete');
    const deleteTasks = tasks.filter(t => t.operation === 'delete');
    
    // Process deletions
    for (const task of deleteTasks) {
      const operationId = `block-delete-${task.id}`;
      indexingPerformanceMonitor.recordOperationStart(operationId);
      const startTime = Date.now();
      
      try {
        await pageContentIndexerService.removeBlockIndex(task.entity_id);
        
        // Invalidate cache for deleted block
        await cacheInvalidator.invalidate('block', task.entity_id, 'delete');
        
        results.push({
          taskId: task.id,
          success: true,
          processingTimeMs: Date.now() - startTime
        });
        indexingPerformanceMonitor.recordOperationComplete(operationId, 'block', true);
      } catch (error) {
        this.logger.error(`Failed to delete block ${task.entity_id}`, error);
        results.push({
          taskId: task.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTimeMs: Date.now() - startTime
        });
        indexingPerformanceMonitor.recordOperationComplete(
          operationId,
          'block',
          false,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }
    
    // Process updates/inserts with incremental indexing
    if (nonDeleteTasks.length > 0) {
      const blockIds = nonDeleteTasks.map(t => t.entity_id);
      const operationId = `block-batch-${Date.now()}`;
      indexingPerformanceMonitor.recordOperationStart(operationId);
      const startTime = Date.now();
      
      try {
        // Use incremental indexer for blocks
        await incrementalIndexer.indexBlocks(blockIds);
        
        // Invalidate cache for updated blocks
        for (const task of nonDeleteTasks) {
          await cacheInvalidator.invalidate('block', task.entity_id, task.operation as 'insert' | 'update');
        }
        
        // Mark all as successful
        for (const task of nonDeleteTasks) {
          results.push({
            taskId: task.id,
            success: true,
            processingTimeMs: Date.now() - startTime
          });
        }
        indexingPerformanceMonitor.recordOperationComplete(operationId, 'block', true);
      } catch (error) {
        this.logger.error('Failed to index blocks incrementally', error);
        // Mark all as failed
        for (const task of nonDeleteTasks) {
          results.push({
            taskId: task.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            processingTimeMs: Date.now() - startTime
          });
        }
        indexingPerformanceMonitor.recordOperationComplete(
          operationId,
          'block',
          false,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }
    
    return results;
  }

  /**
   * Process database indexing tasks
   */
  private async processDatabases(tasks: IndexingTask[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    
    for (const task of tasks) {
      const operationId = `database-${task.operation}-${task.id}`;
      indexingPerformanceMonitor.recordOperationStart(operationId);
      const startTime = Date.now();
      
      try {
        if (task.operation === 'delete') {
          await this.removeDatabaseFromIndex(task.entity_id, task.workspace_id);
        } else {
          await pageContentIndexerService.indexDatabaseBlock(
            task.entity_id,
            task.workspace_id
          );
        }
        
        // Invalidate cache for database changes
        await cacheInvalidator.invalidate('database', task.entity_id, task.operation);
        
        results.push({
          taskId: task.id,
          success: true,
          processingTimeMs: Date.now() - startTime
        });
        indexingPerformanceMonitor.recordOperationComplete(operationId, 'database', true);
        
      } catch (error) {
        this.logger.error(`Failed to process database ${task.entity_id}`, error);
        results.push({
          taskId: task.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTimeMs: Date.now() - startTime
        });
        indexingPerformanceMonitor.recordOperationComplete(
          operationId,
          'database',
          false,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }
    
    return results;
  }

  /**
   * Process document indexing tasks
   */
  private async processDocuments(tasks: IndexingTask[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    
    // Batch process documents for efficiency
    const documentIds = tasks.map(t => t.entity_id);
    
    for (const task of tasks) {
      const operationId = `document-${task.operation}-${task.id}`;
      indexingPerformanceMonitor.recordOperationStart(operationId);
      const startTime = Date.now();
      
      try {
        if (task.operation === 'delete') {
          // Remove document embeddings
          await this.supabase
            .from('documents')
            .delete()
            .eq('id', task.entity_id);
        } else {
          // Re-generate embeddings for document
          const { data: document } = await this.supabase
            .from('documents')
            .select('*')
            .eq('id', task.entity_id)
            .single();
          
          if (document) {
            await embeddingGenerationService.generateAndStoreEmbedding(
              document.content,
              task.workspace_id,
              {
                document_id: document.id,
                type: 'document'
              }
            );
          }
        }
        
        // Invalidate cache for document changes
        await cacheInvalidator.invalidate('document', task.entity_id, task.operation);
        
        results.push({
          taskId: task.id,
          success: true,
          processingTimeMs: Date.now() - startTime
        });
        indexingPerformanceMonitor.recordOperationComplete(operationId, 'document', true);
        
      } catch (error) {
        this.logger.error(`Failed to process document ${task.entity_id}`, error);
        results.push({
          taskId: task.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTimeMs: Date.now() - startTime
        });
        indexingPerformanceMonitor.recordOperationComplete(
          operationId,
          'document',
          false,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }
    
    return results;
  }

  /**
   * Remove page from index
   */
  private async removePageFromIndex(pageId: string, workspaceId: string): Promise<void> {
    // Remove all documents related to this page
    const { error } = await this.supabase
      .from('documents')
      .delete()
      .match({
        'metadata->>page_id': pageId,
        workspace_id: workspaceId
      });
    
    if (error) {
      throw new Error(`Failed to remove page from index: ${error.message}`);
    }
  }

  /**
   * Remove database from index
   */
  private async removeDatabaseFromIndex(dbId: string, workspaceId: string): Promise<void> {
    // Remove all documents related to this database
    const { error } = await this.supabase
      .from('documents')
      .delete()
      .match({
        'metadata->>db_block_id': dbId,
        workspace_id: workspaceId
      });
    
    if (error) {
      throw new Error(`Failed to remove database from index: ${error.message}`);
    }
  }

  /**
   * Update task statuses in the database
   */
  private async updateTaskStatuses(results: ProcessingResult[]): Promise<void> {
    for (const result of results) {
      try {
        await this.supabase.rpc('complete_indexing_task_with_metrics', {
          p_task_id: result.taskId,
          p_success: result.success,
          p_error_message: result.error,
          p_error_details: result.error ? { error: result.error } : null
        });
      } catch (error) {
        this.logger.error(`Failed to update task status for ${result.taskId}`, error);
      }
    }
  }

  /**
   * Update processing statistics
   */
  private updateStatistics(results: ProcessingResult[], batchTimeMs: number): void {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    this.processingStats.totalProcessed += successful.length;
    this.processingStats.totalFailed += failed.length;
    
    // Calculate average processing time
    const avgTime = successful.reduce((sum, r) => 
      sum + (r.processingTimeMs || 0), 0
    ) / (successful.length || 1);
    
    // Update running average
    const totalCount = this.processingStats.totalProcessed;
    this.processingStats.avgProcessingTime = 
      (this.processingStats.avgProcessingTime * (totalCount - successful.length) + avgTime) / totalCount;
    
    this.logger.info('Batch processing statistics', {
      batchTimeMs,
      successful: successful.length,
      failed: failed.length,
      avgProcessingTimeMs: avgTime,
      totalStats: this.processingStats
    });
  }

  /**
   * Get current processing statistics
   */
  getStatistics() {
    return { ...this.processingStats };
  }

  /**
   * Reset processing statistics
   */
  resetStatistics(): void {
    this.processingStats = {
      totalProcessed: 0,
      totalFailed: 0,
      avgProcessingTime: 0
    };
  }
}

// Create singleton instance
export const batchIndexProcessor = new BatchIndexProcessor();