/**
 * Redis Factory with fallback support
 * Allows seamless switching between local Redis and managed services
 */
import Redis from 'ioredis';
import { DebugLogger } from './debug-logger';
import { NoneRedisProvider } from './redis-none-provider';

export interface RedisProvider {
  type: 'local' | 'railway' | 'upstash' | 'redis-cloud' | 'none';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: Redis | any;
  isHealthy: () => Promise<boolean>;
  get: (key: string) => Promise<string | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (key: string, value: string, options?: any) => Promise<any>;
  del: (key: string) => Promise<number>;
  exists: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flushdb: () => Promise<any>;
  info: () => Promise<string>;
}

class LocalRedisProvider implements RedisProvider {
  type: 'local' | 'railway' = 'local';  // Can be either local or railway
  client: Redis;
  private logger = new DebugLogger('LocalRedis');
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;

  constructor(url: string) {
    // Parse URL to extract connection details
    const redisUrl = new URL(url);
    
    // Enhanced configuration for Railway $5 plan constraints
    const config = {
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port || '6379'),
      password: redisUrl.password || undefined,
      username: redisUrl.username || 'default',
      
      // Connection settings optimized for Railway $5 tier (0.1 vCPU, 300MB RAM)
      connectTimeout: 30000, // 30 seconds (increased from default 10s)
      commandTimeout: 15000, // 15 seconds per command
      
      // Retry configuration with exponential backoff
      retryStrategy: (times: number) => {
        this.reconnectAttempts = times;
        
        if (times > this.MAX_RECONNECT_ATTEMPTS) {
          this.logger.error('Max reconnection attempts reached', { attempts: times });
          return null; // Stop retrying
        }
        
        // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1.6s, 3.2s, 6.4s, 12.8s, 25.6s, 51.2s
        const delay = Math.min(100 * Math.pow(2, times - 1), 60000); // Cap at 60 seconds
        
        this.logger.warn('Redis connection lost, retrying...', { 
          attempt: times, 
          delay: `${delay}ms`,
          maxAttempts: this.MAX_RECONNECT_ATTEMPTS 
        });
        
        return delay;
      },
      
      // Connection pool settings for constrained environment
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      
      // Keep-alive to prevent connection drops
      keepAlive: 10000, // Send keep-alive every 10 seconds
      
      // Reconnection settings
      reconnectOnError: (err: Error) => {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
        return targetErrors.some(e => err.message.includes(e));
      },
      
      // Performance settings for low resources
      lazyConnect: false, // Connect immediately to detect issues early
      enableAutoPipelining: true, // Batch commands for efficiency
      autoPipeliningIgnoredCommands: ['info', 'ping'], // Don't batch health checks
    };
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.client = new Redis(config as any);
    
    // Set up event handlers for better monitoring
    this.client.on('connect', () => {
      this.logger.info('Redis connected successfully', { 
        host: redisUrl.hostname,
        reconnectAttempts: this.reconnectAttempts 
      });
      this.reconnectAttempts = 0; // Reset counter on successful connection
    });
    
    this.client.on('ready', () => {
      this.logger.info('Redis ready to accept commands');
    });
    
    this.client.on('error', (error) => {
      this.logger.error('Redis connection error', { 
        error: error.message,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        code: (error as any).code,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        syscall: (error as any).syscall
      });
    });
    
    this.client.on('close', () => {
      this.logger.warn('Redis connection closed');
    });
    
    this.client.on('reconnecting', (delay: number) => {
      this.logger.info('Redis reconnecting', { delay: `${delay}ms` });
    });
    
    this.client.on('end', () => {
      this.logger.warn('Redis connection ended');
    });
    
    this.logger.info('Initialized local Redis provider with Railway optimizations');
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Add timeout to health check for Railway's constrained environment
      const timeout = new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), 5000)
      );
      
      const response = await Promise.race([
        this.client.ping(),
        timeout
      ]);
      
      return response === 'PONG';
    } catch (error) {
      this.logger.error('Health check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        reconnectAttempts: this.reconnectAttempts 
      });
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async flushdb(): Promise<any> {
    return this.client.flushdb();
  }

  async info(): Promise<string> {
    return this.client.info();
  }
}

class UpstashRedisProvider implements RedisProvider {
  type = 'upstash' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  private logger = new DebugLogger('UpstashRedis');
  private restUrl: string;
  private restToken: string;

  constructor(restUrl: string, restToken: string) {
    this.restUrl = restUrl;
    this.restToken = restToken;
    this.logger.info('Initialized Upstash Redis provider');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // Auto-detect provider based on available environment variables
    let provider = process.env['REDIS_PROVIDER'];
    
    // If no provider specified, auto-detect based on available URLs
    if (!provider) {
      if (process.env['REDIS_URL']) {
        provider = 'railway'; // Use Railway Redis if URL is available
      } else if (process.env['UPSTASH_REDIS_REST_URL']) {
        provider = 'upstash';
      } else {
        provider = 'none'; // No Redis configured
      }
    }
    
    try {
      // Initialize primary provider
      if (provider === 'none') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.provider = new NoneRedisProvider() as any;
        this.logger.info('Redis disabled - using no-op provider');
        return; // No need for health checks or monitoring
      } else if (provider === 'upstash' && process.env['UPSTASH_REDIS_REST_URL']) {
        this.provider = new UpstashRedisProvider(
          process.env['UPSTASH_REDIS_REST_URL'],
          process.env['UPSTASH_REDIS_REST_TOKEN']!
        );
      } else if ((provider === 'railway' || provider === 'local' || provider === 'redis-cloud') && process.env['REDIS_URL']) {
        const localProvider = new LocalRedisProvider(process.env['REDIS_URL']);
        // Set type to 'railway' when using Railway Redis
        if (provider === 'railway') {
          localProvider.type = 'railway';
        }
        this.provider = localProvider;
      } else {
        // Fall back to none provider if no Redis configured
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.provider = new NoneRedisProvider() as any;
        this.logger.warn('No Redis configuration found - using no-op provider');
        return;
      }

      // Check if primary is healthy
      const isHealthy = await this.provider.isHealthy();
      if (!isHealthy) {
        throw new Error('Primary Redis provider is not healthy');
      }

      this.logger.info(`Primary Redis provider initialized: ${provider}`, {
        url: provider === 'railway' || provider === 'local' ? process.env['REDIS_URL']?.split('@')[1] : 'N/A'
      });

      // Initialize fallback if configured
      if (provider === 'local' && process.env['UPSTASH_REDIS_REST_URL']) {
        this.fallbackProvider = new UpstashRedisProvider(
          process.env['UPSTASH_REDIS_REST_URL'],
          process.env['UPSTASH_REDIS_REST_TOKEN']!
        );
        this.logger.info('Fallback Redis provider initialized: upstash');
      } else if (provider === 'upstash' && process.env['REDIS_URL']) {
        this.fallbackProvider = new LocalRedisProvider(process.env['REDIS_URL']);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getClient(options?: { workerMode?: boolean }): Redis | any {
    const provider = this.getProvider();
    
    if (provider.type === 'none') {
      // Return the none provider itself as it implements all needed methods
      return provider;
    }
    
    if (provider.type === 'local') {
      if (options?.workerMode && process.env['REDIS_URL']) {
        // Parse Redis URL for worker connection
        const redisUrl = new URL(process.env['REDIS_URL']);
        
        // Create a new connection for workers with Railway-optimized config
        const workerConfig = {
          host: redisUrl.hostname,
          port: parseInt(redisUrl.port || '6379'),
          password: redisUrl.password || undefined,
          username: redisUrl.username || 'default',
          
          // Worker-specific settings for Railway $5 tier
          maxRetriesPerRequest: null, // Workers need persistent retries
          enableReadyCheck: true,
          connectTimeout: 30000, // 30 seconds
          commandTimeout: 15000, // 15 seconds
          keepAlive: 10000, // Keep connection alive
          
          // Retry strategy for workers
          retryStrategy: (times: number) => {
            if (times > 20) { // Workers can retry more
              this.logger.error('Worker Redis max retries reached', { attempts: times });
              return null;
            }
            const delay = Math.min(500 * Math.pow(1.5, times - 1), 30000);
            this.logger.warn('Worker Redis reconnecting', { attempt: times, delay });
            return delay;
          },
          
          reconnectOnError: (err: Error) => {
            const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
            return targetErrors.some(e => err.message.includes(e));
          },
          
          // Performance optimizations
          enableAutoPipelining: true,
          autoPipeliningIgnoredCommands: ['blpop', 'brpop'], // Don't pipeline blocking commands
        };
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Redis(workerConfig as any);
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