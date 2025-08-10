import { json } from "@remix-run/node";
import { redis } from "~/utils/redis.server";
import { prisma } from "~/utils/db.server";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

// Default rate limit configurations
export const RATE_LIMITS = {
  // Authentication endpoints
  LOGIN: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyPrefix: "rl:login:",
  },
  REGISTER: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    keyPrefix: "rl:register:",
  },
  PASSWORD_RESET: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    keyPrefix: "rl:password-reset:",
  },
  
  // API endpoints
  API_DEFAULT: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    keyPrefix: "rl:api:",
  },
  API_HEAVY: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyPrefix: "rl:api-heavy:",
  },
  
  // Document processing
  DOCUMENT_UPLOAD: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    keyPrefix: "rl:doc-upload:",
  },
  DOCUMENT_PROCESS: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5,
    keyPrefix: "rl:doc-process:",
  },
  
  // Query endpoints
  QUERY: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    keyPrefix: "rl:query:",
  },
} as const;

/**
 * Check rate limit for a given key
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const fullKey = `${config.keyPrefix}${key}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  try {
    // Use Redis sorted set to track requests with timestamps
    // Remove old entries outside the window
    await redis.zremrangebyscore(fullKey, "-inf", windowStart.toString());
    
    // Count requests in current window
    const count = await redis.zcard(fullKey);
    
    if (count >= config.maxRequests) {
      // Get oldest request timestamp to calculate retry time
      const oldestRequests = await redis.zrange(fullKey, 0, 0, "WITHSCORES");
      const oldestTimestamp = oldestRequests[1] ? parseInt(oldestRequests[1]) : now;
      const resetTime = new Date(oldestTimestamp + config.windowMs);
      const retryAfter = Math.ceil((resetTime.getTime() - now) / 1000);
      
      return {
        success: false,
        limit: config.maxRequests,
        remaining: 0,
        resetTime,
        retryAfter,
      };
    }
    
    // Add current request
    await redis.zadd(fullKey, now, `${now}-${Math.random()}`);
    
    // Set expiry on the key
    await redis.expire(fullKey, Math.ceil(config.windowMs / 1000));
    
    const remaining = config.maxRequests - count - 1;
    const resetTime = new Date(now + config.windowMs);
    
    return {
      success: true,
      limit: config.maxRequests,
      remaining: Math.max(0, remaining),
      resetTime,
    };
  } catch (error) {
    console.error("Rate limit check failed:", error);
    // On error, allow the request but log it
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetTime: new Date(now + config.windowMs),
    };
  }
}

/**
 * Apply rate limiting to a request
 */
export async function rateLimit(
  request: Request,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  // Get identifier from request (IP address or user ID)
  const identifier = getRequestIdentifier(request);
  
  const result = await checkRateLimit(identifier, config);
  
  if (!result.success) {
    throw json(
      {
        error: "Too many requests",
        message: `Please retry after ${result.retryAfter} seconds`,
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": result.retryAfter?.toString() || "60",
          "X-RateLimit-Limit": result.limit.toString(),
          "X-RateLimit-Remaining": result.remaining.toString(),
          "X-RateLimit-Reset": result.resetTime.toISOString(),
        },
      }
    );
  }
  
  return result;
}

/**
 * Get request identifier for rate limiting
 */
function getRequestIdentifier(request: Request): string {
  // Try to get user ID from authenticated session
  const userId = request.headers.get("X-User-Id");
  if (userId) {
    return `user:${userId}`;
  }
  
  // Fall back to IP address
  const ip = 
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    request.headers.get("X-Real-IP") ||
    request.headers.get("CF-Connecting-IP") ||
    "unknown";
  
  return `ip:${ip}`;
}

/**
 * Rate limit middleware for actions/loaders
 */
export function rateLimitMiddleware(config: RateLimitConfig) {
  return async (request: Request) => {
    await rateLimit(request, config);
  };
}

/**
 * Account lockout after failed login attempts
 */
export async function checkAccountLockout(
  email: string
): Promise<{ isLocked: boolean; lockoutUntil?: Date }> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      failedLoginAttempts: true,
      lockoutUntil: true,
    },
  });
  
  if (!user) {
    return { isLocked: false };
  }
  
  // Check if account is locked
  if (user.lockoutUntil && user.lockoutUntil > new Date()) {
    return {
      isLocked: true,
      lockoutUntil: user.lockoutUntil,
    };
  }
  
  // Reset lockout if expired
  if (user.lockoutUntil && user.lockoutUntil <= new Date()) {
    await prisma.user.update({
      where: { email },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    });
  }
  
  return { isLocked: false };
}

/**
 * Increment failed login attempts
 */
export async function incrementFailedAttempts(
  email: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      failedLoginAttempts: true,
    },
  });
  
  if (!user) {
    return;
  }
  
  const newAttempts = user.failedLoginAttempts + 1;
  const maxAttempts = 5;
  const lockoutDuration = 30 * 60 * 1000; // 30 minutes
  
  const updateData: any = {
    failedLoginAttempts: newAttempts,
  };
  
  // Lock account after max attempts
  if (newAttempts >= maxAttempts) {
    updateData.lockoutUntil = new Date(Date.now() + lockoutDuration);
  }
  
  await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });
}

/**
 * Reset failed login attempts on successful login
 */
export async function resetFailedAttempts(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockoutUntil: null,
    },
  });
}

/**
 * Distributed rate limiting using Redis
 */
export class DistributedRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly keyPrefix: string;
  
  constructor(config: RateLimitConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
    this.keyPrefix = config.keyPrefix;
  }
  
  async isAllowed(key: string): Promise<boolean> {
    const result = await checkRateLimit(key, {
      windowMs: this.windowMs,
      maxRequests: this.maxRequests,
      keyPrefix: this.keyPrefix,
    });
    
    return result.success;
  }
  
  async reset(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}${key}`;
    await redis.del(fullKey);
  }
}