import { prisma } from './db.server';
import { DebugLogger } from './debug-logger';

const logger = new DebugLogger('DBVector');

let searchPathSet = false;

/**
 * Ensures the search path includes the extensions schema for pgvector
 * This is required because pgvector is installed in the extensions schema on Supabase
 */
export async function ensureVectorSearchPath(): Promise<void> {
  if (searchPathSet) {
    return; // Already set for this connection
  }
  
  try {
    // Set search path to include extensions schema
    await prisma.$executeRaw`SET search_path TO public, extensions`;
    searchPathSet = true;
    logger.trace('Search path set to include extensions schema');
  } catch (error) {
    logger.error('Failed to set search path', error);
    // Try alternative approach - this might work on some configurations
    try {
      await prisma.$executeRaw`ALTER DATABASE postgres SET search_path TO public, extensions`;
      searchPathSet = true;
      logger.trace('Search path set via ALTER DATABASE');
    } catch (altError) {
      logger.error('Alternative search path setting also failed', altError);
    }
  }
}

/**
 * Wrapper for vector queries that ensures search path is set
 */
export async function queryWithVector<T>(
  queryFn: () => Promise<T>
): Promise<T> {
  await ensureVectorSearchPath();
  return queryFn();
}

/**
 * Execute raw query with vector support
 */
export async function executeVectorQuery<T>(
  query: TemplateStringsArray | string,
  ...values: any[]
): Promise<T> {
  await ensureVectorSearchPath();
  
  if (typeof query === 'string') {
    return prisma.$queryRawUnsafe<T>(query, ...values);
  } else {
    return prisma.$queryRaw<T>(query, ...values);
  }
}

/**
 * Helper to format embedding array for SQL
 */
export function formatEmbeddingForSQL(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}