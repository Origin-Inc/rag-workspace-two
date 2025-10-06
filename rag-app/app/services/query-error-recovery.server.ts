/**
 * Query Error Recovery Service
 *
 * Classifies errors and provides recovery suggestions for failed queries.
 * Implements retry logic and fallback mechanisms for natural language queries.
 *
 * Related: Task #54.5 (API Endpoint and Error Recovery System)
 */

import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('query-error-recovery');

export type ErrorCategory =
  | 'syntax_error'
  | 'schema_error'
  | 'validation_error'
  | 'execution_error'
  | 'timeout_error'
  | 'resource_error'
  | 'authentication_error'
  | 'unknown_error';

export interface ClassifiedError {
  category: ErrorCategory;
  originalError: string;
  userMessage: string;
  suggestions: string[];
  isRecoverable: boolean;
  retryable: boolean;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
};

export class QueryErrorRecovery {
  /**
   * Classify error and provide recovery suggestions
   */
  static classifyError(error: Error | string): ClassifiedError {
    const errorMessage = error instanceof Error ? error.message : error;
    const lowerError = errorMessage.toLowerCase();

    // SQL Syntax Errors
    if (lowerError.includes('syntax error') || lowerError.includes('parse error')) {
      return {
        category: 'syntax_error',
        originalError: errorMessage,
        userMessage: 'The generated SQL query has a syntax error.',
        suggestions: [
          'Try rephrasing your question more clearly',
          'Break down complex questions into simpler parts',
          'Check if you\'re referencing the correct table and column names'
        ],
        isRecoverable: true,
        retryable: true
      };
    }

    // Schema Errors (table/column not found)
    if (lowerError.includes('does not exist') ||
        lowerError.includes('not found') ||
        lowerError.includes('unknown column') ||
        lowerError.includes('unknown table')) {

      // Extract table/column name if possible
      const tableMatch = errorMessage.match(/table[:\s]+['"]?(\w+)['"]?/i);
      const columnMatch = errorMessage.match(/column[:\s]+['"]?(\w+)['"]?/i);

      const missingItem = tableMatch ? `table "${tableMatch[1]}"` :
                         columnMatch ? `column "${columnMatch[1]}"` : 'a table or column';

      return {
        category: 'schema_error',
        originalError: errorMessage,
        userMessage: `The query references ${missingItem} that doesn't exist in your uploaded data.`,
        suggestions: [
          'Check the spelling of table and column names',
          'Verify you\'ve uploaded the correct file',
          'Use the actual column names from your data',
          'Try asking "What data is available?" first'
        ],
        isRecoverable: true,
        retryable: true
      };
    }

    // Validation Errors (destructive operations, SQL injection)
    if (lowerError.includes('destructive') ||
        lowerError.includes('not allowed') ||
        lowerError.includes('forbidden') ||
        lowerError.includes('injection')) {
      return {
        category: 'validation_error',
        originalError: errorMessage,
        userMessage: 'The query was blocked for security reasons.',
        suggestions: [
          'Only SELECT queries are allowed',
          'Avoid using special SQL keywords',
          'Rephrase your question in plain language'
        ],
        isRecoverable: true,
        retryable: true
      };
    }

    // Execution Errors (runtime errors during query)
    if (lowerError.includes('execution failed') ||
        lowerError.includes('runtime error') ||
        lowerError.includes('type mismatch') ||
        lowerError.includes('division by zero')) {
      return {
        category: 'execution_error',
        originalError: errorMessage,
        userMessage: 'An error occurred while running the query on your data.',
        suggestions: [
          'Check if your data has the expected format',
          'Try filtering for specific rows first',
          'Simplify your question'
        ],
        isRecoverable: true,
        retryable: false
      };
    }

    // Timeout Errors
    if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
      return {
        category: 'timeout_error',
        originalError: errorMessage,
        userMessage: 'The query took too long to complete.',
        suggestions: [
          'Try adding filters to reduce the amount of data processed',
          'Break the query into smaller parts',
          'Add a LIMIT clause to restrict results'
        ],
        isRecoverable: true,
        retryable: true
      };
    }

    // Resource Errors (memory, connection limits)
    if (lowerError.includes('out of memory') ||
        lowerError.includes('resource limit') ||
        lowerError.includes('connection') ||
        lowerError.includes('too large')) {
      return {
        category: 'resource_error',
        originalError: errorMessage,
        userMessage: 'The query requires more resources than available.',
        suggestions: [
          'Try processing a smaller subset of data',
          'Use aggregations instead of selecting all rows',
          'Filter the data before analyzing'
        ],
        isRecoverable: true,
        retryable: false
      };
    }

    // Authentication Errors
    if (lowerError.includes('unauthorized') ||
        lowerError.includes('authentication') ||
        lowerError.includes('not authenticated')) {
      return {
        category: 'authentication_error',
        originalError: errorMessage,
        userMessage: 'Authentication required.',
        suggestions: [
          'Please log in to continue',
          'Your session may have expired'
        ],
        isRecoverable: false,
        retryable: false
      };
    }

    // Unknown/Generic Errors
    return {
      category: 'unknown_error',
      originalError: errorMessage,
      userMessage: 'An unexpected error occurred while processing your query.',
      suggestions: [
        'Try rephrasing your question',
        'Check if your data is properly loaded',
        'Contact support if the problem persists'
      ],
      isRecoverable: false,
      retryable: false
    };
  }

  /**
   * Execute function with retry logic and exponential backoff
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    onRetry?: (attempt: number, error: Error) => void
  ): Promise<T> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if this is the last attempt
        if (attempt === retryConfig.maxRetries) {
          break;
        }

        // Check if error is retryable
        const classified = this.classifyError(lastError);
        if (!classified.retryable) {
          logger.trace('[withRetry] Error not retryable, stopping', {
            category: classified.category,
            attempt
          });
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt),
          retryConfig.maxDelay
        );

        logger.trace('[withRetry] Retrying after delay', {
          attempt: attempt + 1,
          maxRetries: retryConfig.maxRetries,
          delay,
          error: lastError.message
        });

        // Call retry callback if provided
        if (onRetry) {
          onRetry(attempt + 1, lastError);
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Generate user-friendly error response
   */
  static generateErrorResponse(error: Error | string): {
    content: string;
    metadata: {
      error: string;
      category: ErrorCategory;
      suggestions: string[];
      timestamp: string;
    };
  } {
    const classified = this.classifyError(error);

    const content = `**${classified.userMessage}**

${classified.suggestions.length > 0 ? '**Suggestions:**\n' + classified.suggestions.map(s => `• ${s}`).join('\n') : ''}

${process.env.NODE_ENV === 'development' ? `\n_Error details: ${classified.originalError}_` : ''}`;

    return {
      content,
      metadata: {
        error: classified.originalError,
        category: classified.category,
        suggestions: classified.suggestions,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Suggest query corrections based on error
   */
  static suggestCorrections(
    originalQuery: string,
    error: Error | string,
    availableTables?: string[],
    availableColumns?: Record<string, string[]>
  ): string[] {
    const classified = this.classifyError(error);
    const corrections: string[] = [];

    // For schema errors, suggest similar table/column names
    if (classified.category === 'schema_error' && availableTables) {
      const lowerQuery = originalQuery.toLowerCase();

      // Find mentioned tables that don't exist
      for (const table of availableTables) {
        if (!lowerQuery.includes(table.toLowerCase())) {
          corrections.push(`Try using the "${table}" table instead`);
        }
      }
    }

    // For syntax errors, suggest simplification
    if (classified.category === 'syntax_error') {
      if (originalQuery.length > 100) {
        corrections.push('Try breaking your question into smaller, simpler parts');
      }
      if (originalQuery.includes('?')) {
        corrections.push('Remove question marks and use declarative statements');
      }
    }

    return corrections.slice(0, 3); // Limit to top 3 corrections
  }

  /**
   * Check if error indicates a temporary failure
   */
  static isTransientError(error: Error | string): boolean {
    const classified = this.classifyError(error);
    return ['timeout_error', 'resource_error'].includes(classified.category);
  }

  /**
   * Log error for monitoring and analytics
   */
  static logError(
    error: Error | string,
    context: {
      query?: string;
      userId?: string;
      requestId?: string;
      [key: string]: any;
    }
  ): void {
    const classified = this.classifyError(error);

    logger.error('[QueryError]', {
      category: classified.category,
      isRecoverable: classified.isRecoverable,
      retryable: classified.retryable,
      ...context,
      error: classified.originalError
    });
  }
}
