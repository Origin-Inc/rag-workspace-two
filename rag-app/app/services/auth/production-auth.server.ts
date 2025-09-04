/**
 * Production Authentication Service
 * Single source of truth for authentication in the application
 */

import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { prisma } from "~/utils/db.server";
import { sessionStorage } from "./session.server";
import { hashPassword, verifyPassword } from "./password.server";
import { generateAccessToken, verifyAccessToken } from "./jwt.server";
import crypto from "crypto";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  workspaceId: string;
  roleId: string;
  permissions: string[];
}

/**
 * Sign up a new user
 */
export async function signUp(
  email: string,
  password: string,
  name?: string
): Promise<{ user: AuthUser; sessionToken: string } | { error: string }> {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return { error: "User with this email already exists" };
    }

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Generate workspace slug
    const workspaceName = `${name || email.split('@')[0]}'s Workspace`;
    const workspaceSlug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Get or create the owner role
    let ownerRole = await prisma.role.findUnique({
      where: { name: 'owner' }
    });

    if (!ownerRole) {
      ownerRole = await prisma.role.create({
        data: {
          name: 'owner',
          displayName: 'Owner',
          description: 'Full workspace access',
          isSystem: true,
          updatedAt: new Date()
        }
      });
    }

    // Create user, workspace, and relationship in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Create the user first
      const user = await tx.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          passwordHash,
          emailVerified: true // For simplicity in development
        }
      });

      // Step 2: Create the workspace
      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName,
          slug: `${workspaceSlug}-${user.id.slice(0, 8)}`
        }
      });

      // Step 3: Create the relationship between user and workspace with role
      const userWorkspace = await tx.userWorkspace.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          roleId: ownerRole.id
        },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true
                }
              }
            }
          }
        }
      });

      // Get permissions for the role
      const permissions = userWorkspace.role.permissions.map(
        rp => `${rp.permission.resource}:${rp.permission.action}`
      );

      return {
        user,
        workspace,
        roleId: ownerRole.id,
        permissions
      };
    });

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.session.create({
      data: {
        userId: result.user.id,
        token: sessionToken,
        expiresAt
      }
    });

    const authUser: AuthUser = {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      workspaceId: result.workspace.id,
      roleId: result.roleId,
      permissions: result.permissions
    };

    return { user: authUser, sessionToken };
  } catch (error) {
    console.error('Signup error:', error);
    // Provide more specific error messages in development
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'production') {
      if (error instanceof Error) {
        console.error('Detailed error:', error.message, error.stack);
        // Check for specific Prisma errors
        if (error.message.includes('Unique constraint')) {
          return { error: "This email is already registered" };
        }
        if (error.message.includes('Foreign key constraint')) {
          return { error: "Database relationship error - please contact support" };
        }
        // Return the actual error message for debugging
        return { error: `Signup failed: ${error.message}` };
      }
    }
    return { error: "Failed to create account. Please try again." };
  }
}

/**
 * Sign in an existing user
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ user: AuthUser; sessionToken: string } | { error: string }> {
  console.log('[SIGNIN] Starting signin attempt for email:', email);
  console.log('[SIGNIN] Environment:', process.env.NODE_ENV);
  console.log('[SIGNIN] Database URL prefix:', process.env.DATABASE_URL?.substring(0, 50));
  
  try {
    console.log('[SIGNIN] Step 1: Looking up user in database');
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        userWorkspaces: {
          include: {
            workspace: true,
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          },
          orderBy: {
            joinedAt: 'asc'
          },
          take: 1
        }
      }
    });

    console.log('[SIGNIN] Step 2: User lookup result');
    console.log('[SIGNIN] User found:', !!user);
    if (user) {
      console.log('[SIGNIN] User ID:', user.id);
      console.log('[SIGNIN] User email:', user.email);
      console.log('[SIGNIN] User has password hash:', !!user.passwordHash);
      console.log('[SIGNIN] Password hash length:', user.passwordHash?.length);
      console.log('[SIGNIN] UserWorkspaces count:', user.userWorkspaces?.length);
    }

    if (!user) {
      console.log('[SIGNIN] User not found for email:', email);
      return { error: "Invalid email or password" };
    }

    console.log('[SIGNIN] Step 3: Verifying password');
    console.log('[SIGNIN] Input password length:', password?.length);
    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    console.log('[SIGNIN] Password verification result:', isValid);
    if (!isValid) {
      console.log('[SIGNIN] Password verification failed');
      return { error: "Invalid email or password" };
    }

    console.log('[SIGNIN] Step 4: Checking lockout status');
    // Check if user is locked out
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      console.log('[SIGNIN] User is locked out until:', user.lockoutUntil);
      return { error: "Your account is temporarily locked. Please try again later." };
    }
    console.log('[SIGNIN] User not locked out');

    console.log('[SIGNIN] Step 5: Getting user workspace');
    // Get first workspace
    const userWorkspace = user.userWorkspaces[0];
    console.log('[SIGNIN] UserWorkspace found:', !!userWorkspace);
    if (userWorkspace) {
      console.log('[SIGNIN] Workspace ID:', userWorkspace.workspaceId);
      console.log('[SIGNIN] Role ID:', userWorkspace.roleId);
      console.log('[SIGNIN] Role name:', userWorkspace.role?.name);
      console.log('[SIGNIN] Permissions count:', userWorkspace.role?.permissions?.length);
    }
    
    if (!userWorkspace) {
      console.log('[SIGNIN] ERROR: No workspace found for user');
      return { error: "No workspace found for this user" };
    }

    console.log('[SIGNIN] Step 6: Creating session');
    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
    console.log('[SIGNIN] Session token generated, length:', sessionToken.length);
    console.log('[SIGNIN] Session expires at:', expiresAt);

    try {
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          token: sessionToken,
          expiresAt
        }
      });
      console.log('[SIGNIN] Session created with ID:', session.id);
    } catch (sessionError) {
      console.error('[SIGNIN] ERROR creating session:', sessionError);
      throw sessionError;
    }

    console.log('[SIGNIN] Step 7: Building permissions array');
    const permissions = userWorkspace.role.permissions.map(
      rp => `${rp.permission.resource}:${rp.permission.action}`
    );
    console.log('[SIGNIN] Permissions built:', permissions.length, 'permissions');

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      workspaceId: userWorkspace.workspaceId,
      roleId: userWorkspace.roleId,
      permissions
    };

    console.log('[SIGNIN] Step 8: Signin successful');
    console.log('[SIGNIN] Returning user:', authUser.email, 'with workspace:', authUser.workspaceId);
    return { user: authUser, sessionToken };
  } catch (error) {
    console.error('Signin error:', error);
    // Provide more specific error messages
    if (error instanceof Error) {
      console.error('Detailed signin error:', error.message, error.stack);
      // Return the actual error message for debugging
      return { error: `Signin failed: ${error.message}` };
    }
    return { error: "Failed to sign in. Please try again." };
  }
}

/**
 * Get authenticated user from request
 */
export async function getUser(request: Request): Promise<AuthUser | null> {
  try {
    const cookieSession = await sessionStorage.getSession(
      request.headers.get("Cookie")
    );

    const sessionToken = cookieSession.get("sessionToken");
    if (!sessionToken) {
      return null;
    }

    // Find session in database
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: {
        user: {
          include: {
            userWorkspaces: {
              include: {
                workspace: true,
                role: {
                  include: {
                    permissions: {
                      include: {
                        permission: true
                      }
                    }
                  }
                }
              },
              orderBy: {
                joinedAt: 'asc'
              },
              take: 1
            }
          }
        }
      }
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    const userWorkspace = session.user.userWorkspaces[0];
    if (!userWorkspace) {
      return null;
    }

    const permissions = userWorkspace.role.permissions.map(
      rp => `${rp.permission.resource}:${rp.permission.action}`
    );

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      workspaceId: userWorkspace.workspaceId,
      roleId: userWorkspace.roleId,
      permissions
    };
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

/**
 * Require user to be authenticated
 */
export async function requireUser(
  request: Request,
  redirectTo = "/auth/signin"
): Promise<AuthUser> {
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
 * Sign out the current user
 */
export async function signOut(request: Request): Promise<Response> {
  const cookieSession = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );

  const sessionToken = cookieSession.get("sessionToken");
  if (sessionToken) {
    // Delete session from database
    await prisma.session.deleteMany({
      where: { token: sessionToken }
    });
  }

  // Clear cookie
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(cookieSession),
    },
  });
}