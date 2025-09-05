import Redis from "ioredis";
import { redisFactory } from "./redis-factory.server";

let redis: Redis;
let redisWorker: Redis;

declare global {
  // eslint-disable-next-line no-var
  var __redis__: Redis;
  var __redisWorker__: Redis;
  var __redisInitialized__: boolean;
}

// Initialize Redis with factory pattern
async function initializeRedis() {
  if (global.__redisInitialized__) {
    return;
  }
  
  try {
    await redisFactory.initialize();
    global.__redisInitialized__ = true;
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    // Fall back to direct connection for backwards compatibility
    const fallbackUrl = process.env["REDIS_URL"] || "redis://localhost:6379";
    redis = new Redis(fallbackUrl);
    redisWorker = new Redis(fallbackUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      reconnectOnError: (err: Error) => err.message.includes("READONLY"),
    });
    return;
  }
  
  // Get clients from factory
  const provider = redisFactory.getProvider();
  
  if (provider.type === 'local') {
    // For local Redis, use the actual ioredis clients
    redis = redisFactory.getClient() as Redis;
    redisWorker = redisFactory.getClient({ workerMode: true }) as Redis;
  } else {
    // For managed services, create wrapper
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
  }
}

// Initialize on module load
if (process.env["NODE_ENV"] === "production") {
  initializeRedis().catch(console.error);
} else {
  // Development mode with global caching
  if (!global.__redis__) {
    initializeRedis().then(() => {
      global.__redis__ = redis;
      global.__redisWorker__ = redisWorker;
    }).catch(console.error);
  } else {
    redis = global.__redis__;
    redisWorker = global.__redisWorker__;
  }
}

export { redis, redisWorker, redisFactory };