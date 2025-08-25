// Unified Authentication Service - Production Ready
// Uses Supabase Auth as the primary authentication method
// Properly integrates with workspace management

import { createSupabaseAdmin } from '~/utils/supabase.server';
import { prisma } from '~/utils/db.server';
import { sessionStorage } from './session.server';
import { redirect } from '@remix-run/node';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  currentWorkspaceId: string;
  currentWorkspace: {
    id: string;
    name: string;
    slug: string;
  };
  role: {
    id: string;
    name: string;
    displayName: string;
  };
}

/**
 * Get the authenticated user with their current workspace
 */
export async function getAuthenticatedUser(request: Request): Promise<AuthUser | null> {
  const session = await sessionStorage.getSession(request.headers.get('Cookie'));
  const userId = session.get('userId');
  
  if (!userId) {
    return null;
  }

  // Get user with their default workspace
  const userWithWorkspace = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userWorkspaces: {
        include: {
          workspace: true,
          role: true
        },
        orderBy: {
          joinedAt: 'asc' // Get the first workspace they joined
        },
        take: 1
      }
    }
  });

  if (!userWithWorkspace || userWithWorkspace.userWorkspaces.length === 0) {
    return null;
  }

  const currentWorkspace = userWithWorkspace.userWorkspaces[0];
  
  return {
    id: userWithWorkspace.id,
    email: userWithWorkspace.email,
    name: userWithWorkspace.name,
    currentWorkspaceId: currentWorkspace.workspace.id,
    currentWorkspace: {
      id: currentWorkspace.workspace.id,
      name: currentWorkspace.workspace.name,
      slug: currentWorkspace.workspace.slug
    },
    role: {
      id: currentWorkspace.role.id,
      name: currentWorkspace.role.name,
      displayName: currentWorkspace.role.displayName
    }
  };
}

/**
 * Require authenticated user or redirect to login
 */
export async function requireAuthenticatedUser(
  request: Request,
  redirectTo: string = '/auth/login'
): Promise<AuthUser> {
  const user = await getAuthenticatedUser(request);
  
  if (!user) {
    const url = new URL(request.url);
    const searchParams = new URLSearchParams();
    searchParams.set('redirectTo', url.pathname);
    throw redirect(`${redirectTo}?${searchParams}`);
  }
  
  return user;
}

/**
 * Sign in with email and password using Supabase Auth
 */
export async function signIn(email: string, password: string) {
  const supabase = createSupabaseAdmin();
  
  // Authenticate with Supabase
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError || !authData.user) {
    return { error: authError?.message || 'Invalid credentials' };
  }

  // Ensure user exists in our database
  const user = await ensureUserInDatabase(authData.user);
  
  // Create session
  const session = await sessionStorage.getSession();
  session.set('userId', user.id);
  session.set('email', user.email);
  
  return { 
    user,
    session,
    headers: {
      'Set-Cookie': await sessionStorage.commitSession(session)
    }
  };
}

/**
 * Sign up a new user with Supabase Auth
 */
export async function signUp(email: string, password: string, name?: string) {
  const supabase = createSupabaseAdmin();
  
  // Create Supabase auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name
      }
    }
  });

  if (authError || !authData.user) {
    return { error: authError?.message || 'Failed to create account' };
  }

  // Create user in our database with a default workspace
  const user = await createUserWithWorkspace(authData.user, name);
  
  // Create session
  const session = await sessionStorage.getSession();
  session.set('userId', user.id);
  session.set('email', user.email);
  
  return { 
    user,
    session,
    headers: {
      'Set-Cookie': await sessionStorage.commitSession(session)
    }
  };
}

/**
 * Sign out the current user
 */
export async function signOut(request: Request) {
  const supabase = createSupabaseAdmin();
  await supabase.auth.signOut();
  
  const session = await sessionStorage.getSession(request.headers.get('Cookie'));
  
  return {
    headers: {
      'Set-Cookie': await sessionStorage.destroySession(session)
    }
  };
}

/**
 * Ensure Supabase user exists in our database
 */
async function ensureUserInDatabase(supabaseUser: SupabaseUser) {
  // Check if user exists
  let user = await prisma.user.findUnique({
    where: { email: supabaseUser.email! },
    include: {
      userWorkspaces: {
        include: {
          workspace: true
        }
      }
    }
  });

  if (!user) {
    // Create user with a default workspace
    user = await createUserWithWorkspace(
      supabaseUser,
      supabaseUser.user_metadata?.name
    );
  } else if (user.userWorkspaces.length === 0) {
    // User exists but has no workspace - create one
    await createDefaultWorkspace(user.id, user.email);
  }

  return user;
}

/**
 * Create a new user with a default workspace
 */
async function createUserWithWorkspace(supabaseUser: SupabaseUser, name?: string) {
  const workspaceName = `${name || supabaseUser.email!.split('@')[0]}'s Workspace`;
  const workspaceSlug = generateSlug(workspaceName);

  // Get or create the default role
  const defaultRole = await prisma.role.upsert({
    where: { name: 'owner' },
    update: {},
    create: {
      name: 'owner',
      displayName: 'Owner',
      description: 'Workspace owner with full permissions',
      isSystem: true
    }
  });

  // Create user, workspace, and relationship in a transaction
  const user = await prisma.user.create({
    data: {
      id: supabaseUser.id,
      email: supabaseUser.email!,
      name: name || null,
      emailVerified: supabaseUser.email_confirmed_at ? true : false,
      passwordHash: '', // Not used with Supabase Auth
      userWorkspaces: {
        create: {
          workspace: {
            create: {
              name: workspaceName,
              slug: workspaceSlug,
              settings: {
                defaultView: 'projects',
                theme: 'light'
              }
            }
          },
          role: {
            connect: { id: defaultRole.id }
          }
        }
      }
    },
    include: {
      userWorkspaces: {
        include: {
          workspace: true
        }
      }
    }
  });

  return user;
}

/**
 * Create a default workspace for an existing user
 */
async function createDefaultWorkspace(userId: string, email: string) {
  const workspaceName = `${email.split('@')[0]}'s Workspace`;
  const workspaceSlug = generateSlug(workspaceName);

  const defaultRole = await prisma.role.upsert({
    where: { name: 'owner' },
    update: {},
    create: {
      name: 'owner',
      displayName: 'Owner',
      description: 'Workspace owner with full permissions',
      isSystem: true
    }
  });

  await prisma.userWorkspace.create({
    data: {
      userId,
      workspace: {
        create: {
          name: workspaceName,
          slug: workspaceSlug,
          settings: {
            defaultView: 'projects',
            theme: 'light'
          }
        }
      },
      roleId: defaultRole.id
    }
  });
}

/**
 * Switch to a different workspace
 */
export async function switchWorkspace(userId: string, workspaceId: string) {
  // Verify user has access to the workspace
  const userWorkspace = await prisma.userWorkspace.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId
      }
    }
  });

  if (!userWorkspace) {
    throw new Error('You do not have access to this workspace');
  }

  // In a real implementation, you might store the current workspace in the session
  // or in a user preferences table
  return userWorkspace;
}

/**
 * Get all workspaces for a user
 */
export async function getUserWorkspaces(userId: string) {
  return prisma.userWorkspace.findMany({
    where: { userId },
    include: {
      workspace: true,
      role: true
    },
    orderBy: {
      joinedAt: 'asc'
    }
  });
}

/**
 * Generate a URL-safe slug from a name
 */
function generateSlug(name: string): string {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  // Add a random suffix to ensure uniqueness
  const suffix = Math.random().toString(36).substring(2, 8);
  
  return `${baseSlug}-${suffix}`;
}