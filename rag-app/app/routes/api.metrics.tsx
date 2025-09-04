import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

/**
 * Simple metrics endpoint to handle client-side metrics/telemetry
 * This prevents 404 errors in production when the client tries to send metrics
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const data = await request.json();
    
    // For now, we just log the metrics to console
    // In production, you might want to send these to a monitoring service
    if (process.env.NODE_ENV === "development") {
      console.log("[METRICS]", data);
    }
    
    // TODO: Send to monitoring service like PostHog, Mixpanel, or custom analytics
    // if (process.env.POSTHOG_API_KEY) {
    //   await sendToPostHog(data);
    // }
    
    return json({ success: true });
  } catch (error) {
    console.error("[METRICS] Error processing metrics:", error);
    return json({ success: false }, { status: 500 });
  }
}

// Also handle GET requests gracefully
export async function loader() {
  return json({ 
    message: "Metrics endpoint is active",
    timestamp: new Date().toISOString()
  });
}