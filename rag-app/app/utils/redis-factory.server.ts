/**
 * Redis Factory with fallback support
 * Allows seamless switching between local Redis and managed services
 */
import Redis from 'ioredis';
import { DebugLogger } from './debug-logger';

export interface RedisProvider {
  type: 'local' | 'upstash' | 'redis-cloud';
  client: Redis | any;
  isHealthy: () => Promise<boolean>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options?: any) => Promise<any>;
  del: (key: string) => Promise<number>;
  exists: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  flushdb: () => Promise<any>;
  info: () => Promise<string>;
}

class LocalRedisProvider implements RedisProvider {
  type: 'local' = 'local';
  client: Redis;
  private logger = new DebugLogger('LocalRedis');

  constructor(url: string) {
    this.client = new Redis(url);
    this.logger.info('Initialized local Redis provider');
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.ping();
      return response === 'PONG';
    } catch (error) {
      this.logger.error('Health check failed', error);
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, options?: any): Promise<any> {
    if (options?.ex) {
      return this.client.set(key, value, 'EX', options.ex);
    }
    return this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async flushdb(): Promise<any> {
    return this.client.flushdb();
  }

  async info(): Promise<string> {
    return this.client.info();
  }
}

class UpstashRedisProvider implements RedisProvider {
  type: 'upstash' = 'upstash';
  client: any;
  private logger = new DebugLogger('UpstashRedis');
  private restUrl: string;
  private restToken: string;

  constructor(restUrl: string, restToken: string) {
    this.restUrl = restUrl;
    this.restToken = restToken;
    this.logger.info('Initialized Upstash Redis provider');
  }

  private async makeRequest(command: string[], method = 'POST'): Promise<any> {
    const url = `${this.restUrl}/${method === 'GET' ? command.join('/') : ''}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.restToken}`,
        'Content-Type': 'application/json',
      },
      body: method === 'POST' ? JSON.stringify(command) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Upstash request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.makeRequest(['PING']);
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Health check failed', error);
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      const result = await this.makeRequest(['GET', key]);
      return result;
    } catch (error) {
      this.logger.error('GET failed', { key, error });
      return null;
    }
  }

  async set(key: string, value: string, options?: any): Promise<any> {
    try {
      const command = ['SET', key, value];
      if (options?.ex) {
        command.push('EX', options.ex.toString());
      }
      return await this.makeRequest(command);
    } catch (error) {
      this.logger.error('SET failed', { key, error });
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    try {
      const result = await this.makeRequest(['DEL', key]);
      return result;
    } catch (error) {
      this.logger.error('DEL failed', { key, error });
      return 0;
    }
  }

  async exists(key: string): Promise<number> {
    try {
      const result = await this.makeRequest(['EXISTS', key]);
      return result;
    } catch (error) {
      this.logger.error('EXISTS failed', { key, error });
      return 0;
    }
  }

  async expire(key: string, seconds: number): Promise<number> {
    try {
      const result = await this.makeRequest(['EXPIRE', key, seconds.toString()]);
      return result;
    } catch (error) {
      this.logger.error('EXPIRE failed', { key, error });
      return 0;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const result = await this.makeRequest(['TTL', key]);
      return result;
    } catch (error) {
      this.logger.error('TTL failed', { key, error });
      return -2;
    }
  }

  async flushdb(): Promise<any> {
    try {
      return await this.makeRequest(['FLUSHDB']);
    } catch (error) {
      this.logger.error('FLUSHDB failed', error);
      throw error;
    }
  }

  async info(): Promise<string> {
    try {
      const result = await this.makeRequest(['INFO']);
      return result;
    } catch (error) {
      this.logger.error('INFO failed', error);
      return '';
    }
  }
}

export class RedisFactory {
  private static instance: RedisFactory;
  private provider: RedisProvider | null = null;
  private fallbackProvider: RedisProvider | null = null;
  private logger = new DebugLogger('RedisFactory');
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isUsingFallback = false;

  private constructor() {}

  static getInstance(): RedisFactory {
    if (!RedisFactory.instance) {
      RedisFactory.instance = new RedisFactory();
    }
    return RedisFactory.instance;
  }

  /**
   * Initialize Redis with primary and optional fallback providers
   */
  async initialize(): Promise<void> {
    const provider = process.env.REDIS_PROVIDER || 'local';
    
    try {
      // Initialize primary provider
      if (provider === 'upstash' && process.env.UPSTASH_REDIS_REST_URL) {
        this.provider = new UpstashRedisProvider(
          process.env.UPSTASH_REDIS_REST_URL,
          process.env.UPSTASH_REDIS_REST_TOKEN!
        );
      } else if (process.env.REDIS_URL) {
        this.provider = new LocalRedisProvider(process.env.REDIS_URL);
      } else {
        throw new Error('No Redis configuration found');
      }

      // Check if primary is healthy
      const isHealthy = await this.provider.isHealthy();
      if (!isHealthy) {
        throw new Error('Primary Redis provider is not healthy');
      }

      this.logger.info(`Primary Redis provider initialized: ${provider}`);

      // Initialize fallback if configured
      if (provider === 'local' && process.env.UPSTASH_REDIS_REST_URL) {
        this.fallbackProvider = new UpstashRedisProvider(
          process.env.UPSTASH_REDIS_REST_URL,
          process.env.UPSTASH_REDIS_REST_TOKEN!
        );
        this.logger.info('Fallback Redis provider initialized: upstash');
      } else if (provider === 'upstash' && process.env.REDIS_URL) {
        this.fallbackProvider = new LocalRedisProvider(process.env.REDIS_URL);
        this.logger.info('Fallback Redis provider initialized: local');
      }

      // Start health monitoring
      this.startHealthMonitoring();
      
    } catch (error) {
      this.logger.error('Failed to initialize Redis', error);
      
      // Try fallback
      if (this.fallbackProvider) {
        const fallbackHealthy = await this.fallbackProvider.isHealthy();
        if (fallbackHealthy) {
          this.logger.warn('Switching to fallback Redis provider');
          this.provider = this.fallbackProvider;
          this.fallbackProvider = null;
          this.isUsingFallback = true;
        } else {
          throw new Error('Both primary and fallback Redis providers failed');
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Get the current Redis provider
   */
  getProvider(): RedisProvider {
    if (!this.provider) {
      throw new Error('Redis not initialized. Call initialize() first.');
    }
    return this.provider;
  }

  /**
   * Get a Redis client for specific use cases (e.g., BullMQ)
   */
  getClient(options?: { workerMode?: boolean }): Redis | any {
    const provider = this.getProvider();
    
    if (provider.type === 'local') {
      if (options?.workerMode) {
        // Create a new connection for workers with proper config
        const workerConfig = {
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          reconnectOnError: (err: Error) => {
            return err.message.includes('READONLY');
          }
        };
        return new Redis(process.env.REDIS_URL!, workerConfig);
      }
      return provider.client;
    }
    
    // For Upstash, return a compatible interface
    return provider;
  }

  /**
   * Switch to fallback provider
   */
  private async switchToFallback(): Promise<void> {
    if (!this.fallbackProvider) {
      this.logger.error('No fallback provider available');
      return;
    }

    const isHealthy = await this.fallbackProvider.isHealthy();
    if (isHealthy) {
      this.logger.warn('Switching to fallback Redis provider');
      const temp = this.provider;
      this.provider = this.fallbackProvider;
      this.fallbackProvider = temp;
      this.isUsingFallback = !this.isUsingFallback;
    } else {
      this.logger.error('Fallback provider is also unhealthy');
    }
  }

  /**
   * Monitor Redis health and switch if needed
   */
  private startHealthMonitoring(): void {
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      if (!this.provider) return;

      const isHealthy = await this.provider.isHealthy();
      if (!isHealthy) {
        this.logger.error('Primary Redis provider unhealthy, attempting fallback');
        await this.switchToFallback();
      } else if (this.isUsingFallback && this.fallbackProvider) {
        // Check if we can switch back to primary
        const primaryHealthy = await this.fallbackProvider.isHealthy();
        if (primaryHealthy) {
          this.logger.info('Primary Redis provider recovered, switching back');
          await this.switchToFallback();
        }
      }
    }, 30000);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.provider?.type === 'local') {
      await (this.provider.client as Redis).quit();
    }
    
    if (this.fallbackProvider?.type === 'local') {
      await (this.fallbackProvider as LocalRedisProvider).client.quit();
    }
  }

  /**
   * Get current provider status
   */
  getStatus(): { 
    primary: string; 
    fallback: string | null; 
    isUsingFallback: boolean;
    isHealthy: boolean;
  } {
    return {
      primary: this.provider?.type || 'none',
      fallback: this.fallbackProvider?.type || null,
      isUsingFallback: this.isUsingFallback,
      isHealthy: !!this.provider,
    };
  }
}

// Export singleton instance
export const redisFactory = RedisFactory.getInstance();