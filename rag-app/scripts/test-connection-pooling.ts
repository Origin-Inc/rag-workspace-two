#!/usr/bin/env tsx

/**
 * Test script for validating database connection pooling optimizations
 * Run with: npx tsx scripts/test-connection-pooling.ts
 */

import { prisma } from '../app/utils/db.server';
import { 
  getPoolStats, 
  validatePoolingMode,
  getPoolingConfig,
  buildDatabaseUrl
} from '../app/utils/db-pooling.server';
import {
  connectionPoolManager,
  withPooling,
  batchWithPooling,
  readWithPooling,
  writeWithPooling
} from '../app/services/connection-pool-manager.server';
import { DebugLogger } from '../app/utils/debug-logger';

const logger = new DebugLogger('ConnectionPoolingTest');

interface TestResult {
  test: string;
  passed: boolean;
  duration?: number;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

async function runTest(
  name: string, 
  fn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ test: name, passed: true, duration });
    console.log(`✅ ${name} (${duration}ms)`);
  } catch (error: any) {
    const duration = Date.now() - start;
    results.push({ 
      test: name, 
      passed: false, 
      duration,
      error: error.message 
    });
    console.error(`❌ ${name}: ${error.message}`);
  }
}

async function main() {
  console.log('\n🔍 Database Connection Pooling Test Suite\n');
  console.log('═'.repeat(50));
  
  // 1. Display current configuration
  console.log('\n📋 Current Configuration:');
  const config = getPoolingConfig();
  console.log(JSON.stringify(config, null, 2));
  
  const databaseUrl = buildDatabaseUrl();
  console.log('\n🔗 Database URL (masked):');
  console.log(databaseUrl.replace(/:[^:@]+@/, ':****@'));
  
  // 2. Test basic connectivity
  await runTest('Basic connectivity', async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  
  // 3. Validate pooling mode
  await runTest('Validate pooling mode', async () => {
    const validation = await validatePoolingMode(prisma);
    if (!validation.isValid) {
      throw new Error(validation.message);
    }
    console.log(`  Mode: ${validation.mode}, Port: ${validation.port}`);
  });
  
  // 4. Test connection pool stats
  await runTest('Get pool statistics', async () => {
    const stats = await getPoolStats(prisma);
    console.log(`  Active: ${stats.activeConnections}, Idle: ${stats.idleConnections}`);
    console.log(`  Total: ${stats.totalConnections}, Waiting: ${stats.waitingClients}`);
  });
  
  // 5. Test transaction mode compatibility
  if (config.port === 6543) {
    await runTest('Transaction mode - prepared statement handling', async () => {
      // This should work in transaction mode (wrapped in transaction)
      await withPooling(async (tx) => {
        const result = await tx.user.findFirst({ take: 1 });
        return result;
      });
    });
    
    await runTest('Transaction mode - direct prepared statement (should fail)', async () => {
      try {
        // This should fail in transaction mode
        await prisma.$queryRaw`PREPARE test_stmt AS SELECT 1`;
        throw new Error('Should have failed in transaction mode');
      } catch (error: any) {
        if (!error.message.includes('prepared statement')) {
          throw error;
        }
        // Expected to fail - this is correct behavior
      }
    });
  }
  
  // 6. Test connection pool manager
  await runTest('Connection pool manager - single operation', async () => {
    const result = await withPooling(async (tx) => {
      const count = await tx.user.count();
      return count;
    });
    console.log(`  User count: ${result}`);
  });
  
  // 7. Test batch operations
  await runTest('Connection pool manager - batch operations', async () => {
    const operations = [
      (tx: any) => tx.user.count(),
      (tx: any) => tx.workspace.count(),
      (tx: any) => tx.page.count(),
    ];
    
    const results = await batchWithPooling(operations, { parallel: true });
    console.log(`  Counts: Users=${results[0]}, Workspaces=${results[1]}, Pages=${results[2]}`);
  });
  
  // 8. Test read optimization
  await runTest('Optimized read query', async () => {
    const users = await readWithPooling(async (tx) => {
      return tx.user.findMany({ take: 5 });
    });
    console.log(`  Found ${users.length} users`);
  });
  
  // 9. Test concurrent connections
  await runTest('Concurrent connections stress test', async () => {
    const concurrentQueries = 20;
    const promises = [];
    
    for (let i = 0; i < concurrentQueries; i++) {
      promises.push(
        withPooling(async (tx) => {
          // Use a query that returns a value instead of pg_sleep
          const result = await tx.$queryRaw<[{now: Date}]>`
            SELECT NOW() + INTERVAL '100 milliseconds' as now
          `;
          // Small delay to simulate work
          await new Promise(resolve => setTimeout(resolve, 50));
          return i;
        })
      );
    }
    
    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;
    
    console.log(`  ${concurrentQueries} queries completed in ${duration}ms`);
    console.log(`  Average: ${Math.round(duration / concurrentQueries)}ms per query`);
    
    // Check if connections were pooled efficiently (should be less than serial time)
    const serialTime = concurrentQueries * 50; // Minimum serial execution time
    if (duration < serialTime) {
      console.log(`  ✨ Connections pooled efficiently! (${Math.round((1 - duration/serialTime) * 100)}% faster than serial)`);
    }
  });
  
  // 10. Test connection recovery
  await runTest('Connection recovery after error', async () => {
    // Force an error
    try {
      await withPooling(async (tx) => {
        await tx.$queryRaw`SELECT * FROM non_existent_table`;
      });
    } catch (error) {
      // Expected to fail
    }
    
    // Should recover and work again
    await withPooling(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
    });
  });
  
  // 11. Get final metrics
  await runTest('Connection pool metrics', async () => {
    const metrics = connectionPoolManager.getMetrics();
    console.log(`  Total Queries: ${metrics.totalQueries}`);
    console.log(`  Failed Queries: ${metrics.failedQueries}`);
    console.log(`  Avg Latency: ${metrics.avgLatency}ms`);
    console.log(`  P95 Latency: ${metrics.p95Latency}ms`);
    console.log(`  P99 Latency: ${metrics.p99Latency}ms`);
    console.log(`  Connection Errors: ${metrics.connectionErrors}`);
    console.log(`  Prepared Statement Errors: ${metrics.preparedStatementErrors}`);
  });
  
  // Print summary
  console.log('\n' + '═'.repeat(50));
  console.log('\n📊 Test Summary:\n');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total Duration: ${totalDuration}ms`);
  
  // Performance analysis
  console.log('\n🎯 Performance Analysis:');
  const poolingMode = config.port === 6543 ? 'Transaction' : 'Session';
  console.log(`Pooling Mode: ${poolingMode}`);
  console.log(`Connection Limit: ${config.connectionLimit}`);
  
  if (config.port === 6543) {
    console.log('\n✨ Transaction Mode Benefits:');
    console.log('- 10x more concurrent connections');
    console.log('- Lower memory usage per connection');
    console.log('- Better suited for serverless environments');
    console.log('- Automatic prepared statement handling');
  }
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
main().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});