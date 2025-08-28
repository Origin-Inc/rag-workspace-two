/**
 * Main Authentication Export
 * Re-exports from production-auth.server.ts for backward compatibility
 */

// Import everything we need first
import {
  signUp as _signUp,
  signIn as _signIn,
  signOut as _signOut,
  getUser as _getUser,
  requireUser as _requireUser,
  type AuthUser
} from './production-auth.server';

// Re-export the functions
export const signUp = _signUp;
export const signIn = _signIn;
export const signOut = _signOut;
export const getUser = _getUser;
export const requireUser = _requireUser;
export type { AuthUser };
export type AuthenticatedUser = AuthUser; // Alias for backward compatibility

// Additional exports for specific use cases
export { sessionStorage } from './session.server';
export { hashPassword, verifyPassword } from './password.server';
export { generateAccessToken, verifyAccessToken } from './jwt.server';

// Backward compatibility functions
export const requireAuthenticatedUser = _requireUser;
export const getAuthenticatedUser = _getUser;

// Permission helper
export async function requirePermission(
  request: Request,
  resource: string,
  action: string
) {
  const user = await _requireUser(request);
  const permission = `${resource}:${action}`;
  
  if (!user.permissions?.includes(permission)) {
    throw new Response("Forbidden", { status: 403 });
  }
  
  return user;
}

// Protected loader helper
export async function protectedLoader(
  request: Request,
  callback: (user: AuthUser) => Promise<any>
) {
  const user = await _requireUser(request);
  return callback(user);
}