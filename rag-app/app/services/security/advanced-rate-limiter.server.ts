import { redis } from '~/utils/redis.server';
import crypto from 'crypto';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix?: string; // Redis key prefix
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  message?: string; // Custom error message
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number; // Seconds until retry
}

/**
 * Advanced rate limiter with sliding window algorithm
 */
export class AdvancedRateLimiter {
  private config: RateLimitConfig;
  
  constructor(config: RateLimitConfig) {
    this.config = {
      keyPrefix: 'ratelimit',
      message: 'Too many requests, please try again later.',
      ...config
    };
  }
  
  /**
   * Check if request is allowed using sliding window algorithm
   */
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const key = `${this.config.keyPrefix}:${identifier}`;
    
    try {
      // Use Redis sorted set for sliding window
      // Score is timestamp, member is unique request ID
      
      // Remove old entries outside the window
      await redis.zremrangebyscore(key, '-inf', windowStart.toString());
      
      // Count requests in current window
      const requestCount = await redis.zcard(key);
      
      // Check if limit exceeded
      if (requestCount >= this.config.maxRequests) {
        // Get oldest request time to calculate retry after
        const oldestRequest = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestTime = oldestRequest[1] ? parseInt(oldestRequest[1]) : now;
        const retryAfter = Math.ceil((oldestTime + this.config.windowMs - now) / 1000);
        
        return {
          allowed: false,
          limit: this.config.maxRequests,
          remaining: 0,
          resetTime: new Date(oldestTime + this.config.windowMs),
          retryAfter
        };
      }
      
      // Add current request
      const requestId = crypto.randomBytes(16).toString('hex');
      await redis.zadd(key, now, requestId);
      
      // Set expiry on key
      await redis.expire(key, Math.ceil(this.config.windowMs / 1000));
      
      return {
        allowed: true,
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests - requestCount - 1,
        resetTime: new Date(now + this.config.windowMs)
      };
    } catch (error) {
      console.error('[RateLimiter] Error:', error);
      // Fail open on Redis errors
      return {
        allowed: true,
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests,
        resetTime: new Date(now + this.config.windowMs)
      };
    }
  }
  
  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = `${this.config.keyPrefix}:${identifier}`;
    await redis.del(key);
  }
  
  /**
   * Get current usage for an identifier
   */
  async getUsage(identifier: string): Promise<{ count: number; resetTime: Date }> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const key = `${this.config.keyPrefix}:${identifier}`;
    
    // Clean old entries
    await redis.zremrangebyscore(key, '-inf', windowStart.toString());
    
    // Get count
    const count = await redis.zcard(key);
    
    return {
      count,
      resetTime: new Date(now + this.config.windowMs)
    };
  }
}

/**
 * Create rate limiter middleware for Remix
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  const limiter = new AdvancedRateLimiter(config);
  
  return async function rateLimitMiddleware(request: Request) {
    // Get identifier (IP address or user ID)
    const identifier = getIdentifier(request);
    
    // Check rate limit
    const result = await limiter.checkLimit(identifier);
    
    if (!result.allowed) {
      // Return rate limit error response
      return new Response(
        JSON.stringify({
          error: config.message,
          retryAfter: result.retryAfter
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': result.limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': result.resetTime.toISOString(),
            'Retry-After': result.retryAfter?.toString() || '60'
          }
        }
      );
    }
    
    // Add rate limit headers to response
    return {
      headers: {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.resetTime.toISOString()
      }
    };
  };
}

/**
 * Get identifier from request (IP or user ID)
 */
function getIdentifier(request: Request): string {
  // Try to get user ID from session/cookie
  const userId = request.headers.get('X-User-Id');
  if (userId) return `user:${userId}`;
  
  // Fall back to IP address
  const ip = request.headers.get('X-Forwarded-For') || 
             request.headers.get('X-Real-IP') || 
             'unknown';
  
  return `ip:${ip}`;
}

/**
 * Pre-configured rate limiters for different endpoints
 */
export const RateLimiters = {
  // General API rate limit: 100 requests per minute
  api: new AdvancedRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyPrefix: 'rl:api'
  }),
  
  // AI endpoints: 20 requests per minute
  ai: new AdvancedRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'rl:ai',
    message: 'AI rate limit exceeded. Please wait before making more AI requests.'
  }),
  
  // Authentication: 5 attempts per 15 minutes
  auth: new AdvancedRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    keyPrefix: 'rl:auth',
    message: 'Too many authentication attempts. Please try again later.'
  }),
  
  // File upload: 10 uploads per hour
  upload: new AdvancedRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'rl:upload',
    message: 'Upload limit exceeded. Please try again later.'
  }),
  
  // Search: 60 requests per minute
  search: new AdvancedRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 60,
    keyPrefix: 'rl:search'
  })
};

/**
 * Distributed rate limiter for multiple servers
 */
export class DistributedRateLimiter {
  private limiters: Map<string, AdvancedRateLimiter> = new Map();
  
  /**
   * Get or create a rate limiter for a specific key
   */
  getLimiter(key: string, config: RateLimitConfig): AdvancedRateLimiter {
    if (!this.limiters.has(key)) {
      this.limiters.set(key, new AdvancedRateLimiter({
        ...config,
        keyPrefix: `drl:${key}`
      }));
    }
    return this.limiters.get(key)!;
  }
  
  /**
   * Apply progressive rate limiting (increases penalty for repeated violations)
   */
  async checkProgressiveLimit(
    identifier: string,
    baseConfig: RateLimitConfig
  ): Promise<RateLimitResult> {
    const violationKey = `violations:${identifier}`;
    
    // Get violation count
    const violations = parseInt(await redis.get(violationKey) || '0');
    
    // Apply progressive penalty
    const config = {
      ...baseConfig,
      maxRequests: Math.max(1, baseConfig.maxRequests - violations * 5),
      windowMs: baseConfig.windowMs * (1 + violations * 0.5)
    };
    
    const limiter = new AdvancedRateLimiter(config);
    const result = await limiter.checkLimit(identifier);
    
    if (!result.allowed) {
      // Increment violation count
      await redis.incr(violationKey);
      await redis.expire(violationKey, 3600); // Reset after 1 hour
    } else if (violations > 0) {
      // Decrement violations on successful requests
      await redis.decr(violationKey);
    }
    
    return result;
  }
}