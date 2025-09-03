import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { performHealthCheck, checkInitialization } from "~/services/health-check.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Check if this is a simple ping
    const url = new URL(request.url);
    if (url.searchParams.get('ping') === 'true') {
      return json({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // Perform initialization check
    const initCheck = await checkInitialization();
    
    if (!initCheck.isReady) {
      return json({
        status: 'unhealthy',
        message: initCheck.message,
        details: initCheck.details,
        timestamp: new Date().toISOString()
      }, { status: 503 });
    }

    // Perform full health check if requested
    if (url.searchParams.get('full') === 'true') {
      const health = await performHealthCheck();
      const isHealthy = health.database && health.redis && health.supabase;
      
      return json({
        status: isHealthy ? 'healthy' : 'degraded',
        services: {
          database: health.database ? 'up' : 'down',
          redis: health.redis ? 'up' : 'down',
          supabase: health.supabase ? 'up' : 'down'
        },
        errors: health.errors,
        timestamp: new Date().toISOString()
      }, { status: isHealthy ? 200 : 503 });
    }

    // Basic health check
    return json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}