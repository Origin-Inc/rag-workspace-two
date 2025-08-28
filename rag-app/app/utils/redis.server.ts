import Redis from "ioredis";

let redis: Redis;

declare global {
  // eslint-disable-next-line no-var
  var __redis__: Redis;
  var __redisWorker__: Redis;
}

// Configuration for BullMQ workers
const workerConfig = {
  maxRetriesPerRequest: null, // Required for BullMQ blocking operations
  enableReadyCheck: true,
  reconnectOnError: (err: Error) => {
    const targetError = "READONLY";
    if (err.message.includes(targetError)) {
      // Only reconnect if connection was in read-only mode
      return true;
    }
    return false;
  }
};

// Regular Redis client for app usage
if (process.env["NODE_ENV"] === "production") {
  redis = new Redis(process.env["REDIS_URL"] || "redis://localhost:6379");
} else {
  if (!global.__redis__) {
    global.__redis__ = new Redis(process.env["REDIS_URL"] || "redis://localhost:6379");
  }
  redis = global.__redis__;
}

// Special Redis client for BullMQ workers with proper config
let redisWorker: Redis;
if (process.env["NODE_ENV"] === "production") {
  redisWorker = new Redis(process.env["REDIS_URL"] || "redis://localhost:6379", workerConfig);
} else {
  if (!global.__redisWorker__) {
    global.__redisWorker__ = new Redis(process.env["REDIS_URL"] || "redis://localhost:6379", workerConfig);
  }
  redisWorker = global.__redisWorker__;
}

export { redis, redisWorker };