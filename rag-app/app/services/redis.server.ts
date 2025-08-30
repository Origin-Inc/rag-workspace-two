import Redis from 'ioredis';

// Create Redis client
let redis: Redis | null = null;

if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Only reconnect when the error contains "READONLY"
          return true;
        }
        return false;
      }
    });

    redis.on('error', (error) => {
      console.error('Redis error:', error);
    });

    redis.on('connect', () => {
      console.log('Redis connected successfully');
    });
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    redis = null;
  }
} else {
  console.warn('REDIS_URL not configured - caching disabled');
}

export { redis };