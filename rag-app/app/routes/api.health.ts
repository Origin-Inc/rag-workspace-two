/**
 * Health check endpoint for monitoring
 * Used by uptime monitors and load balancers
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { prisma } from '~/utils/db.server';
import { redis } from '~/utils/redis.server';
import { Queue } from 'bullmq';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('HealthCheck');

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    queue: ServiceStatus;
    openai: ServiceStatus;
  };
  metrics?: {
    queueDepth?: number;
    activeJobs?: number;
    failedJobs?: number;
    memoryUsage?: number;
  };
}

interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  error?: string;
}

const startTime = Date.now();

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const detailed = url.searchParams.get('detailed') === 'true';
  
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Date.now() - startTime,
    services: {
      database: { status: 'down' },
      redis: { status: 'down' },
      queue: { status: 'down' },
      openai: { status: 'down' }
    }
  };

  // Check Database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = {
      status: 'up',
      latency: Date.now() - dbStart
    };
  } catch (error) {
    health.services.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    health.status = 'unhealthy';
  }

  // Check Redis
  try {
    if (redis) {
      const redisStart = Date.now();
      await redis.ping();
      health.services.redis = {
        status: 'up',
        latency: Date.now() - redisStart
      };
    } else {
      health.services.redis = {
        status: 'down',
        error: 'Redis not configured'
      };
      health.status = 'degraded';
    }
  } catch (error) {
    health.services.redis = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    health.status = 'degraded';
  }

  // Check Queue (if Redis is up)
  if (health.services.redis.status === 'up' && redis) {
    try {
      const queue = new Queue('page-indexing', { connection: redis });
      const counts = await queue.getJobCounts();
      
      health.services.queue = { status: 'up' };
      
      if (detailed) {
        health.metrics = {
          ...health.metrics,
          queueDepth: counts.waiting,
          activeJobs: counts.active,
          failedJobs: counts.failed
        };
      }

      // Mark as degraded if too many failed jobs
      if (counts.failed > 100) {
        health.services.queue.status = 'degraded';
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.queue = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Check OpenAI API (lightweight check - just verify key exists)
  if (process.env.OPENAI_API_KEY) {
    health.services.openai = { status: 'up' };
  } else {
    health.services.openai = {
      status: 'down',
      error: 'API key not configured'
    };
    health.status = 'unhealthy';
  }

  // Add memory usage if detailed
  if (detailed) {
    const memUsage = process.memoryUsage();
    health.metrics = {
      ...health.metrics,
      memoryUsage: Math.round(memUsage.heapUsed / 1024 / 1024) // MB
    };
  }

  // Log unhealthy status
  if (health.status === 'unhealthy') {
    logger.error('Health check failed', health);
  } else if (health.status === 'degraded') {
    logger.warn('Health check degraded', health);
  }

  // Return appropriate status code
  const statusCode = 
    health.status === 'healthy' ? 200 :
    health.status === 'degraded' ? 200 : // Still return 200 for degraded
    503; // Service unavailable for unhealthy

  return json(health, { status: statusCode });
}

// Liveness probe - just checks if the app is running
export async function action({ request }: LoaderFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const formData = await request.formData();
  const probe = formData.get('probe');

  if (probe === 'liveness') {
    // Simple liveness check - app is running
    return json({ 
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  }

  if (probe === 'readiness') {
    // Readiness check - can the app handle requests?
    try {
      // Quick DB check
      await prisma.$queryRaw`SELECT 1`;
      return json({ 
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return json({ 
        status: 'not_ready',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, { status: 503 });
    }
  }

  return json({ error: 'Invalid probe type' }, { status: 400 });
}