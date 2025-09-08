import { json, type LoaderFunction } from "@remix-run/node";
import { embeddingMonitor } from "~/services/rag/monitoring/embedding-monitor.server";
import { requireUser } from "~/services/auth/auth.server";

/**
 * API endpoint for embedding system health and metrics
 * GET /api/embedding-health - Returns health status
 * GET /api/embedding-health?metrics=true - Returns detailed metrics
 */
export const loader: LoaderFunction = async ({ request }) => {
  try {
    // Optionally require authentication
    // await requireUser(request);
    
    const url = new URL(request.url);
    const includeMetrics = url.searchParams.get("metrics") === "true";
    
    if (includeMetrics) {
      // Return detailed metrics
      const metrics = await embeddingMonitor.getMetrics();
      return json({
        success: true,
        metrics,
      });
    } else {
      // Return health status
      const health = await embeddingMonitor.getHealth();
      
      // Set appropriate HTTP status based on health
      let status = 200;
      if (health.status === 'unhealthy') {
        status = 503; // Service Unavailable
      } else if (health.status === 'degraded') {
        status = 200; // Still operational but degraded
      }
      
      return json({
        success: health.status !== 'unhealthy',
        health,
      }, { status });
    }
  } catch (error) {
    console.error("Health check error:", error);
    return json({
      success: false,
      error: "Failed to get health status",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
};