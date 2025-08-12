import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  // Redirect to app, which will create a default workspace
  return redirect("/app");
}

export default function OnboardingWorkspace() {
  return null;
}