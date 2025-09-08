import Redis from "ioredis";
import { redisFactory } from "./redis-factory.server";
import { DebugLogger } from "./debug-logger";

const logger = new DebugLogger('Redis');

let redis: Redis;
let redisWorker: Redis;
let initializationPromise: Promise<void> | null = null;

declare global {
  // eslint-disable-next-line no-var
  var __redis__: Redis;
  // eslint-disable-next-line no-var
  var __redisWorker__: Redis;
  // eslint-disable-next-line no-var
  var __redisInitialized__: boolean;
  // eslint-disable-next-line no-var
  var __redisInitPromise__: Promise<void> | null;
}

// Initialize Redis with factory pattern
async function initializeRedis() {
  if (global.__redisInitialized__) {
    logger.trace('Redis already initialized');
    return;
  }
  
  try {
    logger.info('Initializing Redis factory');
    await redisFactory.initialize();
    global.__redisInitialized__ = true;
    logger.info('Redis factory initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Redis factory:', error);
    
    // Only use explicitly configured REDIS_URL, never fall back to localhost
    const fallbackUrl = process.env["REDIS_URL"];
    
    if (!fallbackUrl) {
      logger.error('REDIS_URL environment variable is not set');
      // In production, throw error immediately if Redis is not configured
      if (process.env["NODE_ENV"] === "production") {
        throw new Error('Redis initialization failed: REDIS_URL not configured in production');
      }
      // In development, we can continue without Redis  
      logger.warn('Continuing without Redis in development mode');
      global.__redisInitialized__ = true;
      return;
    }
    
    logger.warn('Attempting direct Redis connection as fallback', {
      url: fallbackUrl.replace(/:[^:@]+@/, ':****@')
    });
    
    try {
      redis = new Redis(fallbackUrl, {
        retryStrategy: (times) => {
          if (times > 3) {
            logger.error('Redis connection failed after 3 retries');
            return null;
          }
          const delay = Math.min(times * 100, 2000);
          logger.warn(`Retrying Redis connection in ${delay}ms (attempt ${times})`);
          return delay;
        },
        connectTimeout: 10000,
        lazyConnect: false,
      });
      
      redisWorker = new Redis(fallbackUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        reconnectOnError: (err: Error) => err.message.includes("READONLY"),
        retryStrategy: (times) => Math.min(times * 100, 2000),
        connectTimeout: 10000,
      });
      
      // Wait for connections to be ready
      await redis.ping();
      await redisWorker.ping();
      
      logger.info('Direct Redis connection established successfully');
      global.__redisInitialized__ = true;
      return;
    } catch (fallbackError) {
      logger.error('Direct Redis connection failed:', fallbackError);
      throw new Error(`Redis initialization failed: ${fallbackError}`);
    }
  }
  
  // Get clients from factory
  const provider = redisFactory.getProvider();
  logger.info('Redis provider type:', { type: provider.type });
  
  if (provider.type === 'local' || provider.type === 'railway') {
    // For local/Railway Redis, use the actual ioredis clients
    redis = redisFactory.getClient() as Redis;
    redisWorker = redisFactory.getClient({ workerMode: true }) as Redis;
    logger.info('Using ioredis clients for Redis');
  } else if (provider.type === 'upstash') {
    // For managed services, create wrapper
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createWrapper = (provider: any): Redis => {
      const wrapper = Object.create(Redis.prototype);
      wrapper.get = provider.get.bind(provider);
      wrapper.set = provider.set.bind(provider);
      wrapper.del = provider.del.bind(provider);
      wrapper.exists = provider.exists.bind(provider);
      wrapper.expire = provider.expire.bind(provider);
      wrapper.ttl = provider.ttl.bind(provider);
      wrapper.flushdb = provider.flushdb.bind(provider);
      wrapper.info = provider.info.bind(provider);
      wrapper.ping = () => provider.isHealthy().then((healthy: boolean) => healthy ? 'PONG' : null);
      return wrapper as Redis;
    };
    
    redis = createWrapper(provider);
    redisWorker = redis; // Use same client for workers with Upstash
    logger.info('Using wrapper for Upstash Redis');
  } else {
    logger.warn('Unknown Redis provider type, using no-op provider');
    // For no-op provider, redis and redisWorker will remain undefined
    // This should be handled by calling code
  }
}

// Ensure Redis is initialized before use
async function ensureRedisInitialized(): Promise<void> {
  if (global.__redisInitialized__ && redis && redisWorker) {
    return;
  }
  
  // Use global promise to prevent multiple initialization attempts
  if (!initializationPromise) {
    if (global.__redisInitPromise__) {
      initializationPromise = global.__redisInitPromise__;
    } else {
      initializationPromise = initializeRedis().then(() => {
        if (process.env["NODE_ENV"] !== "production") {
          global.__redis__ = redis;
          global.__redisWorker__ = redisWorker;
        }
      });
      
      if (process.env["NODE_ENV"] !== "production") {
        global.__redisInitPromise__ = initializationPromise;
      }
    }
  }
  
  await initializationPromise;
}

// Initialize on module load
if (process.env["NODE_ENV"] === "production") {
  // In production, initialize immediately and wait for it
  // This ensures Redis is ready before any code tries to use it
  logger.info('Production mode: Initializing Redis synchronously');
  initializationPromise = ensureRedisInitialized();
  initializationPromise.catch((error) => {
    logger.error('Failed to initialize Redis in production:', error);
  });
} else {
  // Development mode with global caching
  if (global.__redis__ && global.__redisWorker__) {
    redis = global.__redis__;
    redisWorker = global.__redisWorker__;
    logger.trace('Using cached Redis clients from global');
  } else {
    // Initialize asynchronously
    ensureRedisInitialized().catch((error) => {
      logger.error('Failed to initialize Redis in development:', error);
    });
  }
}

// Export a function to ensure Redis is ready
export async function getRedis(): Promise<Redis> {
  await ensureRedisInitialized();
  if (!redis) {
    throw new Error('Redis client not available');
  }
  return redis;
}

export async function getRedisWorker(): Promise<Redis> {
  await ensureRedisInitialized();
  if (!redisWorker) {
    throw new Error('Redis worker client not available');
  }
  return redisWorker;
}

export { redis, redisWorker, redisFactory };