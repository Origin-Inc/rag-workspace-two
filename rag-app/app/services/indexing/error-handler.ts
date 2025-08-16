// Task 19.11: Error handling and retry mechanisms for indexing pipeline
import { createSupabaseAdmin } from '~/utils/supabase.server';
import { DebugLogger } from '~/utils/debug-logger';
import { EventEmitter } from 'events';

interface RetryPolicy {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

interface ErrorContext {
  taskId: string;
  entityType: string;
  entityId: string;
  operation: string;
  error: Error;
  timestamp: Date;
  retryCount: number;
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: Date | null;
  successCount: number;
  lastStateChange: Date;
}

export class IndexingErrorHandler extends EventEmitter {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('IndexingErrorHandler');
  
  // Retry policies by error type
  private readonly retryPolicies: Map<string, RetryPolicy> = new Map([
    ['network', {
      maxRetries: 5,
      initialDelay: 1000,
      maxDelay: 60000,
      backoffMultiplier: 2,
      jitterFactor: 0.2
    }],
    ['rate_limit', {
      maxRetries: 3,
      initialDelay: 5000,
      maxDelay: 120000,
      backoffMultiplier: 3,
      jitterFactor: 0.1
    }],
    ['database', {
      maxRetries: 3,
      initialDelay: 2000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0.3
    }],
    ['embedding', {
      maxRetries: 2,
      initialDelay: 3000,
      maxDelay: 15000,
      backoffMultiplier: 2,
      jitterFactor: 0.2
    }],
    ['default', {
      maxRetries: 2,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitterFactor: 0.2
    }]
  ]);
  
  // Circuit breakers for different services
  private readonly circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  
  // Error tracking
  private readonly errorHistory: ErrorContext[] = [];
  private readonly deadLetterQueue: ErrorContext[] = [];
  
  // Configuration
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
  private readonly HALF_OPEN_SUCCESS_THRESHOLD = 3;
  private readonly ERROR_HISTORY_LIMIT = 1000;
  private readonly DLQ_LIMIT = 500;

  constructor() {
    super();
    this.initializeCircuitBreakers();
    this.startErrorAnalysis();
  }

  /**
   * Initialize circuit breakers for different services
   */
  private initializeCircuitBreakers(): void {
    const services = ['database', 'embedding', 'storage', 'realtime'];
    
    for (const service of services) {
      this.circuitBreakers.set(service, {
        state: 'closed',
        failures: 0,
        lastFailure: null,
        successCount: 0,
        lastStateChange: new Date()
      });
    }
  }

  /**
   * Handle an indexing error with retry logic
   */
  async handleError(
    error: Error,
    context: Omit<ErrorContext, 'error' | 'timestamp' | 'retryCount'>
  ): Promise<boolean> {
    const errorContext: ErrorContext = {
      ...context,
      error,
      timestamp: new Date(),
      retryCount: 0
    };
    
    // Log the error
    this.logger.error('Indexing error occurred', {
      ...context,
      error: error.message,
      stack: error.stack
    });
    
    // Track error
    this.trackError(errorContext);
    
    // Determine error type
    const errorType = this.classifyError(error);
    
    // Check circuit breaker
    const service = this.getServiceFromError(errorType);
    if (this.isCircuitOpen(service)) {
      this.logger.warn('Circuit breaker is open', { service });
      await this.addToDeadLetterQueue(errorContext);
      return false;
    }
    
    // Get retry policy
    const policy = this.retryPolicies.get(errorType) || this.retryPolicies.get('default')!;
    
    // Attempt retry with exponential backoff
    return await this.retryWithBackoff(errorContext, policy);
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryWithBackoff(
    context: ErrorContext,
    policy: RetryPolicy
  ): Promise<boolean> {
    let retryCount = 0;
    let delay = policy.initialDelay;
    
    while (retryCount < policy.maxRetries) {
      retryCount++;
      
      // Add jitter to prevent thundering herd
      const jitter = delay * policy.jitterFactor * (Math.random() - 0.5);
      const actualDelay = Math.min(delay + jitter, policy.maxDelay);
      
      this.logger.info('Retrying operation', {
        taskId: context.taskId,
        retryCount,
        delay: actualDelay
      });
      
      // Wait before retry
      await this.sleep(actualDelay);
      
      try {
        // Update retry count in database
        await this.updateRetryCount(context.taskId, retryCount);
        
        // Emit retry event
        this.emit('retry_attempt', {
          ...context,
          retryCount,
          delay: actualDelay
        });
        
        // The actual retry will be handled by the caller
        // This returns true to signal retry should be attempted
        return true;
        
      } catch (retryError) {
        this.logger.error('Retry failed', {
          taskId: context.taskId,
          retryCount,
          error: retryError
        });
        
        // Update error context
        context.error = retryError as Error;
        context.retryCount = retryCount;
        
        // Update circuit breaker
        const service = this.getServiceFromError(this.classifyError(retryError as Error));
        this.recordFailure(service);
        
        // Increase delay for next retry
        delay = Math.min(delay * policy.backoffMultiplier, policy.maxDelay);
      }
    }
    
    // Max retries exceeded, add to DLQ
    await this.addToDeadLetterQueue(context);
    return false;
  }

  /**
   * Classify error type for appropriate retry policy
   */
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return 'network';
    }
    
    if (message.includes('rate limit') || message.includes('429') || message.includes('quota')) {
      return 'rate_limit';
    }
    
    if (message.includes('database') || message.includes('supabase') || message.includes('postgres')) {
      return 'database';
    }
    
    if (message.includes('embedding') || message.includes('openai') || message.includes('vector')) {
      return 'embedding';
    }
    
    return 'default';
  }

  /**
   * Get service name from error type
   */
  private getServiceFromError(errorType: string): string {
    const serviceMap: Record<string, string> = {
      'network': 'realtime',
      'rate_limit': 'embedding',
      'database': 'database',
      'embedding': 'embedding'
    };
    
    return serviceMap[errorType] || 'storage';
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitOpen(service: string): boolean {
    const breaker = this.circuitBreakers.get(service);
    if (!breaker) return false;
    
    if (breaker.state === 'open') {
      // Check if timeout has passed
      if (breaker.lastFailure && 
          Date.now() - breaker.lastFailure.getTime() > this.CIRCUIT_BREAKER_TIMEOUT) {
        // Move to half-open state
        this.transitionCircuitBreaker(service, 'half-open');
        return false;
      }
      return true;
    }
    
    return false;
  }

  /**
   * Record a failure for circuit breaker
   */
  private recordFailure(service: string): void {
    const breaker = this.circuitBreakers.get(service);
    if (!breaker) return;
    
    breaker.failures++;
    breaker.lastFailure = new Date();
    breaker.successCount = 0;
    
    if (breaker.state === 'closed' && breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this.transitionCircuitBreaker(service, 'open');
    } else if (breaker.state === 'half-open') {
      // Single failure in half-open state trips the breaker again
      this.transitionCircuitBreaker(service, 'open');
    }
  }

  /**
   * Record a success for circuit breaker
   */
  recordSuccess(service: string): void {
    const breaker = this.circuitBreakers.get(service);
    if (!breaker) return;
    
    breaker.successCount++;
    
    if (breaker.state === 'half-open' && 
        breaker.successCount >= this.HALF_OPEN_SUCCESS_THRESHOLD) {
      // Enough successes, close the circuit
      this.transitionCircuitBreaker(service, 'closed');
      breaker.failures = 0;
      breaker.successCount = 0;
    }
  }

  /**
   * Transition circuit breaker state
   */
  private transitionCircuitBreaker(
    service: string, 
    newState: 'closed' | 'open' | 'half-open'
  ): void {
    const breaker = this.circuitBreakers.get(service);
    if (!breaker) return;
    
    const oldState = breaker.state;
    breaker.state = newState;
    breaker.lastStateChange = new Date();
    
    this.logger.info('Circuit breaker state changed', {
      service,
      oldState,
      newState
    });
    
    this.emit('circuit_breaker_state_change', {
      service,
      oldState,
      newState,
      timestamp: new Date()
    });
  }

  /**
   * Track error in history
   */
  private trackError(context: ErrorContext): void {
    this.errorHistory.push(context);
    
    // Limit history size
    if (this.errorHistory.length > this.ERROR_HISTORY_LIMIT) {
      this.errorHistory.shift();
    }
    
    // Store in database for persistence
    this.storeErrorInDatabase(context).catch(err => {
      this.logger.error('Failed to store error in database', err);
    });
  }

  /**
   * Store error in database
   */
  private async storeErrorInDatabase(context: ErrorContext): Promise<void> {
    const { error: dbError } = await this.supabase
      .from('indexing_errors')
      .insert({
        task_id: context.taskId,
        entity_type: context.entityType,
        entity_id: context.entityId,
        operation: context.operation,
        error_message: context.error.message,
        error_stack: context.error.stack,
        retry_count: context.retryCount,
        occurred_at: context.timestamp
      });
    
    if (dbError) {
      // Don't throw, just log - we don't want error tracking to cause more errors
      this.logger.error('Failed to store error', dbError);
    }
  }

  /**
   * Add to dead letter queue
   */
  private async addToDeadLetterQueue(context: ErrorContext): Promise<void> {
    this.deadLetterQueue.push(context);
    
    // Limit DLQ size
    if (this.deadLetterQueue.length > this.DLQ_LIMIT) {
      this.deadLetterQueue.shift();
    }
    
    // Store in database
    const { error } = await this.supabase
      .from('indexing_dlq')
      .insert({
        task_id: context.taskId,
        entity_type: context.entityType,
        entity_id: context.entityId,
        operation: context.operation,
        error_message: context.error.message,
        error_stack: context.error.stack,
        retry_count: context.retryCount,
        added_at: new Date()
      });
    
    if (error) {
      this.logger.error('Failed to add to DLQ', error);
    }
    
    this.emit('dlq_addition', context);
  }

  /**
   * Update retry count in database
   */
  private async updateRetryCount(taskId: string, retryCount: number): Promise<void> {
    const { error } = await this.supabase
      .from('indexing_queue')
      .update({
        retry_count: retryCount,
        last_retry_at: new Date().toISOString()
      })
      .eq('id', taskId);
    
    if (error) {
      throw new Error(`Failed to update retry count: ${error.message}`);
    }
  }

  /**
   * Process dead letter queue items
   */
  async processDLQ(): Promise<void> {
    const items = [...this.deadLetterQueue];
    this.deadLetterQueue.length = 0;
    
    for (const item of items) {
      this.logger.info('Reprocessing DLQ item', {
        taskId: item.taskId,
        entityType: item.entityType
      });
      
      // Reset retry count and attempt reprocessing
      item.retryCount = 0;
      
      // Emit event for reprocessing
      this.emit('dlq_reprocess', item);
    }
  }

  /**
   * Start periodic error analysis
   */
  private startErrorAnalysis(): void {
    setInterval(() => {
      this.analyzeErrorPatterns();
    }, 60000); // Every minute
  }

  /**
   * Analyze error patterns for insights
   */
  private analyzeErrorPatterns(): void {
    if (this.errorHistory.length === 0) return;
    
    const now = Date.now();
    const recentErrors = this.errorHistory.filter(
      e => now - e.timestamp.getTime() < 300000 // Last 5 minutes
    );
    
    if (recentErrors.length === 0) return;
    
    // Group errors by type
    const errorGroups = new Map<string, number>();
    for (const error of recentErrors) {
      const type = this.classifyError(error.error);
      errorGroups.set(type, (errorGroups.get(type) || 0) + 1);
    }
    
    // Check for error spikes
    for (const [type, count] of errorGroups) {
      if (count > 10) {
        this.logger.warn('Error spike detected', {
          errorType: type,
          count,
          timeWindow: '5 minutes'
        });
        
        this.emit('error_spike', {
          errorType: type,
          count,
          timestamp: new Date()
        });
      }
    }
    
    // Calculate error rate
    const errorRate = recentErrors.length / 5; // Per minute
    if (errorRate > 5) {
      this.emit('high_error_rate', {
        rate: errorRate,
        timestamp: new Date()
      });
    }
  }

  /**
   * Get error statistics
   */
  getStatistics(): {
    totalErrors: number;
    recentErrors: number;
    dlqSize: number;
    circuitBreakers: Map<string, CircuitBreakerState>;
    errorsByType: Map<string, number>;
  } {
    const now = Date.now();
    const recentErrors = this.errorHistory.filter(
      e => now - e.timestamp.getTime() < 300000
    );
    
    const errorsByType = new Map<string, number>();
    for (const error of this.errorHistory) {
      const type = this.classifyError(error.error);
      errorsByType.set(type, (errorsByType.get(type) || 0) + 1);
    }
    
    return {
      totalErrors: this.errorHistory.length,
      recentErrors: recentErrors.length,
      dlqSize: this.deadLetterQueue.length,
      circuitBreakers: new Map(this.circuitBreakers),
      errorsByType
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(service: string): void {
    const breaker = this.circuitBreakers.get(service);
    if (breaker) {
      breaker.state = 'closed';
      breaker.failures = 0;
      breaker.successCount = 0;
      breaker.lastFailure = null;
      breaker.lastStateChange = new Date();
      
      this.logger.info('Circuit breaker reset', { service });
    }
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory.length = 0;
    this.deadLetterQueue.length = 0;
    
    this.logger.info('Error history cleared');
  }
}

// Create singleton instance
export const indexingErrorHandler = new IndexingErrorHandler();