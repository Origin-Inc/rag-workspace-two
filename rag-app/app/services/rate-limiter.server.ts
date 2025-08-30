/**
 * Rate limiting service for API endpoints
 * Uses Redis for distributed rate limiting across serverless functions
 */

import { redis } from '~/utils/redis.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('RateLimiter');

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      keyPrefix: 'rate_limit',
      ...config
    };
  }

  /**
   * Check if a request is allowed under the rate limit
   */
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    // If Redis is not available, allow the request (fail open)
    if (!redis) {
      logger.warn('Redis not available, skipping rate limit');
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: new Date(Date.now() + this.config.windowMs)
      };
    }

    const key = `${this.config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const window = this.config.windowMs;
    const max = this.config.maxRequests;

    try {
      // Use sliding window algorithm
      const pipeline = redis.pipeline();
      
      // Remove old entries outside the window
      pipeline.zremrangebyscore(key, 0, now - window);
      
      // Count requests in current window
      pipeline.zcard(key);
      
      // Add current request with score as timestamp
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      
      // Set expiry on the key
      pipeline.expire(key, Math.ceil(window / 1000));
      
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Pipeline execution failed');
      }

      // Get the count before adding current request
      const count = (results[1]?.[1] as number) || 0;
      
      // Check if limit exceeded
      const allowed = count < max;
      const remaining = Math.max(0, max - count - 1);
      
      // Calculate reset time (when oldest request expires)
      let resetAt = new Date(now + window);
      
      if (!allowed) {
        // Get oldest request timestamp to calculate retry-after
        const oldestRequest = await redis.zrange(key, 0, 0, 'WITHSCORES');
        if (oldestRequest && oldestRequest.length >= 2) {
          const oldestTimestamp = parseInt(oldestRequest[1] as string);
          resetAt = new Date(oldestTimestamp + window);
        }
        
        // Remove the request we just added since it's not allowed
        await redis.zrem(key, `${now}-${Math.random()}`);
      }

      const result: RateLimitResult = {
        allowed,
        remaining,
        resetAt,
        retryAfter: allowed ? undefined : Math.ceil((resetAt.getTime() - now) / 1000)
      };

      if (!allowed) {
        logger.warn('Rate limit exceeded', { identifier, ...result });
      }

      return result;
    } catch (error) {
      logger.error('Rate limit check failed', error);
      
      // Fail open - allow the request if rate limiting fails
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: new Date(now + window)
      };
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string): Promise<void> {
    if (!redis) return;

    const key = `${this.config.keyPrefix}:${identifier}`;
    
    try {
      await redis.del(key);
      logger.info('Rate limit reset', { identifier });
    } catch (error) {
      logger.error('Failed to reset rate limit', error);
    }
  }

  /**
   * Get current usage for an identifier
   */
  async getUsage(identifier: string): Promise<{ used: number; remaining: number }> {
    if (!redis) {
      return { used: 0, remaining: this.config.maxRequests };
    }

    const key = `${this.config.keyPrefix}:${identifier}`;
    const now = Date.now();
    
    try {
      // Remove old entries and count current
      await redis.zremrangebyscore(key, 0, now - this.config.windowMs);
      const used = await redis.zcard(key);
      
      return {
        used,
        remaining: Math.max(0, this.config.maxRequests - used)
      };
    } catch (error) {
      logger.error('Failed to get usage', error);
      return { used: 0, remaining: this.config.maxRequests };
    }
  }
}

// Pre-configured rate limiters for different use cases

export const openAIRateLimiter = new RateLimiter({
  maxRequests: parseInt(process.env.OPENAI_RATE_LIMIT_PER_MINUTE || '10'),
  windowMs: 60 * 1000, // 1 minute
  keyPrefix: 'rate_limit:openai'
});

export const indexingRateLimiter = new RateLimiter({
  maxRequests: parseInt(process.env.MAX_INDEXING_JOBS_PER_MINUTE || '10'),
  windowMs: 60 * 1000, // 1 minute
  keyPrefix: 'rate_limit:indexing'
});

export const apiRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000, // 100 requests per minute
  keyPrefix: 'rate_limit:api'
});

export const authRateLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 5 attempts per 15 minutes
  keyPrefix: 'rate_limit:auth'
});

/**
 * Express/Remix middleware for rate limiting
 */
export async function rateLimitMiddleware(
  request: Request,
  rateLimiter: RateLimiter = apiRateLimiter
): Promise<Response | null> {
  // Get identifier (IP or user ID)
  const identifier = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

  const result = await rateLimiter.checkLimit(identifier);

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Too many requests',
        retryAfter: result.retryAfter,
        resetAt: result.resetAt
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': rateLimiter.config.maxRequests.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.resetAt.toISOString(),
          'Retry-After': result.retryAfter?.toString() || '60'
        }
      }
    );
  }

  // Request is allowed, return null to continue
  return null;
}