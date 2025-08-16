// Task 19.3: Supabase Realtime subscription service for instant indexing updates
import { createSupabaseAdmin } from '~/utils/supabase.server';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { DebugLogger } from '~/utils/debug-logger';

interface IndexingTask {
  id: string;
  entity_type: string;
  entity_id: string;
  workspace_id: string;
  operation: 'insert' | 'update' | 'delete';
  priority: number;
  metadata?: Record<string, any>;
}

interface IndexingBuffer {
  task: IndexingTask;
  timestamp: number;
  attempts: number;
}

export class RealtimeIndexer {
  private channel: RealtimeChannel | null = null;
  private indexingBuffer: Map<string, IndexingBuffer> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly logger = new DebugLogger('RealtimeIndexer');
  private readonly supabase = createSupabaseAdmin();
  
  // Configuration
  private readonly DEBOUNCE_DELAY = 500; // 500ms debounce
  private readonly MAX_BUFFER_SIZE = 1000;
  private readonly BATCH_SIZE = 100;
  private readonly MAX_CONCURRENT = 5;

  /**
   * Initialize the realtime subscription
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Realtime Indexer');
    
    try {
      // Subscribe to indexing queue changes
      this.channel = this.supabase
        .channel('indexing-updates')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'indexing_queue',
            filter: 'status=eq.pending'
          },
          (payload) => this.handleIndexingEvent(payload as RealtimePostgresChangesPayload<IndexingTask>)
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'indexing_queue',
            filter: 'status=eq.pending'
          },
          (payload) => this.handleIndexingEvent(payload as RealtimePostgresChangesPayload<IndexingTask>)
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.logger.info('Successfully subscribed to indexing queue changes');
          } else if (status === 'CHANNEL_ERROR') {
            this.logger.error('Failed to subscribe to indexing queue changes');
            // Retry subscription after delay
            setTimeout(() => this.initialize(), 5000);
          }
        });

      // Also listen for direct pg_notify events
      await this.setupPgNotifyListener();
      
    } catch (error) {
      this.logger.error('Failed to initialize Realtime Indexer', error);
      throw error;
    }
  }

  /**
   * Set up PostgreSQL NOTIFY listener
   */
  private async setupPgNotifyListener(): Promise<void> {
    // Subscribe to pg_notify channel for indexing updates
    const notifyChannel = this.supabase
      .channel('indexing-notify')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'indexing_queue'
        },
        (payload: any) => {
          this.logger.debug('Received pg_notify event', payload);
          // Handle the notification
          if (payload.new && payload.new.status === 'pending') {
            this.handleIndexingEvent(payload);
          }
        }
      )
      .subscribe();
  }

  /**
   * Handle incoming indexing event
   */
  private handleIndexingEvent(payload: RealtimePostgresChangesPayload<IndexingTask>): void {
    const task = payload.new as IndexingTask;
    
    if (!task || !task.id) {
      this.logger.warn('Received invalid indexing event', payload);
      return;
    }

    this.logger.debug('Received indexing event', {
      id: task.id,
      entity_type: task.entity_type,
      operation: task.operation,
      priority: task.priority
    });

    // Add to buffer with deduplication
    const bufferKey = `${task.entity_type}:${task.entity_id}:${task.operation}`;
    
    // Check if we already have this task buffered
    const existing = this.indexingBuffer.get(bufferKey);
    if (existing) {
      // Update priority if new task has higher priority
      if (task.priority > existing.task.priority) {
        existing.task.priority = task.priority;
      }
      existing.timestamp = Date.now();
      existing.attempts = 0;
    } else {
      // Add new task to buffer
      this.indexingBuffer.set(bufferKey, {
        task,
        timestamp: Date.now(),
        attempts: 0
      });
    }

    // Check buffer size limit
    if (this.indexingBuffer.size > this.MAX_BUFFER_SIZE) {
      this.logger.warn('Buffer size exceeded, triggering immediate processing');
      this.processBatch();
    } else {
      // Schedule batch processing with debounce
      this.scheduleBatchProcessing();
    }
  }

  /**
   * Schedule batch processing with debouncing
   */
  private scheduleBatchProcessing(): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.processBatch();
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * Process buffered tasks in batch
   */
  async processBatch(): Promise<void> {
    if (this.isProcessing || this.indexingBuffer.size === 0) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      this.logger.info('Processing batch', { 
        bufferSize: this.indexingBuffer.size 
      });

      // Get tasks sorted by priority
      const tasks = Array.from(this.indexingBuffer.values())
        .sort((a, b) => b.task.priority - a.task.priority)
        .slice(0, this.BATCH_SIZE)
        .map(item => item.task);

      if (tasks.length === 0) {
        return;
      }

      // Group tasks by entity type for efficient processing
      const grouped = this.groupTasksByType(tasks);

      // Process each group in parallel with concurrency limit
      const results = await Promise.allSettled(
        Object.entries(grouped).map(([entityType, entityTasks]) =>
          this.processEntityBatch(entityType, entityTasks)
        )
      );

      // Remove successfully processed tasks from buffer
      let successCount = 0;
      let failureCount = 0;

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const [entityType, entityTasks] = Object.entries(grouped)[index];
          entityTasks.forEach(task => {
            const key = `${task.entity_type}:${task.entity_id}:${task.operation}`;
            this.indexingBuffer.delete(key);
            successCount++;
          });
        } else {
          failureCount++;
          this.logger.error('Batch processing failed', result.reason);
        }
      });

      const processingTime = Date.now() - startTime;
      this.logger.info('Batch processing completed', {
        successCount,
        failureCount,
        processingTime,
        remainingBuffer: this.indexingBuffer.size
      });

      // If there are remaining tasks, schedule another batch
      if (this.indexingBuffer.size > 0) {
        setTimeout(() => this.processBatch(), 100);
      }

    } catch (error) {
      this.logger.error('Batch processing failed', error);
    } finally {
      this.isProcessing = false;
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
  ): Promise<void> {
    this.logger.debug('Processing entity batch', {
      entityType,
      count: tasks.length
    });

    // This will be implemented in Task 19.6
    // For now, just mark tasks as processing
    const taskIds = tasks.map(t => t.id);
    
    // Update tasks to processing status
    const { error } = await this.supabase
      .from('indexing_queue')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .in('id', taskIds);

    if (error) {
      throw new Error(`Failed to update task status: ${error.message}`);
    }

    // Simulate processing (will be replaced with actual indexing)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Mark as completed (temporary - will be replaced)
    await this.supabase
      .from('indexing_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .in('id', taskIds);
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Realtime Indexer');

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Process remaining buffer
    if (this.indexingBuffer.size > 0) {
      this.logger.info('Processing remaining buffer before shutdown');
      await this.processBatch();
    }

    // Unsubscribe from channels
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.logger.info('Realtime Indexer shutdown complete');
  }

  /**
   * Get current buffer status
   */
  getStatus(): {
    bufferSize: number;
    isProcessing: boolean;
    oldestTask: number | null;
  } {
    let oldestTask: number | null = null;
    
    if (this.indexingBuffer.size > 0) {
      oldestTask = Math.min(
        ...Array.from(this.indexingBuffer.values()).map(item => item.timestamp)
      );
    }

    return {
      bufferSize: this.indexingBuffer.size,
      isProcessing: this.isProcessing,
      oldestTask
    };
  }

  /**
   * Force immediate processing
   */
  async forceProcess(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.processBatch();
  }
}

// Create singleton instance
export const realtimeIndexer = new RealtimeIndexer();

// Auto-initialize in development
if (process.env.NODE_ENV === 'development') {
  // Wait a bit for the server to be ready
  setTimeout(() => {
    realtimeIndexer.initialize().catch(error => {
      console.error('Failed to initialize Realtime Indexer:', error);
    });
  }, 3000);
}

// Cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    await realtimeIndexer.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await realtimeIndexer.shutdown();
    process.exit(0);
  });
}