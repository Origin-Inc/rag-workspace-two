import jwt from "jsonwebtoken";
import { z } from "zod";

const JWT_SECRET = process.env["JWT_SECRET"] || "change-this-in-production";
const JWT_ISSUER = "rag-app";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

// Token payload schemas
const accessTokenPayloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  workspaceId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  permissions: z.array(z.string()).optional(),
  sessionId: z.string().uuid(),
  type: z.literal("access"),
});

const refreshTokenPayloadSchema = z.object({
  userId: z.string().uuid(),
  family: z.string(),
  sessionId: z.string().uuid(),
  type: z.literal("refresh"),
});

export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;
export type RefreshTokenPayload = z.infer<typeof refreshTokenPayloadSchema>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: Date;
  refreshTokenExpiry: Date;
}

/**
 * Generate an access token
 */
export function generateAccessToken(
  payload: Omit<AccessTokenPayload, "type">
): { token: string; expiry: Date } {
  const tokenPayload: AccessTokenPayload = {
    ...payload,
    type: "access",
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: JWT_ISSUER,
    audience: "rag-app-api",
    subject: payload.userId,
  });

  const decoded = jwt.decode(token) as jwt.JwtPayload;
  const expiry = new Date((decoded.exp || 0) * 1000);

  return { token, expiry };
}

/**
 * Generate a refresh token
 */
export function generateRefreshToken(
  payload: Omit<RefreshTokenPayload, "type">
): { token: string; expiry: Date } {
  const tokenPayload: RefreshTokenPayload = {
    ...payload,
    type: "refresh",
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    issuer: JWT_ISSUER,
    audience: "rag-app-refresh",
    subject: payload.userId,
  });

  const decoded = jwt.decode(token) as jwt.JwtPayload;
  const expiry = new Date((decoded.exp || 0) * 1000);

  return { token, expiry };
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(
  userId: string,
  email: string,
  sessionId: string,
  family: string,
  workspaceId?: string,
  roleId?: string,
  permissions?: string[]
): TokenPair {
  const accessTokenData = generateAccessToken({
    userId,
    email,
    workspaceId,
    roleId,
    permissions,
    sessionId,
  });

  const refreshTokenData = generateRefreshToken({
    userId,
    family,
    sessionId,
  });

  return {
    accessToken: accessTokenData.token,
    refreshToken: refreshTokenData.token,
    accessTokenExpiry: accessTokenData.expiry,
    refreshTokenExpiry: refreshTokenData.expiry,
  };
}

/**
 * Verify and decode an access token
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: "rag-app-api",
    }) as jwt.JwtPayload;

    const payload = accessTokenPayloadSchema.parse({
      userId: decoded["userId"],
      email: decoded["email"],
      workspaceId: decoded["workspaceId"],
      roleId: decoded["roleId"],
      permissions: decoded["permissions"],
      sessionId: decoded["sessionId"],
      type: decoded["type"],
    });

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Token has expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid token");
    }
    throw error;
  }
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: "rag-app-refresh",
    }) as jwt.JwtPayload;

    const payload = refreshTokenPayloadSchema.parse({
      userId: decoded["userId"],
      family: decoded["family"],
      sessionId: decoded["sessionId"],
      type: decoded["type"],
    });

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Refresh token has expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid refresh token");
    }
    throw error;
  }
}

/**
 * Decode a token without verifying (for debugging)
 */
export function decodeToken(token: string): jwt.JwtPayload | null {
  try {
    return jwt.decode(token) as jwt.JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return true;
  }
  
  return Date.now() >= decoded.exp * 1000;
}