/**
 * No-op Redis provider for when Redis is disabled or failing
 * Allows the app to work without caching
 */
export class NoneRedisProvider {
  type: 'none' = 'none';
  
  async isHealthy(): Promise<boolean> {
    return true; // Always healthy since it doesn't do anything
  }
  
  async get(key: string): Promise<string | null> {
    return null; // No caching
  }
  
  async set(key: string, value: string, options?: any): Promise<any> {
    return 'OK'; // Pretend it worked
  }
  
  async del(key: string): Promise<number> {
    return 1; // Pretend we deleted something
  }
  
  async exists(key: string): Promise<number> {
    return 0; // Nothing exists
  }
  
  async expire(key: string, seconds: number): Promise<number> {
    return 1; // Pretend it worked
  }
  
  async ttl(key: string): Promise<number> {
    return -2; // Key doesn't exist
  }
  
  async flushdb(): Promise<any> {
    return 'OK'; // Nothing to flush
  }
  
  async info(): Promise<string> {
    return 'redis_version:none\r\nredis_mode:disabled';
  }
  
  async mget(...keys: string[]): Promise<(string | null)[]> {
    return keys.map(() => null);
  }
  
  async ping(): Promise<string> {
    return 'PONG';
  }
}