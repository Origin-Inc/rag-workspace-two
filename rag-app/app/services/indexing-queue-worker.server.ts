import { createSupabaseAdmin } from '~/utils/supabase.server';
import { pageContentIndexerService } from './page-content-indexer.server';
import { DebugLogger } from '~/utils/debug-logger';

interface IndexingTask {
  id: string;
  entity_type: 'block' | 'database' | 'page' | 'row';
  entity_id: string;
  workspace_id: string;
  operation: 'insert' | 'update' | 'delete';
  metadata?: any;
  status?: string;
  priority?: number;
}

export class IndexingQueueWorker {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('IndexingQueueWorker');
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Start processing the queue
   */
  start(intervalMs: number = 5000): void {
    if (this.intervalId) {
      this.logger.info('Worker already running');
      return;
    }

    this.logger.info('Starting indexing queue worker', { intervalMs });
    
    // Process immediately
    this.processQueue();
    
    // Then process at intervals
    this.intervalId = setInterval(() => {
      if (!this.isProcessing) {
        this.processQueue();
      }
    }, intervalMs);
  }

  /**
   * Stop processing the queue
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info('Stopped indexing queue worker');
    }
  }

  /**
   * Process pending tasks in the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get batch of pending tasks
      const { data: tasks, error } = await this.supabase
        .rpc('process_indexing_queue', { p_batch_size: 10 });

      if (error) {
        this.logger.error('Failed to fetch tasks', error);
        return;
      }

      if (!tasks || tasks.length === 0) {
        return;
      }

      this.logger.info('Processing indexing tasks', { count: tasks.length });

      // Process each task
      for (const task of tasks) {
        await this.processTask(task);
      }
    } catch (error) {
      this.logger.error('Queue processing failed', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single indexing task
   */
  private async processTask(task: IndexingTask): Promise<void> {
    this.logger.info('Processing task', {
      id: task.id,
      type: task.entity_type,
      operation: task.operation
    });

    try {
      switch (task.operation) {
        case 'delete':
          await this.handleDelete(task);
          break;
        case 'insert':
        case 'update':
          await this.handleIndexOrUpdate(task);
          break;
      }

      // Mark task as completed
      await this.markTaskComplete(task.id, true);
    } catch (error) {
      this.logger.error('Task processing failed', {
        taskId: task.id,
        error
      });
      
      // Mark task as failed
      await this.markTaskComplete(
        task.id, 
        false, 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Handle delete action
   */
  private async handleDelete(task: IndexingTask): Promise<void> {
    switch (task.entity_type) {
      case 'block':
        await pageContentIndexerService.removeBlockIndex(task.entity_id);
        break;
      
      case 'database':
        // Remove all documents related to this database
        const { error } = await this.supabase
          .from('documents')
          .delete()
          .eq('metadata->>storage_path', `database:${task.entity_id}`);
        
        if (error) {
          throw new Error(`Failed to delete database documents: ${error.message}`);
        }
        break;
      
      case 'page':
        // Remove all documents related to this page
        const { error: pageError } = await this.supabase
          .from('documents')
          .delete()
          .eq('metadata->>page_id', task.entity_id);
        
        if (pageError) {
          throw new Error(`Failed to delete page documents: ${pageError.message}`);
        }
        break;
    }
  }

  /**
   * Handle index or update action
   */
  private async handleIndexOrUpdate(task: IndexingTask): Promise<void> {
    switch (task.entity_type) {
      case 'block':
        // Get block data
        const { data: block } = await this.supabase
          .from('blocks')
          .select('*')
          .eq('id', task.entity_id)
          .single();
        
        if (block) {
          await pageContentIndexerService.indexBlock(
            block,
            task.workspace_id,
            block.page_id
          );
        }
        break;
      
      case 'database':
        await pageContentIndexerService.indexDatabaseBlock(
          task.entity_id,
          task.workspace_id
        );
        break;
      
      case 'page':
        await pageContentIndexerService.indexPage(
          task.entity_id,
          task.workspace_id
        );
        break;
      
      case 'row':
        // Rows trigger database reindex
        // The trigger should have queued a database update instead
        this.logger.info('Row update handled via database reindex');
        break;
    }
  }

  /**
   * Mark a task as completed or failed
   */
  private async markTaskComplete(
    taskId: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .rpc('complete_indexing_task', {
        p_task_id: taskId,
        p_success: success,
        p_error_message: errorMessage
      });

    if (error) {
      this.logger.error('Failed to mark task complete', {
        taskId,
        error
      });
    }
  }

  /**
   * Clean up old completed tasks
   */
  async cleanupOldTasks(): Promise<void> {
    this.logger.info('Cleaning up old indexing tasks');

    const { error } = await this.supabase
      .rpc('cleanup_indexing_queue');

    if (error) {
      this.logger.error('Cleanup failed', error);
    } else {
      this.logger.info('Cleanup completed');
    }
  }
}

// Create singleton instance
export const indexingQueueWorker = new IndexingQueueWorker();

// Auto-start in development
if (process.env.NODE_ENV === 'development') {
  indexingQueueWorker.start(5000); // Process every 5 seconds
  
  // Cleanup old tasks daily
  setInterval(() => {
    indexingQueueWorker.cleanupOldTasks();
  }, 24 * 60 * 60 * 1000);
}