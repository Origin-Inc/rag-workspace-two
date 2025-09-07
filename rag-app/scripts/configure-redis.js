#!/usr/bin/env node

/**
 * Configure Redis for Railway $5 plan constraints
 * This script applies memory limits and optimizations at runtime
 */

const Redis = require('ioredis');

async function configureRedis() {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.log('No REDIS_URL found, skipping Redis configuration');
    return;
  }
  
  // Check if we're on Railway
  if (!process.env.RAILWAY_ENVIRONMENT) {
    console.log('Not running on Railway, skipping Redis configuration');
    return;
  }
  
  console.log('Configuring Redis for Railway $5 plan...');
  
  const url = new URL(redisUrl);
  const client = new Redis({
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    password: url.password || undefined,
    username: url.username || 'default',
    connectTimeout: 30000,
    commandTimeout: 15000,
    retryStrategy: (times) => {
      if (times > 5) return null;
      return Math.min(times * 1000, 5000);
    }
  });
  
  try {
    // Apply memory configuration
    const configs = [
      // Memory limit - 250MB out of 300MB available
      ['CONFIG', 'SET', 'maxmemory', '250mb'],
      
      // LRU eviction policy - remove least recently used keys when full
      ['CONFIG', 'SET', 'maxmemory-policy', 'allkeys-lru'],
      
      // Disable persistence to save memory
      ['CONFIG', 'SET', 'save', ''],
      
      // Performance optimizations for low resources
      ['CONFIG', 'SET', 'timeout', '300'],
      ['CONFIG', 'SET', 'tcp-keepalive', '60'],
      ['CONFIG', 'SET', 'tcp-backlog', '511'],
      ['CONFIG', 'SET', 'databases', '1'],
      ['CONFIG', 'SET', 'hz', '10'],
      
      // Disable expensive operations
      ['CONFIG', 'SET', 'stop-writes-on-bgsave-error', 'no'],
      ['CONFIG', 'SET', 'rdbcompression', 'no'],
      ['CONFIG', 'SET', 'rdbchecksum', 'no'],
      
      // Memory optimization
      ['CONFIG', 'SET', 'lazyfree-lazy-eviction', 'yes'],
      ['CONFIG', 'SET', 'lazyfree-lazy-expire', 'yes'],
      ['CONFIG', 'SET', 'lazyfree-lazy-server-del', 'yes'],
      
      // Logging
      ['CONFIG', 'SET', 'loglevel', 'warning'],
    ];
    
    for (const config of configs) {
      try {
        await client.call(...config);
        console.log(`✅ Applied: ${config[2]} = ${config[3]}`);
      } catch (error) {
        // Some configs might not be allowed in managed Redis
        console.warn(`⚠️ Could not apply ${config[2]}: ${error.message}`);
      }
    }
    
    // Get current memory usage
    const info = await client.info('memory');
    const memoryUsed = info.match(/used_memory_human:([^\r\n]+)/)?.[1];
    console.log(`\n📊 Current memory usage: ${memoryUsed || 'unknown'}`);
    
    // Test the configuration
    await client.set('test:config', 'ok', 'EX', 10);
    const testValue = await client.get('test:config');
    if (testValue === 'ok') {
      console.log('✅ Redis configuration successful');
    }
    
    await client.quit();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Failed to configure Redis:', error.message);
    await client.quit();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  configureRedis().catch(console.error);
}

module.exports = { configureRedis };