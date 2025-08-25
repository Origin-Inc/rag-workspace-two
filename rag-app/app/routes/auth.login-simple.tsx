import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

// Redirect to unified login
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/app";
  return redirect(`/auth/unified-login?redirectTo=${encodeURIComponent(redirectTo)}`);
}