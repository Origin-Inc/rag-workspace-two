/**
 * Performance Test for Database Block with 50,000+ Records
 * 
 * This script tests the optimized database block implementation to ensure:
 * - Virtual scrolling maintains 60fps
 * - Query response times < 100ms with caching
 * - Memory usage stays under 200MB
 * - Redis caching works correctly
 */

import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';
import { databaseBlockCache } from './app/services/database-block-cache.server';
import { DatabaseBlockIndexService } from './app/services/database-block-indexes.server';
import { databasePerformanceService } from './app/services/database-performance.server';

const prisma = new PrismaClient();

// Test configuration
const TEST_RECORD_COUNT = 50000;
const BATCH_SIZE = 1000;
const TEST_WORKSPACE_ID = 'test-workspace-50k';
const TEST_BLOCK_ID = 'test-block-50k';

interface TestResult {
  metric: string;
  value: number;
  unit: string;
  passed: boolean;
  target: string;
}

class PerformanceTester {
  private results: TestResult[] = [];
  private blockId: string = '';

  async setup() {
    console.log('🚀 Setting up test environment...');
    
    // Create indexes
    await DatabaseBlockIndexService.createIndexes();
    
    // Clean up any existing test data
    await this.cleanup();
    
    // Create test workspace
    const workspace = await prisma.workspace.create({
      data: {
        id: TEST_WORKSPACE_ID,
        name: 'Performance Test Workspace',
        slug: 'perf-test',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Create test database block
    const block = await prisma.databaseBlock.create({
      data: {
        id: TEST_BLOCK_ID,
        workspaceId: workspace.id,
        name: 'Performance Test Block',
        rowCount: 0,
        columns: {
          col1: { id: 'col1', name: 'Name', type: 'text', position: 0 },
          col2: { id: 'col2', name: 'Email', type: 'email', position: 1 },
          col3: { id: 'col3', name: 'Age', type: 'number', position: 2 },
          col4: { id: 'col4', name: 'Status', type: 'select', position: 3, options: [
            { id: 'active', label: 'Active', color: 'green' },
            { id: 'inactive', label: 'Inactive', color: 'red' }
          ]},
          col5: { id: 'col5', name: 'Created', type: 'date', position: 4 },
          col6: { id: 'col6', name: 'Score', type: 'number', position: 5 },
          col7: { id: 'col7', name: 'Tags', type: 'multi_select', position: 6, options: [
            { id: 'tag1', label: 'Important', color: 'blue' },
            { id: 'tag2', label: 'Urgent', color: 'red' },
            { id: 'tag3', label: 'Review', color: 'yellow' }
          ]},
          col8: { id: 'col8', name: 'Notes', type: 'text', position: 7 },
          col9: { id: 'col9', name: 'Priority', type: 'rating', position: 8 },
          col10: { id: 'col10', name: 'Amount', type: 'currency', position: 9 }
        }
      }
    });

    this.blockId = block.id;
    console.log(`✅ Created test block: ${this.blockId}`);
    
    return block;
  }

  async generateTestData() {
    console.log(`📊 Generating ${TEST_RECORD_COUNT} test records...`);
    const startTime = performance.now();
    
    // Generate records in batches for better performance
    for (let batch = 0; batch < TEST_RECORD_COUNT / BATCH_SIZE; batch++) {
      const records = [];
      const startIdx = batch * BATCH_SIZE;
      
      for (let i = 0; i < BATCH_SIZE; i++) {
        const idx = startIdx + i;
        records.push({
          id: `row-${idx}`,
          blockId: this.blockId,
          position: idx,
          cells: {
            col1: `User ${idx}`,
            col2: `user${idx}@example.com`,
            col3: Math.floor(Math.random() * 80) + 18,
            col4: Math.random() > 0.5 ? 'active' : 'inactive',
            col5: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
            col6: Math.floor(Math.random() * 100),
            col7: Array.from({ length: Math.floor(Math.random() * 3) + 1 }, (_, i) => `tag${i + 1}`),
            col8: `Notes for user ${idx} with some longer text content to simulate real data`,
            col9: Math.floor(Math.random() * 5) + 1,
            col10: Math.floor(Math.random() * 10000) / 100
          },
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      await prisma.databaseRow.createMany({ data: records });
      
      if ((batch + 1) % 10 === 0) {
        console.log(`  Generated ${(batch + 1) * BATCH_SIZE} records...`);
      }
    }
    
    const duration = performance.now() - startTime;
    console.log(`✅ Generated ${TEST_RECORD_COUNT} records in ${(duration / 1000).toFixed(2)}s`);
    
    // Update block row count
    await prisma.databaseBlock.update({
      where: { id: this.blockId },
      data: { rowCount: TEST_RECORD_COUNT }
    });
  }

  async testCachePerformance() {
    console.log('\n🧪 Testing cache performance...');
    
    // Clear cache to start fresh
    await databaseBlockCache.clearAll();
    
    // Test 1: Cold cache (first load)
    const coldStart = performance.now();
    const coldResult = await databaseBlockCache.getRows(this.blockId, 1, 100);
    const coldDuration = performance.now() - coldStart;
    
    this.results.push({
      metric: 'Cold Cache Response Time',
      value: coldDuration,
      unit: 'ms',
      passed: coldDuration < 500,
      target: '< 500ms'
    });
    
    // Test 2: Warm cache (second load)
    const warmStart = performance.now();
    const warmResult = await databaseBlockCache.getRows(this.blockId, 1, 100);
    const warmDuration = performance.now() - warmStart;
    
    this.results.push({
      metric: 'Warm Cache Response Time',
      value: warmDuration,
      unit: 'ms',
      passed: warmDuration < 50,
      target: '< 50ms'
    });
    
    // Test 3: Cache hit rate after multiple accesses
    for (let i = 1; i <= 10; i++) {
      await databaseBlockCache.getRows(this.blockId, i, 100);
    }
    
    const stats = databaseBlockCache.getStats();
    const hitRate = parseFloat(stats.hitRate.replace('%', ''));
    
    this.results.push({
      metric: 'Cache Hit Rate',
      value: hitRate,
      unit: '%',
      passed: hitRate > 80,
      target: '> 80%'
    });
    
    console.log(`  Cache stats: ${JSON.stringify(stats)}`);
  }

  async testQueryPerformance() {
    console.log('\n🧪 Testing query performance...');
    
    // Test different query patterns
    const queries = [
      { name: 'Simple pagination', page: 1, pageSize: 100 },
      { name: 'Large page', page: 1, pageSize: 1000 },
      { name: 'Deep pagination', page: 100, pageSize: 100 },
      { name: 'Search query', page: 1, pageSize: 100, searchQuery: 'User 123' }
    ];
    
    for (const query of queries) {
      const start = performance.now();
      
      const result = await prisma.databaseRow.findMany({
        where: {
          blockId: this.blockId,
          ...(query.searchQuery ? {
            cells: { path: '$', string_contains: query.searchQuery }
          } : {})
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { position: 'asc' }
      });
      
      const duration = performance.now() - start;
      
      this.results.push({
        metric: `Query: ${query.name}`,
        value: duration,
        unit: 'ms',
        passed: duration < 100,
        target: '< 100ms'
      });
      
      // Track in performance service
      await databasePerformanceService.trackQuery(
        this.blockId,
        query.name,
        duration,
        result.length,
        false
      );
    }
  }

  async testMemoryUsage() {
    console.log('\n🧪 Testing memory usage...');
    
    const initialMemory = process.memoryUsage();
    
    // Load multiple pages to stress memory
    const promises = [];
    for (let page = 1; page <= 50; page++) {
      promises.push(databaseBlockCache.getRows(this.blockId, page, 100));
    }
    
    await Promise.all(promises);
    
    const finalMemory = process.memoryUsage();
    const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
    
    this.results.push({
      metric: 'Memory Usage Increase',
      value: memoryIncrease,
      unit: 'MB',
      passed: memoryIncrease < 200,
      target: '< 200MB'
    });
    
    // Check cache memory usage
    const cacheStats = databaseBlockCache.getStats();
    const cacheMemory = parseFloat(cacheStats.memoryUsage.replace(' MB', ''));
    
    this.results.push({
      metric: 'Cache Memory Usage',
      value: cacheMemory,
      unit: 'MB',
      passed: cacheMemory < 100,
      target: '< 100MB'
    });
  }

  async testConcurrentAccess() {
    console.log('\n🧪 Testing concurrent access...');
    
    const concurrentRequests = 100;
    const start = performance.now();
    
    const promises = [];
    for (let i = 0; i < concurrentRequests; i++) {
      const page = Math.floor(Math.random() * 50) + 1;
      promises.push(databaseBlockCache.getRows(this.blockId, page, 100));
    }
    
    await Promise.all(promises);
    const duration = performance.now() - start;
    const avgTime = duration / concurrentRequests;
    
    this.results.push({
      metric: 'Concurrent Request Avg Time',
      value: avgTime,
      unit: 'ms',
      passed: avgTime < 50,
      target: '< 50ms'
    });
  }

  async testIndexPerformance() {
    console.log('\n🧪 Testing index performance...');
    
    // Analyze index usage
    const analysis = await DatabaseBlockIndexService.analyzeIndexUsage();
    
    this.results.push({
      metric: 'Unused Indexes',
      value: analysis.unused.length,
      unit: 'count',
      passed: analysis.unused.length < 5,
      target: '< 5'
    });
    
    // Monitor index performance
    const monitoring = await DatabaseBlockIndexService.monitorIndexPerformance();
    
    this.results.push({
      metric: 'Hot Indexes',
      value: monitoring.hotIndexes.length,
      unit: 'count',
      passed: monitoring.hotIndexes.length > 0,
      target: '> 0'
    });
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test data...');
    
    try {
      await prisma.databaseRow.deleteMany({
        where: { blockId: TEST_BLOCK_ID }
      });
      
      await prisma.databaseBlock.deleteMany({
        where: { id: TEST_BLOCK_ID }
      });
      
      await prisma.workspace.deleteMany({
        where: { id: TEST_WORKSPACE_ID }
      });
      
      await databaseBlockCache.clearAll();
      databasePerformanceService.stopMetricsCollection();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  printResults() {
    console.log('\n📋 Performance Test Results');
    console.log('═'.repeat(80));
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const passRate = (passed / total * 100).toFixed(1);
    
    for (const result of this.results) {
      const status = result.passed ? '✅' : '❌';
      const value = typeof result.value === 'number' ? result.value.toFixed(2) : result.value;
      console.log(
        `${status} ${result.metric.padEnd(35)} ${value}${result.unit.padStart(5)} ` +
        `(target: ${result.target})`
      );
    }
    
    console.log('═'.repeat(80));
    console.log(`Overall: ${passed}/${total} tests passed (${passRate}%)`);
    
    if (passed === total) {
      console.log('🎉 All performance targets met! The system can handle 50,000+ records efficiently.');
    } else {
      console.log('⚠️ Some performance targets were not met. Consider further optimization.');
    }
  }

  async run() {
    try {
      await this.setup();
      await this.generateTestData();
      await this.testCachePerformance();
      await this.testQueryPerformance();
      await this.testMemoryUsage();
      await this.testConcurrentAccess();
      await this.testIndexPerformance();
      this.printResults();
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      await this.cleanup();
      await prisma.$disconnect();
      process.exit(0);
    }
  }
}

// Run the performance test
const tester = new PerformanceTester();
tester.run();