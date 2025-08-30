import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect, json } from "@remix-run/node";
import { createUserSession } from "~/services/auth/auth.server";
import { prisma } from "~/utils/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/app";

  try {
    // Create or get a test user
    let user = await prisma.user.findFirst({
      where: { email: "dev@example.com" }
    });

    if (!user) {
      // Create a test user
      user = await prisma.user.create({
        data: {
          email: "dev@example.com",
          name: "Dev User",
          passwordHash: "not-used-in-dev", // We skip password check in dev
        }
      });

      // Create a default workspace for the user
      const workspace = await prisma.workspace.create({
        data: {
          name: "Dev Workspace",
          slug: `dev-workspace-${Date.now()}`,
          description: "Development workspace"
        }
      });

      // Get or create owner role
      let ownerRole = await prisma.role.findFirst({
        where: { name: "owner" }
      });

      if (!ownerRole) {
        ownerRole = await prisma.role.create({
          data: {
            name: "owner",
            description: "Full access to workspace"
          }
        });
      }

      // Associate user with workspace
      await prisma.userWorkspace.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          roleId: ownerRole.id
        }
      });
    }

    // Create session and redirect
    return createUserSession({
      request,
      userId: user.id,
      remember: true,
      redirectTo,
    });
  } catch (error) {
    console.error('Dev login error:', error);
    // If database is down, create a mock session
    // This is only for development when database isn't available
    const mockUserId = 'dev-user-' + Date.now();
    
    // Return a simple redirect with a cookie
    const headers = new Headers();
    headers.append('Set-Cookie', `userId=${mockUserId}; Path=/; HttpOnly; SameSite=Lax`);
    headers.append('Location', redirectTo);
    
    return new Response(null, {
      status: 302,
      headers
    });
  }
}

export default function DevLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Development Login</h1>
        <p className="mt-2 text-gray-600">Redirecting...</p>
      </div>
    </div>
  );
}