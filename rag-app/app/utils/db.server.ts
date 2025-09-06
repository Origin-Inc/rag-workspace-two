import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __db__: PrismaClient | undefined;
}

// Production-ready Prisma configuration with proper connection pooling
function createPrismaClient() {
  // For Vercel/Supabase, we need to handle the connection string properly
  let databaseUrl = process.env.DATABASE_URL || '';
  
  // If using Supabase pooler, ensure proper format and statement caching disabled
  if (databaseUrl.includes('pooler.supabase.com')) {
    // Parse the URL to modify query params
    const url = new URL(databaseUrl);
    // Ensure pgbouncer mode and disable statement caching to prevent prepared statement errors
    url.searchParams.set('pgbouncer', 'true');
    url.searchParams.set('statement_cache_size', '0');
    url.searchParams.set('prepare', 'false');
    // Use connection limit from URL or default to 50 for production
    // The connection_limit should already be set in DATABASE_URL env var
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '50');
    }
    // Increase pool timeout to prevent P2024 errors during heavy indexing
    url.searchParams.set('pool_timeout', '30'); // 30 seconds instead of default 10
    url.searchParams.set('connect_timeout', '30'); // 30 seconds connection timeout
    databaseUrl = url.toString();
  }

  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  // Monkey patch the client to handle prepared statement errors
  const originalTransaction = client.$transaction.bind(client);
  client.$transaction = async (...args: any[]) => {
    try {
      return await originalTransaction(...args);
    } catch (error: any) {
      // If we get a prepared statement error, retry once
      if (error?.message?.includes('prepared statement') || error?.code === '42P05') {
        console.warn('Prepared statement error detected, retrying transaction...');
        await client.$disconnect();
        await client.$connect();
        return await originalTransaction(...args);
      }
      throw error;
    }
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

export { prisma };