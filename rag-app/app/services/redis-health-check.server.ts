import { getRedis } from '~/utils/redis.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('RedisHealthCheck');

interface RedisHealthStatus {
  connected: boolean;
  evictionPolicy: string;
  policyCorrect: boolean;
  memoryUsage: number;
  maxMemory: string;
  warnings: string[];
}

export class RedisHealthChecker {
  /**
   * Check Redis health and configuration
   */
  async checkHealth(): Promise<RedisHealthStatus> {
    const warnings: string[] = [];
    
    try {
      // Get Redis client
      const redis = await getRedis();
      
      // Check connection
      const ping = await redis.ping();
      if (ping !== 'PONG') {
        warnings.push('Redis ping response unexpected');
      }
      
      // Get configuration
      const config = await redis.config('GET', 'maxmemory-policy');
      const evictionPolicy = config[1] as string;
      
      // Check eviction policy
      const policyCorrect = evictionPolicy === 'noeviction';
      if (!policyCorrect) {
        warnings.push(`IMPORTANT! Eviction policy is ${evictionPolicy}. It should be "noeviction" for BullMQ`);
        logger.error(`❌ Wrong Redis eviction policy: ${evictionPolicy}`);
        
        // Try to fix it (if we have permissions)
        try {
          await redis.config('SET', 'maxmemory-policy', 'noeviction');
          logger.info('✅ Fixed Redis eviction policy to noeviction');
        } catch (error) {
          warnings.push('Unable to fix eviction policy - may need admin access');
          logger.error('Failed to fix eviction policy', error);
        }
      }
      
      // Get memory info
      const memoryInfo = await redis.info('memory');
      const memoryUsed = this.parseMemoryInfo(memoryInfo, 'used_memory');
      
      // Get max memory setting
      const maxMemoryConfig = await redis.config('GET', 'maxmemory');
      const maxMemory = maxMemoryConfig[1] as string;
      
      // Check if max memory is set
      if (maxMemory === '0') {
        warnings.push('No memory limit set - Redis will use all available memory');
      }
      
      return {
        connected: true,
        evictionPolicy,
        policyCorrect,
        memoryUsage: memoryUsed,
        maxMemory,
        warnings,
      };
      
    } catch (error) {
      logger.error('Redis health check failed', error);
      return {
        connected: false,
        evictionPolicy: 'unknown',
        policyCorrect: false,
        memoryUsage: 0,
        maxMemory: '0',
        warnings: ['Redis connection failed: ' + (error as Error).message],
      };
    }
  }
  
  /**
   * Parse memory info string
   */
  private parseMemoryInfo(info: string, key: string): number {
    const regex = new RegExp(`${key}:(\\d+)`);
    const match = info.match(regex);
    return match ? parseInt(match[1], 10) : 0;
  }
  
  /**
   * Monitor Redis health periodically
   */
  async startMonitoring(intervalMs: number = 60000): Promise<void> {
    // Initial check
    const status = await this.checkHealth();
    if (status.warnings.length > 0) {
      logger.warn('Redis health warnings', status.warnings);
    }
    
    // Periodic checks
    setInterval(async () => {
      const status = await this.checkHealth();
      if (!status.connected) {
        logger.error('Redis disconnected!');
      }
      if (!status.policyCorrect) {
        logger.warn('Redis eviction policy incorrect!', { policy: status.evictionPolicy });
      }
    }, intervalMs);
  }
  
  /**
   * Fix common Redis issues
   */
  async fixCommonIssues(): Promise<void> {
    try {
      // Fix eviction policy
      await redis.config('SET', 'maxmemory-policy', 'noeviction');
      logger.info('✅ Set eviction policy to noeviction');
      
      // Set reasonable memory limit if not set
      const maxMemoryConfig = await redis.config('GET', 'maxmemory');
      if (maxMemoryConfig[1] === '0') {
        // Set to 512MB for development
        await redis.config('SET', 'maxmemory', '536870912');
        logger.info('✅ Set max memory to 512MB');
      }
      
      // Enable persistence
      await redis.config('SET', 'save', '60 1000'); // Save every 60s if 1000+ keys changed
      logger.info('✅ Enabled Redis persistence');
      
    } catch (error) {
      logger.error('Failed to fix Redis issues', error);
      throw error;
    }
  }
}

export const redisHealthChecker = new RedisHealthChecker();