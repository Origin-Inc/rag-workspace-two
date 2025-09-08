#!/usr/bin/env ts-node
/**
 * Test script for async embedding generation migration
 * Tests both queue-based and fallback synchronous processing
 */

import { prisma } from '../app/utils/db.server';
import { ultraLightIndexingService } from '../app/services/rag/ultra-light-indexing.service';
import { ultraLightEmbeddingQueue } from '../app/services/rag/queues/ultra-light-embedding-queue';
import { ultraLightEmbeddingWorker } from '../app/services/rag/workers/ultra-light-embedding-worker';
import { embeddingMonitor } from '../app/services/rag/monitoring/embedding-monitor.server';
import { DebugLogger } from '../app/utils/debug-logger';

const logger = new DebugLogger('AsyncEmbeddingTest');

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

class AsyncEmbeddingTester {
  private results: TestResult[] = [];
  
  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    logger.info('🚀 Starting async embedding migration tests...');
    
    try {
      // Initialize worker
      await this.initializeWorker();
      
      // Run tests
      await this.testQueueCreation();
      await this.testEmbeddingQueueing();
      await this.testWorkerProcessing();
      await this.testDebouncedQueueing();
      await this.testFallbackProcessing();
      await this.testHealthCheck();
      await this.testMetrics();
      await this.testRealPageIndexing();
      
      // Print results
      this.printResults();
      
    } catch (error) {
      logger.error('Test suite failed', error);
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }
  
  /**
   * Initialize the worker
   */
  private async initializeWorker(): Promise<void> {
    const startTime = Date.now();
    try {
      await ultraLightEmbeddingWorker.start();
      this.results.push({
        testName: 'Worker Initialization',
        passed: true,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      this.results.push({
        testName: 'Worker Initialization',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Test queue creation
   */
  private async testQueueCreation(): Promise<void> {
    const startTime = Date.now();
    try {
      const metrics = await ultraLightEmbeddingQueue.getMetrics();
      
      this.results.push({
        testName: 'Queue Creation',
        passed: metrics.isAvailable !== undefined,
        duration: Date.now() - startTime,
        details: metrics,
      });
    } catch (error) {
      this.results.push({
        testName: 'Queue Creation',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Test embedding queueing
   */
  private async testEmbeddingQueueing(): Promise<void> {
    const startTime = Date.now();
    try {
      const testChunks = [
        { text: 'Test chunk 1 for embedding generation', index: 0 },
        { text: 'Test chunk 2 with more content', index: 1 },
      ];
      
      const jobId = await ultraLightEmbeddingQueue.queueEmbedding(
        'test-page-123',
        'test-workspace-456',
        testChunks,
        { pageTitle: 'Test Page', priority: 'high' }
      );
      
      this.results.push({
        testName: 'Embedding Queueing',
        passed: jobId !== null,
        duration: Date.now() - startTime,
        details: { jobId },
      });
      
      // Wait a bit and check status
      if (jobId) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const status = await ultraLightEmbeddingQueue.getJobStatus(jobId);
        
        this.results.push({
          testName: 'Job Status Check',
          passed: status !== null,
          duration: Date.now() - startTime,
          details: status,
        });
      }
    } catch (error) {
      this.results.push({
        testName: 'Embedding Queueing',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Test worker processing
   */
  private async testWorkerProcessing(): Promise<void> {
    const startTime = Date.now();
    try {
      // Create a test page
      const testPage = await prisma.page.create({
        data: {
          id: 'test-page-worker-' + Date.now(),
          title: 'Worker Test Page',
          content: { text: 'This is a test page for worker processing' },
          blocks: [
            { type: 'text', content: 'First block of test content' },
            { type: 'text', content: 'Second block with more information' },
          ],
          workspaceId: 'test-workspace-123',
        },
      });
      
      // Queue the page for processing
      const jobId = await ultraLightEmbeddingQueue.queueEmbedding(
        testPage.id,
        testPage.workspaceId!,
        [
          { text: 'Test content for worker', index: 0 },
        ],
        { pageTitle: testPage.title, priority: 'normal' }
      );
      
      if (jobId) {
        // Wait for processing (max 10 seconds)
        let processed = false;
        for (let i = 0; i < 20; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const status = await ultraLightEmbeddingQueue.getJobStatus(jobId);
          
          if (status?.state === 'completed') {
            processed = true;
            break;
          } else if (status?.state === 'failed') {
            throw new Error(`Job failed: ${status.error}`);
          }
        }
        
        this.results.push({
          testName: 'Worker Processing',
          passed: processed,
          duration: Date.now() - startTime,
          details: { pageId: testPage.id, jobId },
        });
      } else {
        throw new Error('Failed to queue job');
      }
      
      // Cleanup
      await prisma.page.delete({ where: { id: testPage.id } });
      
    } catch (error) {
      this.results.push({
        testName: 'Worker Processing',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Test debounced queueing
   */
  private async testDebouncedQueueing(): Promise<void> {
    const startTime = Date.now();
    try {
      const pageId = 'test-debounce-page-' + Date.now();
      
      // Queue multiple times with debouncing
      const job1 = await ultraLightEmbeddingQueue.queueEmbedding(
        pageId,
        'test-workspace',
        [{ text: 'First version', index: 0 }],
        { debounced: true }
      );
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const job2 = await ultraLightEmbeddingQueue.queueEmbedding(
        pageId,
        'test-workspace',
        [{ text: 'Updated version', index: 0 }],
        { debounced: true }
      );
      
      // Should have same job ID (deduplication)
      this.results.push({
        testName: 'Debounced Queueing',
        passed: job1 === job2,
        duration: Date.now() - startTime,
        details: { job1, job2, deduplicated: job1 === job2 },
      });
      
    } catch (error) {
      this.results.push({
        testName: 'Debounced Queueing',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Test fallback synchronous processing
   */
  private async testFallbackProcessing(): Promise<void> {
    const startTime = Date.now();
    try {
      // Temporarily disable queue to test fallback
      await ultraLightEmbeddingQueue.pause();
      
      // This should use fallback processing
      await ultraLightIndexingService.indexPage('test-fallback-page', true);
      
      // Resume queue
      await ultraLightEmbeddingQueue.resume();
      
      this.results.push({
        testName: 'Fallback Processing',
        passed: true,
        duration: Date.now() - startTime,
      });
      
    } catch (error) {
      // Resume queue even on error
      await ultraLightEmbeddingQueue.resume();
      
      this.results.push({
        testName: 'Fallback Processing',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Test health check
   */
  private async testHealthCheck(): Promise<void> {
    const startTime = Date.now();
    try {
      const health = await embeddingMonitor.getHealth();
      
      this.results.push({
        testName: 'Health Check',
        passed: health.status !== undefined,
        duration: Date.now() - startTime,
        details: {
          status: health.status,
          components: Object.keys(health.components),
        },
      });
      
    } catch (error) {
      this.results.push({
        testName: 'Health Check',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Test metrics
   */
  private async testMetrics(): Promise<void> {
    const startTime = Date.now();
    try {
      const metrics = await embeddingMonitor.getMetrics();
      
      this.results.push({
        testName: 'Metrics Collection',
        passed: metrics.timestamp !== undefined,
        duration: Date.now() - startTime,
        details: {
          hasQueueMetrics: !!metrics.queues,
          hasDatabaseMetrics: !!metrics.database,
          hasPerformanceMetrics: !!metrics.performance,
        },
      });
      
    } catch (error) {
      this.results.push({
        testName: 'Metrics Collection',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Test real page indexing
   */
  private async testRealPageIndexing(): Promise<void> {
    const startTime = Date.now();
    try {
      // Find an existing page to index
      const existingPage = await prisma.page.findFirst({
        where: {
          workspaceId: { not: null },
        },
      });
      
      if (existingPage) {
        await ultraLightIndexingService.indexPage(existingPage.id, true);
        
        // Wait a bit for processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if embeddings were created
        const embeddings = await prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count FROM page_embeddings 
          WHERE page_id = ${existingPage.id}::uuid
        `;
        
        this.results.push({
          testName: 'Real Page Indexing',
          passed: Number(embeddings[0]?.count || 0) > 0,
          duration: Date.now() - startTime,
          details: {
            pageId: existingPage.id,
            embeddingsCount: Number(embeddings[0]?.count || 0),
          },
        });
      } else {
        this.results.push({
          testName: 'Real Page Indexing',
          passed: false,
          duration: Date.now() - startTime,
          error: 'No existing pages found for testing',
        });
      }
      
    } catch (error) {
      this.results.push({
        testName: 'Real Page Indexing',
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  /**
   * Print test results
   */
  private printResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('ASYNC EMBEDDING MIGRATION TEST RESULTS');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;
    
    for (const result of this.results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`\n${status} - ${result.testName} (${result.duration}ms)`);
      
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      
      if (result.details) {
        console.log(`  Details:`, result.details);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`SUMMARY: ${passed}/${total} tests passed, ${failed} failed`);
    console.log('='.repeat(60) + '\n');
    
    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
  }
  
  /**
   * Cleanup
   */
  private async cleanup(): Promise<void> {
    try {
      // Stop worker
      await ultraLightEmbeddingWorker.stop();
      
      // Close queue
      await ultraLightEmbeddingQueue.close();
      
      // Disconnect database
      await prisma.$disconnect();
      
    } catch (error) {
      logger.error('Cleanup error', error);
    }
  }
}

// Run tests if executed directly
if (require.main === module) {
  const tester = new AsyncEmbeddingTester();
  tester.runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}