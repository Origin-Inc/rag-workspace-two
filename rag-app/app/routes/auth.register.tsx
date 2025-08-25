import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

// Redirect to unified register
export async function loader({ request }: LoaderFunctionArgs) {
  return redirect("/auth/unified-register");
}