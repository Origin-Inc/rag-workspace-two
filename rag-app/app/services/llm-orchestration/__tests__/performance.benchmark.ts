/**
 * Performance Benchmark Tests for LLM Orchestration Layer
 * 
 * Requirements:
 * - Sub-2 second response time for standard queries
 * - Handle 100+ concurrent requests
 * - Cache hit ratio > 80% for repeated queries
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LLMOrchestrator } from '../orchestrator.server';
import { mockWorkspaces } from '../__mocks__/supabase.mock';

describe('LLM Orchestration Performance Benchmarks', () => {
  let orchestrator: LLMOrchestrator;
  
  beforeAll(() => {
    orchestrator = new LLMOrchestrator({
      enabled: true,
      ttl: 300, // 5 minutes
      maxSize: 100
    });
  });
  
  afterAll(() => {
    orchestrator.clearCache();
  });
  
  describe('Response Time Requirements', () => {
    it('should meet sub-2 second requirement for data queries', async () => {
      const queries = [
        'show my tasks',
        'list pending items with high priority',
        'show completed tasks from this week',
        'display all assigned tasks'
      ];
      
      for (const query of queries) {
        const startTime = Date.now();
        
        const result = await orchestrator.processQuery(
          query,
          mockWorkspaces[0].id,
          'test-user-id'
        );
        
        const duration = Date.now() - startTime;
        
        expect(result.success).toBe(true);
        expect(duration).toBeLessThan(2000);
        expect(result.performance.totalTime).toBeLessThan(2000);
        
        console.log(`Query: "${query}" - Time: ${duration}ms`);
      }
    });
    
    it('should meet sub-2 second requirement for content search', async () => {
      const queries = [
        'find documentation about authentication',
        'search for API reference',
        'locate setup guide'
      ];
      
      for (const query of queries) {
        const startTime = Date.now();
        
        const result = await orchestrator.processQuery(
          query,
          mockWorkspaces[0].id,
          'test-user-id'
        );
        
        const duration = Date.now() - startTime;
        
        expect(duration).toBeLessThan(2000);
        console.log(`Search: "${query}" - Time: ${duration}ms`);
      }
    });
    
    it('should meet sub-2 second requirement for analytics', async () => {
      const queries = [
        'show revenue trends',
        'analyze task completion rates',
        'compare this month to last month'
      ];
      
      for (const query of queries) {
        const startTime = Date.now();
        
        const result = await orchestrator.processQuery(
          query,
          mockWorkspaces[0].id,
          'test-user-id'
        );
        
        const duration = Date.now() - startTime;
        
        expect(duration).toBeLessThan(2000);
        console.log(`Analytics: "${query}" - Time: ${duration}ms`);
      }
    });
  });
  
  describe('Concurrent Request Handling', () => {
    it('should handle 10 concurrent requests efficiently', async () => {
      const queries = Array(10).fill('show my tasks').map((q, i) => `${q} ${i}`);
      
      const startTime = Date.now();
      
      const results = await Promise.all(
        queries.map(q => orchestrator.processQuery(
          q,
          mockWorkspaces[0].id,
          'test-user-id'
        ))
      );
      
      const duration = Date.now() - startTime;
      
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      
      // Should complete all 10 in under 5 seconds
      expect(duration).toBeLessThan(5000);
      
      const avgTime = duration / 10;
      console.log(`10 concurrent requests - Total: ${duration}ms, Avg: ${avgTime}ms`);
    });
    
    it('should handle 50 concurrent requests', async () => {
      const queries = Array(50).fill(null).map((_, i) => {
        const types = ['show tasks', 'find docs', 'analytics', 'summary'];
        return `${types[i % 4]} query ${i}`;
      });
      
      const startTime = Date.now();
      
      const results = await Promise.all(
        queries.map(q => orchestrator.processQuery(
          q,
          mockWorkspaces[0].id,
          'test-user-id'
        ))
      );
      
      const duration = Date.now() - startTime;
      
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(45); // Allow some failures under load
      
      console.log(`50 concurrent requests - Time: ${duration}ms, Success: ${successCount}/50`);
    });
    
    it('should handle 100 concurrent requests with graceful degradation', async () => {
      const queries = Array(100).fill(null).map((_, i) => `query ${i}`);
      
      const startTime = Date.now();
      let completed = 0;
      let failed = 0;
      
      const results = await Promise.allSettled(
        queries.map(async (q) => {
          try {
            const result = await orchestrator.processQuery(
              q,
              mockWorkspaces[0].id,
              'test-user-id',
              { maxResponseTime: 5000 }
            );
            completed++;
            return result;
          } catch (error) {
            failed++;
            throw error;
          }
        })
      );
      
      const duration = Date.now() - startTime;
      
      const fulfilled = results.filter(r => r.status === 'fulfilled').length;
      
      console.log(`100 concurrent requests - Time: ${duration}ms, Success: ${fulfilled}/100`);
      
      // Should handle at least 80% successfully
      expect(fulfilled).toBeGreaterThan(80);
    });
  });
  
  describe('Cache Performance', () => {
    it('should achieve >80% cache hit ratio for repeated queries', async () => {
      const uniqueQueries = [
        'show my tasks',
        'find documentation',
        'revenue analytics',
        'project summary'
      ];
      
      // Clear cache first
      orchestrator.clearCache();
      
      let cacheHits = 0;
      let totalQueries = 0;
      
      // First pass - all cache misses
      for (const query of uniqueQueries) {
        const result = await orchestrator.processQuery(
          query,
          mockWorkspaces[0].id,
          'test-user-id'
        );
        totalQueries++;
      }
      
      // Repeat queries 5 times - should all be cache hits
      for (let i = 0; i < 5; i++) {
        for (const query of uniqueQueries) {
          const startTime = Date.now();
          
          const result = await orchestrator.processQuery(
            query,
            mockWorkspaces[0].id,
            'test-user-id'
          );
          
          const duration = Date.now() - startTime;
          
          // Cached responses should be very fast (<10ms)
          if (duration < 10) {
            cacheHits++;
          }
          totalQueries++;
        }
      }
      
      const hitRatio = cacheHits / (totalQueries - uniqueQueries.length);
      console.log(`Cache hit ratio: ${(hitRatio * 100).toFixed(1)}% (${cacheHits}/${totalQueries - uniqueQueries.length})`);
      
      expect(hitRatio).toBeGreaterThan(0.8);
    });
    
    it('should show significant speed improvement with caching', async () => {
      const query = 'complex data analysis query';
      
      // First call - no cache
      const start1 = Date.now();
      await orchestrator.processQuery(
        query,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      const time1 = Date.now() - start1;
      
      // Second call - should use cache
      const start2 = Date.now();
      await orchestrator.processQuery(
        query,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      const time2 = Date.now() - start2;
      
      const speedup = time1 / time2;
      console.log(`Cache speedup: ${speedup.toFixed(1)}x (${time1}ms → ${time2}ms)`);
      
      // Should be at least 10x faster with cache
      expect(speedup).toBeGreaterThan(10);
    });
  });
  
  describe('Memory Usage', () => {
    it('should maintain reasonable memory footprint', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Process 100 unique queries
      for (let i = 0; i < 100; i++) {
        await orchestrator.processQuery(
          `unique query ${i}`,
          mockWorkspaces[0].id,
          'test-user-id'
        );
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
      
      console.log(`Memory increase after 100 queries: ${memoryIncrease.toFixed(2)} MB`);
      
      // Should not exceed 100MB for 100 queries
      expect(memoryIncrease).toBeLessThan(100);
    });
    
    it('should respect cache size limits', async () => {
      const stats = orchestrator.getCacheStats();
      
      // Fill cache beyond limit
      for (let i = 0; i < stats.maxSize + 20; i++) {
        await orchestrator.processQuery(
          `cache test ${i}`,
          mockWorkspaces[0].id,
          'test-user-id'
        );
      }
      
      const finalStats = orchestrator.getCacheStats();
      
      console.log(`Cache size: ${finalStats.size}/${finalStats.maxSize}`);
      
      // Should not exceed max size
      expect(finalStats.size).toBeLessThanOrEqual(finalStats.maxSize);
    });
  });
  
  describe('Pipeline Stage Performance', () => {
    it('should measure individual stage timings', async () => {
      const result = await orchestrator.processQuery(
        'show tasks and analyze trends with documentation',
        mockWorkspaces[0].id,
        'test-user-id',
        { includeDebug: true }
      );
      
      const perf = result.performance;
      
      console.log('Pipeline Stage Timings:');
      console.log(`- Intent Classification: ${perf.intentClassificationTime}ms`);
      console.log(`- Context Extraction: ${perf.contextExtractionTime}ms`);
      console.log(`- Query Routing: ${perf.routingTime}ms`);
      console.log(`- Query Execution: ${perf.executionTime}ms`);
      console.log(`- Output Structuring: ${perf.structuringTime}ms`);
      console.log(`- Total: ${perf.totalTime}ms`);
      
      // Each stage should be reasonably fast
      expect(perf.intentClassificationTime).toBeLessThan(500);
      expect(perf.contextExtractionTime).toBeLessThan(500);
      expect(perf.routingTime).toBeLessThan(100);
      expect(perf.executionTime).toBeLessThan(1000);
      expect(perf.structuringTime).toBeLessThan(500);
    });
  });
  
  describe('Load Testing', () => {
    it('should sustain performance under continuous load', async () => {
      const duration = 5000; // 5 seconds
      const startTime = Date.now();
      let requestCount = 0;
      let successCount = 0;
      const responseTimes: number[] = [];
      
      while (Date.now() - startTime < duration) {
        const reqStart = Date.now();
        
        try {
          const result = await orchestrator.processQuery(
            `load test query ${requestCount}`,
            mockWorkspaces[0].id,
            'test-user-id'
          );
          
          if (result.success) {
            successCount++;
          }
          
          responseTimes.push(Date.now() - reqStart);
        } catch (error) {
          // Count but continue
        }
        
        requestCount++;
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);
      const successRate = (successCount / requestCount) * 100;
      
      console.log('Load Test Results:');
      console.log(`- Requests: ${requestCount}`);
      console.log(`- Success Rate: ${successRate.toFixed(1)}%`);
      console.log(`- Avg Response: ${avgResponseTime.toFixed(0)}ms`);
      console.log(`- Min Response: ${minResponseTime}ms`);
      console.log(`- Max Response: ${maxResponseTime}ms`);
      
      expect(successRate).toBeGreaterThan(95);
      expect(avgResponseTime).toBeLessThan(1000);
    });
  });
});