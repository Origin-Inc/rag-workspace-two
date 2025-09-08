import { PrismaClient } from "@prisma/client";
import { 
  createPooledPrismaClient, 
  executeWithTransaction,
  getPoolingConfig,
  buildDatabaseUrl 
} from './db-pooling.server';

let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __db__: PrismaClient | undefined;
}

// Production-ready Prisma configuration with optimized connection pooling
function createPrismaClient() {
  // Use the new pooling configuration
  const poolingConfig = getPoolingConfig();
  const databaseUrl = buildDatabaseUrl(process.env.DATABASE_URL);
  
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  // Enhanced transaction handling for pooling modes
  const originalTransaction = client.$transaction.bind(client);
  client.$transaction = async (...args: any[]) => {
    const maxRetries = poolingConfig.port === 6543 ? 3 : 1; // More retries for transaction mode
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await originalTransaction(...args);
      } catch (error: any) {
        lastError = error;
        
        // Handle prepared statement errors (common in transaction mode)
        if (error?.message?.includes('prepared statement') || error?.code === '42P05') {
          console.warn(`Prepared statement error (attempt ${attempt}/${maxRetries})`);
          
          if (attempt < maxRetries) {
            await client.$disconnect();
            await new Promise(resolve => setTimeout(resolve, 100 * attempt));
            await client.$connect();
            continue;
          }
        }
        
        // Handle connection pool exhaustion
        if (error?.code === 'P2024' || error?.message?.includes('Too many connections')) {
          console.warn(`Connection pool exhausted (attempt ${attempt}/${maxRetries})`);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            continue;
          }
        }
        
        throw error;
      }
    }
    
    throw lastError;
  };

  return client;
}

// This is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
// In production, we'll have a single connection to the DB.
if (process.env.NODE_ENV === "production") {
  prisma = createPrismaClient();
} else {
  if (!global.__db__) {
    global.__db__ = createPrismaClient();
  }
  prisma = global.__db__;
  // Connect immediately in development and handle reconnection
  prisma.$connect().catch(async (e) => {
    console.error("Failed to connect to database, creating new client:", e);
    // If connection fails, create a new client
    global.__db__ = createPrismaClient();
    prisma = global.__db__;
    try {
      await prisma.$connect();
      console.log("Reconnected to database with new client");
    } catch (reconnectError) {
      console.error("Failed to reconnect:", reconnectError);
    }
  });
}

// Graceful shutdown
if (process.env.NODE_ENV === "production") {
  process.on("beforeExit", async () => {
    await prisma.$disconnect();
  });
}

// Helper function to execute queries with retry logic for prepared statement errors
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 1
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if this is a prepared statement error
      if (
        (error?.message?.includes('prepared statement') || 
         error?.code === '42P05' ||
         error?.meta?.code === '42P05') &&
        i < maxRetries
      ) {
        console.warn(`Prepared statement error, retrying (attempt ${i + 1}/${maxRetries})...`);
        // Force reconnection to clear prepared statements
        try {
          await prisma.$disconnect();
          await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
          await prisma.$connect();
        } catch (reconnectError) {
          console.error('Failed to reconnect:', reconnectError);
        }
        continue;
      }
      
      // Not a prepared statement error or max retries reached
      throw error;
    }
  }
  
  throw lastError;
}

// Export enhanced transaction wrapper for transaction mode compatibility
export { executeWithTransaction } from './db-pooling.server';

export { prisma };