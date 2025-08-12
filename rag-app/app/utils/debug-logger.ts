/**
 * Debug logger utility for comprehensive debugging
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export class DebugLogger {
  private context: string;
  private enabled: boolean;

  constructor(context: string, enabled: boolean = true) {
    this.context = context;
    this.enabled = enabled || process.env.NODE_ENV === 'development';
  }

  private log(level: LogLevel, message: string, data?: any) {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${this.context}]`;
    
    const color = {
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m', // Red
    }[level];
    
    const reset = '\x1b[0m';
    
    console.log(`${color}${prefix}${reset} ${message}`);
    
    if (data !== undefined) {
      // Deep log the data with proper formatting
      console.log(`${color}${prefix} Data:${reset}`, 
        typeof data === 'object' ? JSON.stringify(data, null, 2) : data
      );
    }
  }

  debug(message: string, data?: any) {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any) {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: any) {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, `${message}: ${error.message}`, {
        stack: error.stack,
        name: error.name,
        message: error.message,
      });
    } else {
      this.log(LogLevel.ERROR, message, error);
    }
  }

  // Special method for timing operations
  async timeOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();
    this.debug(`Starting operation: ${operationName}`);
    
    try {
      const result = await operation();
      const duration = (performance.now() - startTime).toFixed(2);
      this.info(`Operation completed: ${operationName} (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = (performance.now() - startTime).toFixed(2);
      this.error(`Operation failed: ${operationName} (${duration}ms)`, error);
      throw error;
    }
  }

  // Method to trace function calls
  trace(functionName: string, args: any[] = []) {
    this.debug(`Calling ${functionName}`, { arguments: args });
  }

  // Method to log SQL queries
  sql(query: string, params?: any[]) {
    this.debug('SQL Query', { query, params });
  }
}