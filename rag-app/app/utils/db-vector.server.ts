import { prisma } from './db.server';
import { DebugLogger } from './debug-logger';

const logger = new DebugLogger('DBVector');

/**
 * Ensures the search path includes the extensions schema for pgvector
 * This is required because pgvector is installed in the extensions schema on Supabase
 * 
 * IMPORTANT: In serverless environments, this must be called before EVERY query
 * because connections are not persisted between function invocations
 */
export async function ensureVectorSearchPath(): Promise<void> {
  try {
    // Always set search path - no caching in serverless
    await prisma.$executeRaw`SET search_path TO public, extensions`;
    logger.trace('Search path set to include extensions schema');
  } catch (error) {
    logger.error('Failed to set search path', error);
    // Don't throw - let the actual query fail with a more specific error
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