import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "~/utils/db.server";
import Redis from "ioredis";

// Use singleton Redis connection
let redis: Redis | null = null;

function getRedis() {
  if (!redis) {
    redis = new Redis(process.env["REDIS_URL"] || "redis://localhost:6379");
  }
  return redis;
}

export async function loader(_args: LoaderFunctionArgs) {
  const healthStatus: {
    status: "healthy" | "unhealthy";
    timestamp: string;
    services: {
      database: { status: "up" | "down"; latency?: number; error?: string };
      redis: { status: "up" | "down"; latency?: number; error?: string };
      app: { status: "up"; version: string; environment: string };
    };
  } = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      database: { status: "down" },
      redis: { status: "down" },
      app: {
        status: "up",
        version: "1.0.0",
        environment: process.env.NODE_ENV || "development",
      },
    },
  };

  // Check PostgreSQL connection
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    healthStatus.services.database = {
      status: "up",
      latency: Date.now() - startTime,
    };
  } catch (error) {
    healthStatus.status = "unhealthy";
    healthStatus.services.database = {
      status: "down",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Check Redis connection
  try {
    const startTime = Date.now();
    const redisClient = getRedis();
    await redisClient.ping();
    healthStatus.services.redis = {
      status: "up",
      latency: Date.now() - startTime,
    };
  } catch (error) {
    healthStatus.status = "unhealthy";
    healthStatus.services.redis = {
      status: "down",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Return appropriate status code
  const statusCode = healthStatus.status === "healthy" ? 200 : 503;

  return json(healthStatus, { status: statusCode });
}