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
  
  // If using Supabase pooler, ensure proper format
  if (databaseUrl.includes('pooler.supabase.com')) {
    // Remove any existing query params that might conflict
    const [baseUrl] = databaseUrl.split('?');
    // For pooled connections, we don't add pgbouncer=true as it's handled by the pooler
    databaseUrl = baseUrl;
  }

  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

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

export { prisma };