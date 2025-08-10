import { createCookieSessionStorage } from "@remix-run/node";
import { prisma } from "~/utils/db.server";
import { generateSecureToken } from "./password.server";
import { generateTokenPair } from "./jwt.server";

const SESSION_SECRET = process.env["SESSION_SECRET"] || "change-this-in-production";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    secrets: [SESSION_SECRET],
  },
});

export interface CreateSessionOptions {
  userId: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  workspaceId?: string;
  roleId?: string;
  permissions?: string[];
}

/**
 * Create a new session for a user
 */
export async function createUserSession(
  options: CreateSessionOptions
): Promise<{
  session: any;
  tokens: ReturnType<typeof generateTokenPair>;
  headers: Headers;
}> {
  const sessionId = crypto.randomUUID();
  const family = generateSecureToken(16);
  
  // Generate tokens
  const tokens = generateTokenPair(
    options.userId,
    options.email,
    sessionId,
    family,
    options.workspaceId,
    options.roleId,
    options.permissions
  );

  // Create session in database
  const session = await prisma.session.create({
    data: {
      id: sessionId,
      userId: options.userId,
      token: tokens.accessToken,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      expiresAt: tokens.accessTokenExpiry,
    },
  });

  // Create refresh token in database
  await prisma.refreshToken.create({
    data: {
      userId: options.userId,
      token: tokens.refreshToken,
      family,
      browserInfo: options.userAgent,
      expiresAt: tokens.refreshTokenExpiry,
    },
  });

  // Update user's last login
  await prisma.user.update({
    where: { id: options.userId },
    data: { lastLoginAt: new Date() },
  });

  // Create cookie session
  const cookieSession = await sessionStorage.getSession();
  cookieSession.set("sessionToken", tokens.accessToken);
  cookieSession.set("refreshToken", tokens.refreshToken);
  cookieSession.set("userId", options.userId);

  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    await sessionStorage.commitSession(cookieSession)
  );

  return { session, tokens, headers };
}

/**
 * Destroy a user session
 */
export async function destroyUserSession(
  request: Request
): Promise<Headers> {
  const cookieSession = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );

  const sessionToken = cookieSession.get("sessionToken");
  const refreshToken = cookieSession.get("refreshToken");

  // Delete session from database
  if (sessionToken) {
    await prisma.session.deleteMany({
      where: { token: sessionToken },
    });
  }

  // Revoke refresh token
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });
  }

  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    await sessionStorage.destroySession(cookieSession)
  );

  return headers;
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{
  tokens: ReturnType<typeof generateTokenPair>;
  headers: Headers;
} | null> {
  try {
    // Find the refresh token in database
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      return null;
    }

    // Check for token reuse (refresh token rotation)
    if (storedToken.replacedBy) {
      // Token has been used before - possible token theft
      // Revoke entire token family
      await prisma.refreshToken.updateMany({
        where: { family: storedToken.family },
        data: { revokedAt: new Date() },
      });
      return null;
    }

    // Generate new token pair
    const sessionId = crypto.randomUUID();
    const tokens = generateTokenPair(
      storedToken.userId,
      storedToken.user.email,
      sessionId,
      storedToken.family
    );

    // Mark old refresh token as replaced
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        replacedBy: tokens.refreshToken,
        replacedAt: new Date(),
      },
    });

    // Create new refresh token
    await prisma.refreshToken.create({
      data: {
        userId: storedToken.userId,
        token: tokens.refreshToken,
        family: storedToken.family,
        browserInfo: storedToken.browserInfo,
        expiresAt: tokens.refreshTokenExpiry,
      },
    });

    // Create new session
    await prisma.session.create({
      data: {
        id: sessionId,
        userId: storedToken.userId,
        token: tokens.accessToken,
        expiresAt: tokens.accessTokenExpiry,
      },
    });

    // Create cookie session
    const cookieSession = await sessionStorage.getSession();
    cookieSession.set("sessionToken", tokens.accessToken);
    cookieSession.set("refreshToken", tokens.refreshToken);
    cookieSession.set("userId", storedToken.userId);

    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      await sessionStorage.commitSession(cookieSession)
    );

    return { tokens, headers };
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

/**
 * Clean up expired sessions and tokens
 */
export async function cleanupExpiredSessions(): Promise<void> {
  const now = new Date();

  // Delete expired sessions
  await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });

  // Delete expired refresh tokens
  await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { revokedAt: { not: null } },
      ],
    },
  });
}