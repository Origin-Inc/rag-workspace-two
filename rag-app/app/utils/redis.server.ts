import Redis from "ioredis";

let redis: Redis;

declare global {
  // eslint-disable-next-line no-var
  var __redis__: Redis;
}

if (process.env["NODE_ENV"] === "production") {
  redis = new Redis(process.env["REDIS_URL"] || "redis://localhost:6379");
} else {
  if (!global.__redis__) {
    global.__redis__ = new Redis(process.env["REDIS_URL"] || "redis://localhost:6379");
  }
  redis = global.__redis__;
}

export { redis };