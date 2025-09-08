import { PrismaClient } from "@prisma/client";
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('DatabasePooling');

// Database pooling configuration for serverless environments
export interface PoolingConfig {
  // Maximum connections per instance
  connectionLimit: number;
  // Pool timeout in seconds
  poolTimeout: number;
  // Connection timeout in seconds
  connectTimeout: number;
  // Statement cache size (0 for transaction mode)
  statementCacheSize: number;
  // Use PgBouncer transaction mode
  pgbouncer: boolean;
  // Database port (5432 for session, 6543 for transaction)
  port: number;
}

// Determine optimal pooling configuration based on environment
export function getPoolingConfig(): PoolingConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const isVercel = process.env.VERCEL === '1';
  const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined;
  const instanceCount = parseInt(process.env.INSTANCE_COUNT || '10', 10); // Default to 10 instances
  const maxPoolSize = parseInt(process.env.MAX_POOL_SIZE || '100', 10);
  
  // Check if DATABASE_URL is using transaction pooler (port 6543)
  const databaseUrl = process.env.DATABASE_URL || '';
  const isTransactionPooler = databaseUrl.includes(':6543');
  const isSessionPooler = databaseUrl.includes('pooler.supabase.com:5432');
  
  // For serverless, prefer transaction pooler
  const usePooler = isProduction && (isVercel || isRailway || process.env.USE_TRANSACTION_MODE === 'true');
  
  if (isTransactionPooler) {
    // Transaction pooler configuration (port 6543)
    // Does NOT support PREPARE statements outside transactions
    return {
      connectionLimit: 5, // Allow 5 connections for concurrent operations within requests
      poolTimeout: 20, // 20 seconds timeout for complex operations
      connectTimeout: 10, // 10 seconds max to connect
      statementCacheSize: 0, // No statement caching in transaction mode
      pgbouncer: true,
      port: 6543, // Transaction pooler port
    };
  } else if (usePooler || isSessionPooler) {
    // Session pooler configuration (port 5432 on pooler.supabase.com)
    const connectionLimit = Math.max(1, Math.floor(maxPoolSize / instanceCount));
    
    return {
      connectionLimit: Math.min(connectionLimit, 3), // Max 3 connections per instance
      poolTimeout: 10, // 10 seconds timeout
      connectTimeout: 10, // 10 seconds max to connect
      statementCacheSize: 0, // Minimal caching in pooler mode
      pgbouncer: true,
      port: 5432, // Session pooler uses standard port
    };
  } else {
    // Direct connection for development or traditional hosting
    return {
      connectionLimit: 10, // More connections allowed
      poolTimeout: 30, // 30 seconds timeout
      connectTimeout: 30, // 30 seconds to connect
      statementCacheSize: 100, // Enable statement caching
      pgbouncer: false,
      port: 5432, // Direct PostgreSQL port
    };
  }
}

// Build optimized DATABASE_URL based on pooling configuration
export function buildDatabaseUrl(baseUrl?: string): string {
  const config = getPoolingConfig();
  const url = new URL(baseUrl || process.env.DATABASE_URL || '');
  
  // Preserve the original port from DATABASE_URL
  // Supabase uses specific ports for different pooler modes:
  // - 6543 for transaction pooler
  // - 5432 for session pooler or direct connection
  const originalPort = url.port;
  
  // Set PgBouncer parameters based on port
  if (originalPort === '6543') {
    // Transaction pooler - balanced settings for Vercel
    url.searchParams.set('pgbouncer', 'true');
    url.searchParams.set('statement_cache_size', '0');
    url.searchParams.set('prepare', 'false');
    url.searchParams.set('connection_limit', config.connectionLimit.toString()); // Use config value
  } else if (url.hostname.includes('pooler.')) {
    // Session pooler
    url.searchParams.set('pgbouncer', 'true');
    url.searchParams.set('statement_cache_size', '0');
    url.searchParams.set('connection_limit', config.connectionLimit.toString());
  } else if (config.pgbouncer) {
    // Apply pgbouncer settings if configured
    url.searchParams.set('pgbouncer', 'true');
    url.searchParams.set('statement_cache_size', config.statementCacheSize.toString());
    url.searchParams.set('connection_limit', config.connectionLimit.toString());
  }
  
  // Set timeouts
  url.searchParams.set('pool_timeout', config.poolTimeout.toString());
  url.searchParams.set('connect_timeout', config.connectTimeout.toString());
  
  // Determine mode for logging
  const mode = originalPort === '6543' ? 'transaction-pooler' : 
               url.hostname.includes('pooler.') ? 'session-pooler' : 
               'direct';
  
  logger.info('Database URL configured', {
    mode,
    hostname: url.hostname,
    port: originalPort,
    connectionLimit: url.searchParams.get('connection_limit'),
    pgbouncer: url.searchParams.has('pgbouncer'),
  });
  
  return url.toString();
}

// Create Prisma client with optimized pooling
export function createPooledPrismaClient(): PrismaClient {
  const databaseUrl = buildDatabaseUrl();
  const config = getPoolingConfig();
  
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" 
      ? ["query", "error", "warn"] 
      : ["error"],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  
  // Add connection pool monitoring
  if (process.env.NODE_ENV === "production") {
    monitorConnectionPool(client);
  }
  
  // Wrap client methods to handle transaction mode limitations
  if (config.port === 6543) {
    wrapForTransactionMode(client);
  }
  
  return client;
}

// Monitor connection pool health
function monitorConnectionPool(client: PrismaClient) {
  let activeConnections = 0;
  let totalQueries = 0;
  let failedQueries = 0;
  
  // Track query metrics
  client.$use(async (params, next) => {
    activeConnections++;
    totalQueries++;
    
    const start = Date.now();
    try {
      const result = await next(params);
      const duration = Date.now() - start;
      
      // Log slow queries
      if (duration > 1000) {
        logger.warn('Slow query detected', {
          model: params.model,
          action: params.action,
          duration,
        });
      }
      
      return result;
    } catch (error) {
      failedQueries++;
      throw error;
    } finally {
      activeConnections--;
    }
  });
  
  // Periodic health check
  setInterval(() => {
    logger.info('Connection pool stats', {
      activeConnections,
      totalQueries,
      failedQueries,
      failureRate: totalQueries > 0 ? (failedQueries / totalQueries) * 100 : 0,
    });
  }, 60000); // Every minute
}

// Wrap Prisma client for transaction mode compatibility
function wrapForTransactionMode(client: PrismaClient) {
  const originalTransaction = client.$transaction.bind(client);
  
  // Enhanced transaction handling for transaction mode
  client.$transaction = async (...args: any[]) => {
    const maxRetries = 3;
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await originalTransaction(...args);
      } catch (error: any) {
        lastError = error;
        
        // Check for prepared statement errors
        if (
          error?.message?.includes('prepared statement') ||
          error?.code === '42P05' ||
          error?.code === '25P02' // In failed transaction
        ) {
          logger.warn(`Transaction failed (attempt ${attempt}/${maxRetries})`, {
            error: error.message,
            code: error.code,
          });
          
          if (attempt < maxRetries) {
            // Reconnect to clear state
            await client.$disconnect();
            await new Promise(resolve => setTimeout(resolve, 100 * attempt)); // Exponential backoff
            await client.$connect();
            continue;
          }
        }
        
        // Check for connection pool exhaustion
        if (
          error?.message?.includes('connection') ||
          error?.code === 'P2024' // Too many connections
        ) {
          logger.error('Connection pool exhausted', { error: error.message });
          
          if (attempt < maxRetries) {
            // Wait for connections to be released
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            continue;
          }
        }
        
        throw error;
      }
    }
    
    throw lastError;
  };
}

// Execute queries with transaction wrapping for prepared statements
export async function executeWithTransaction<T>(
  client: PrismaClient,
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  const config = getPoolingConfig();
  
  // In transaction mode, wrap all queries in transactions
  if (config.port === 6543) {
    return client.$transaction(
      async (tx) => {
        return fn(tx as PrismaClient);
      },
      {
        maxWait: 5000, // 5 seconds max wait
        timeout: 10000, // 10 seconds max transaction
        isolationLevel: 'ReadCommitted', // Optimal for most operations
      }
    );
  } else {
    // In session mode, execute directly
    return fn(client);
  }
}

// Connection pool statistics
export async function getPoolStats(client: PrismaClient): Promise<{
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  waitingClients: number;
  mode: string;
  port: number;
}> {
  try {
    // Try to get PgBouncer stats if available
    const pgbouncerStats = await client.$queryRaw<any[]>`
      SELECT 
        database,
        cl_active,
        cl_waiting,
        sv_active,
        sv_idle,
        sv_used,
        sv_tested,
        sv_login,
        maxwait
      FROM pgbouncer.stats
      WHERE database = current_database()
      LIMIT 1
    `.catch(() => null);
    
    if (pgbouncerStats && pgbouncerStats.length > 0) {
      const stats = pgbouncerStats[0];
      return {
        activeConnections: stats.sv_active || 0,
        idleConnections: stats.sv_idle || 0,
        totalConnections: (stats.sv_active || 0) + (stats.sv_idle || 0) + (stats.sv_used || 0),
        waitingClients: stats.cl_waiting || 0,
        mode: 'pgbouncer',
        port: getPoolingConfig().port,
      };
    }
    
    // Fallback to PostgreSQL stats
    const pgStats = await client.$queryRaw<any[]>`
      SELECT 
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) as total
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    
    const stats = pgStats[0];
    return {
      activeConnections: Number(stats.active) || 0,
      idleConnections: Number(stats.idle) || 0,
      totalConnections: Number(stats.total) || 0,
      waitingClients: 0,
      mode: 'direct',
      port: getPoolingConfig().port,
    };
  } catch (error) {
    logger.error('Failed to get pool stats', error);
    return {
      activeConnections: 0,
      idleConnections: 0,
      totalConnections: 0,
      waitingClients: 0,
      mode: 'unknown',
      port: getPoolingConfig().port,
    };
  }
}

// Validate database connection and pooling mode
export async function validatePoolingMode(client: PrismaClient): Promise<{
  isValid: boolean;
  mode: string;
  port: number;
  message: string;
}> {
  try {
    // Test basic connectivity
    await client.$queryRaw`SELECT 1`;
    
    const config = getPoolingConfig();
    
    // For Supabase pooler, we can't reliably check the port
    // Instead, check if we're using pgbouncer parameters
    const databaseUrl = process.env.DATABASE_URL || '';
    const isUsingPooler = databaseUrl.includes('pooler.') || databaseUrl.includes('pgbouncer=true');
    
    // Test if prepared statements work outside transactions
    // This helps determine if we're in pooler mode
    let isPgBouncer = false;
    try {
      // This should fail in PgBouncer transaction/statement mode
      await client.$queryRaw`PREPARE test_stmt AS SELECT 1`;
      await client.$queryRaw`DEALLOCATE test_stmt`;
      // If we get here, we're in session mode or direct connection
      isPgBouncer = false;
    } catch (error: any) {
      // If it fails with prepared statement error, we're using PgBouncer
      if (error?.message?.includes('prepared statement') || error?.code === '26000') {
        isPgBouncer = true;
      }
    }
    
    const mode = isPgBouncer ? 'pooled' : 'direct';
    
    return {
      isValid: true,
      mode,
      port: config.port,
      message: `Database connection valid (${mode} mode${isUsingPooler ? ' via pooler' : ''})`,
    };
  } catch (error) {
    logger.error('Failed to validate pooling mode', error);
    return {
      isValid: false,
      mode: 'unknown',
      port: 0,
      message: `Connection validation failed: ${error}`,
    };
  }
}