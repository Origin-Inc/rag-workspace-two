import { prisma } from '~/utils/db.server';

export interface HealthCheckResult {
  database: boolean;
  redis: boolean;
  supabase: boolean;
  errors: string[];
}

/**
 * Performs health checks on all critical services
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const errors: string[] = [];
  let database = false;
  let redis = false;
  let supabase = false;

  // Check database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch (error) {
    errors.push(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Database health check failed:', error);
  }

  // Check Redis connection
  try {
    const { redis: redisClient } = await import('~/utils/redis.server');
    await redisClient.ping();
    redis = true;
  } catch (error) {
    errors.push(`Redis connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Redis health check failed:', error);
  }

  // Check Supabase configuration
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('Supabase environment variables not configured');
    }
    supabase = true;
  } catch (error) {
    errors.push(`Supabase configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Supabase health check failed:', error);
  }

  return {
    database,
    redis,
    supabase,
    errors
  };
}

/**
 * Check if the application is properly initialized
 */
export async function checkInitialization(): Promise<{ 
  isReady: boolean; 
  message?: string;
  details?: HealthCheckResult;
}> {
  try {
    // Quick database check
    await prisma.$queryRaw`SELECT 1`;
    
    // Check if essential tables exist
    const tableCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `;
    
    if (!tableCheck[0]?.exists) {
      return {
        isReady: false,
        message: 'Database schema not initialized. Please run migrations.'
      };
    }

    // Check for pgvector extension
    const vectorCheck = await prisma.$queryRaw<Array<{ installed: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) as installed
    `;

    if (!vectorCheck[0]?.installed) {
      console.warn('pgvector extension not installed. Some features may not work.');
    }

    return { isReady: true };
  } catch (error) {
    console.error('Initialization check failed:', error);
    
    // Perform detailed health check
    const health = await performHealthCheck();
    
    return {
      isReady: false,
      message: 'Application initialization failed. Please check the deployment configuration.',
      details: health
    };
  }
}