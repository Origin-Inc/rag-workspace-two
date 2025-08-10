import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { prisma } from "~/utils/db.server";
import { verifyAccessToken } from "./jwt.server";
import { sessionStorage } from "./session.server";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  workspaceId?: string;
  roleId?: string;
  permissions?: string[];
}

/**
 * Get user from request headers or cookies
 */
export async function getUser(
  request: Request
): Promise<AuthenticatedUser | null> {
  try {
    // Check for Bearer token in Authorization header
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = verifyAccessToken(token);
      
      // Verify session is still valid
      const session = await prisma.session.findUnique({
        where: { id: payload.sessionId },
        include: { user: true },
      });

      if (!session || session.expiresAt < new Date()) {
        return null;
      }

      return {
        id: payload.userId,
        email: payload.email,
        name: session.user.name,
        workspaceId: payload.workspaceId,
        roleId: payload.roleId,
        permissions: payload.permissions,
      };
    }

    // Check for session cookie
    const cookieSession = await sessionStorage.getSession(
      request.headers.get("Cookie")
    );
    
    const sessionToken = cookieSession.get("sessionToken");
    if (!sessionToken) {
      return null;
    }

    const payload = verifyAccessToken(sessionToken);
    
    // Verify session is still valid
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    return {
      id: payload.userId,
      email: payload.email,
      name: session.user.name,
      workspaceId: payload.workspaceId,
      roleId: payload.roleId,
      permissions: payload.permissions,
    };
  } catch (error) {
    console.error("Error getting user from request:", error);
    return null;
  }
}

/**
 * Require user to be authenticated
 */
export async function requireUser(
  request: Request,
  redirectTo = "/login"
): Promise<AuthenticatedUser> {
  const user = await getUser(request);
  
  if (!user) {
    const url = new URL(request.url);
    const params = new URLSearchParams({ 
      redirectTo: url.pathname + url.search 
    });
    throw redirect(`${redirectTo}?${params.toString()}`);
  }

  return user;
}

/**
 * Require user to have specific permission
 */
export async function requirePermission(
  request: Request,
  resource: string,
  action: string
): Promise<AuthenticatedUser> {
  const user = await requireUser(request);

  if (!user.permissions) {
    throw new Response("Forbidden", { status: 403 });
  }

  const permission = `${resource}:${action}`;
  if (!user.permissions.includes(permission)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return user;
}

/**
 * Require user to be in a specific workspace
 */
export async function requireWorkspace(
  request: Request,
  workspaceId: string
): Promise<AuthenticatedUser> {
  const user = await requireUser(request);

  // Check if user has access to the workspace
  const userWorkspace = await prisma.userWorkspace.findUnique({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId,
      },
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  if (!userWorkspace) {
    throw new Response("Forbidden", { status: 403 });
  }

  // Update user object with workspace permissions
  const permissions = userWorkspace.role.permissions.map(
    (rp) => `${rp.permission.resource}:${rp.permission.action}`
  );

  return {
    ...user,
    workspaceId,
    roleId: userWorkspace.roleId,
    permissions,
  };
}

/**
 * Log user activity for audit trail
 */
export async function logActivity(
  userId: string | null,
  action: string,
  resource: string,
  resourceId?: string,
  details?: Record<string, any>,
  request?: Request
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        details,
        ipAddress: request?.headers.get("X-Forwarded-For") || 
                   request?.headers.get("X-Real-IP") || 
                   undefined,
        userAgent: request?.headers.get("User-Agent") || undefined,
      },
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
    // Don't throw - logging failure shouldn't break the app
  }
}

/**
 * Protect a loader function
 */
export function protectedLoader<T extends LoaderFunctionArgs>(
  loader: (args: T & { user: AuthenticatedUser }) => any
) {
  return async (args: T) => {
    const user = await requireUser(args.request);
    return loader({ ...args, user });
  };
}

/**
 * Protect an action function
 */
export function protectedAction<T extends ActionFunctionArgs>(
  action: (args: T & { user: AuthenticatedUser }) => any
) {
  return async (args: T) => {
    const user = await requireUser(args.request);
    return action({ ...args, user });
  };
}