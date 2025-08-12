import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { sessionStorage } from "~/services/auth/session.server";
import { prisma } from "~/utils/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // For development only - automatically create/login a demo user
  const email = "demo@example.com";
  
  // Check if user exists, create if not
  let user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: "Demo User",
        // Using a dummy password hash since we're bypassing real auth
        passwordHash: "development-only",
      }
    });
  }

  // Create a session
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  session.set("userId", user.id);
  session.set("email", user.email);

  // Redirect to app with session cookie
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/app";
  
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}