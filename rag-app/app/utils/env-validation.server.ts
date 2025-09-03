import { z } from 'zod';

/**
 * Environment variable validation schema
 * Validates all required environment variables at startup
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  
  // Redis
  REDIS_URL: z.string().url().startsWith('redis'),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().regex(/^\d+$/).optional(),
  REDIS_PASSWORD: z.string().optional(),
  
  // OpenAI
  OPENAI_API_KEY: z.string().startsWith('sk-').optional(),
  OPENAI_ORGANIZATION: z.string().optional(),
  
  // Security
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('7d'),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().regex(/^\d+$/).default('3000'),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().url().default('http://localhost:3001'),
  WS_URL: z.string().url().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).default('100'),
  
  // File Upload
  MAX_FILE_SIZE: z.string().regex(/^\d+$/).default('10485760'),
  ALLOWED_FILE_TYPES: z.string().default('pdf,txt,md,json,csv'),
  
  // Vector Database
  VECTOR_DIMENSIONS: z.string().regex(/^\d+$/).default('1536'),
  SIMILARITY_THRESHOLD: z.string().regex(/^0?\.\d+$/).default('0.7'),
  
  // Queue Configuration
  QUEUE_CONCURRENCY: z.string().regex(/^\d+$/).default('5'),
  QUEUE_MAX_JOBS: z.string().regex(/^\d+$/).default('100'),
  
  // Feature Flags
  ENABLE_INDEXING_WORKER: z.string().transform(val => val === 'true').default('false'),
  
  // Monitoring (Optional)
  SENTRY_DSN: z.string().url().optional(),
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables and returns typed env object
 * Throws an error if validation fails with details about missing/invalid variables
 */
export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors.filter(e => e.code === 'invalid_type' && e.received === 'undefined');
      const invalid = error.errors.filter(e => e.code !== 'invalid_type' || e.received !== 'undefined');
      
      let message = '❌ Environment validation failed:\n';
      
      if (missing.length > 0) {
        message += '\n🔴 Missing required variables:\n';
        missing.forEach(e => {
          message += `  - ${e.path.join('.')}\n`;
        });
      }
      
      if (invalid.length > 0) {
        message += '\n🔴 Invalid variables:\n';
        invalid.forEach(e => {
          message += `  - ${e.path.join('.')}: ${e.message}\n`;
        });
      }
      
      message += '\n💡 Check your .env file and ensure all required variables are set correctly.';
      message += '\n📖 See .env.example for the required format.';
      
      throw new Error(message);
    }
    throw error;
  }
}

/**
 * Get validated environment variables
 * Caches the result after first validation
 */
let cachedEnv: Env | undefined;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return getEnv().NODE_ENV === 'test';
}

/**
 * Get database connection string with proper pooling for production
 */
export function getDatabaseUrl(): string {
  const env = getEnv();
  const url = env.DATABASE_URL;
  
  // Ensure production uses connection pooling
  if (isProduction() && !url.includes('pgbouncer=true')) {
    console.warn('⚠️  Production database URL should include pgbouncer=true for connection pooling');
  }
  
  return url;
}

/**
 * Get Redis configuration
 */
export function getRedisConfig() {
  const env = getEnv();
  
  // Prefer REDIS_URL if available
  if (env.REDIS_URL) {
    return { url: env.REDIS_URL };
  }
  
  // Fall back to individual settings
  if (env.REDIS_HOST) {
    return {
      host: env.REDIS_HOST,
      port: parseInt(env.REDIS_PORT || '6379'),
      password: env.REDIS_PASSWORD,
    };
  }
  
  throw new Error('Redis configuration not found. Set either REDIS_URL or REDIS_HOST/PORT/PASSWORD');
}

/**
 * Validate environment on server startup
 * Call this in your entry point to catch configuration issues early
 */
export function validateEnvironmentOnStartup() {
  console.log('🔍 Validating environment variables...');
  
  try {
    const env = validateEnv();
    
    // Warnings for production
    if (isProduction()) {
      if (!env.OPENAI_API_KEY) {
        console.warn('⚠️  OPENAI_API_KEY not set - AI features will be disabled');
      }
      
      if (!env.CRON_SECRET) {
        console.warn('⚠️  CRON_SECRET not set - cron endpoints may be unprotected');
      }
      
      if (!env.ENCRYPTION_SECRET) {
        console.warn('⚠️  ENCRYPTION_SECRET not set - sensitive data encryption disabled');
      }
      
      if (!env.SENTRY_DSN) {
        console.warn('⚠️  SENTRY_DSN not set - error tracking disabled');
      }
      
      if (env.JWT_SECRET.length < 32) {
        console.error('❌ JWT_SECRET must be at least 32 characters for production');
        process.exit(1);
      }
      
      if (env.SESSION_SECRET === env.JWT_SECRET) {
        console.error('❌ SESSION_SECRET and JWT_SECRET must be different');
        process.exit(1);
      }
    }
    
    console.log('✅ Environment validation successful');
    console.log(`📍 Running in ${env.NODE_ENV} mode`);
    console.log(`🌐 App URL: ${env.APP_URL}`);
    
    return env;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Environment validation failed');
    process.exit(1);
  }
}