import { json, type LoaderFunction } from "@remix-run/node";
import { prisma } from "~/utils/db.server";
import { 
  getPoolStats, 
  validatePoolingMode,
  getPoolingConfig 
} from "~/utils/db-pooling.server";
import { redis } from "~/services/redis.server";

export const loader: LoaderFunction = async () => {
  const startTime = Date.now();
  const health: any = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    checks: {},
  };

  // 1. Check database connectivity and performance
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;
    
    health.checks.database = {
      status: "healthy",
      latency: dbLatency,
      threshold: dbLatency < 100 ? "good" : dbLatency < 500 ? "acceptable" : "slow",
    };
  } catch (error: any) {
    health.status = "unhealthy";
    health.checks.database = {
      status: "unhealthy",
      error: error.message,
    };
  }

  // 2. Check connection pool stats
  try {
    const poolStats = await getPoolStats(prisma);
    const poolingConfig = getPoolingConfig();
    
    health.checks.connectionPool = {
      status: "healthy",
      mode: poolStats.mode,
      port: poolStats.port,
      connections: {
        active: poolStats.activeConnections,
        idle: poolStats.idleConnections,
        total: poolStats.totalConnections,
        waiting: poolStats.waitingClients,
        limit: poolingConfig.connectionLimit,
      },
      utilization: poolStats.totalConnections > 0 
        ? Math.round((poolStats.activeConnections / poolStats.totalConnections) * 100) 
        : 0,
    };
    
    // Warn if connection pool is getting exhausted
    if (poolStats.waitingClients > 0) {
      health.checks.connectionPool.warning = "Clients waiting for connections";
    }
    
    if (poolStats.totalConnections >= poolingConfig.connectionLimit * 0.8) {
      health.checks.connectionPool.warning = "Connection pool near capacity";
    }
  } catch (error: any) {
    health.checks.connectionPool = {
      status: "degraded",
      error: error.message,
    };
  }

  // 3. Validate pooling mode configuration
  try {
    const validation = await validatePoolingMode(prisma);
    
    health.checks.poolingMode = {
      status: validation.isValid ? "healthy" : "misconfigured",
      mode: validation.mode,
      port: validation.port,
      message: validation.message,
    };
    
    if (!validation.isValid) {
      health.status = "degraded";
    }
  } catch (error: any) {
    health.checks.poolingMode = {
      status: "unknown",
      error: error.message,
    };
  }

  // 4. Check Redis connectivity (if configured)
  if (redis) {
    try {
      const redisStart = Date.now();
      await redis.ping();
      const redisLatency = Date.now() - redisStart;
      
      // Get Redis info
      const info = await redis.info("clients");
      const connectedClients = info.match(/connected_clients:(\d+)/)?.[1];
      
      health.checks.redis = {
        status: "healthy",
        latency: redisLatency,
        connectedClients: connectedClients ? parseInt(connectedClients) : undefined,
      };
    } catch (error: any) {
      health.checks.redis = {
        status: "unavailable",
        error: error.message,
      };
    }
  } else {
    health.checks.redis = {
      status: "not_configured",
    };
  }

  // 5. Check memory usage
  const memoryUsage = process.memoryUsage();
  health.checks.memory = {
    status: "healthy",
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
    utilization: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
  };
  
  // Warn if memory usage is high
  if (health.checks.memory.utilization > 80) {
    health.checks.memory.warning = "High memory usage";
    health.status = health.status === "healthy" ? "degraded" : health.status;
  }

  // 6. Check serverless environment indicators
  health.checks.serverless = {
    vercel: process.env.VERCEL === "1",
    railway: process.env.RAILWAY_ENVIRONMENT !== undefined,
    awsLambda: process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined,
    gcpFunctions: process.env.K_SERVICE !== undefined,
    instanceCount: process.env.INSTANCE_COUNT || "unknown",
  };

  // Calculate overall response time
  health.responseTime = Date.now() - startTime;
  
  // Determine overall health status
  if (health.status === "healthy" && health.responseTime > 1000) {
    health.status = "degraded";
    health.message = "Slow response time";
  }

  // Return appropriate status code
  const statusCode = health.status === "healthy" ? 200 : 
                     health.status === "degraded" ? 200 : 503;
  
  return json(health, { status: statusCode });
};