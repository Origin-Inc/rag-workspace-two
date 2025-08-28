/**
 * Comprehensive RAG Pipeline Test Script
 * Tests the entire content indexing and search pipeline
 * Run with: npx tsx scripts/test-rag-pipeline.ts [workspaceId]
 */

import { robustContentIndexer } from '../app/services/robust-content-indexer.server';
import { automaticPageIndexer } from '../app/services/automatic-page-indexer.server';
import { embeddingGenerationService } from '../app/services/embedding-generation.server';
import { ragService } from '../app/services/rag.server';
import { createSupabaseAdmin } from '../app/utils/supabase.server';

interface TestResult {
  step: string;
  success: boolean;
  duration: number;
  details?: any;
  error?: string;
}

class RAGPipelineTests {
  private supabase = createSupabaseAdmin();
  private results: TestResult[] = [];

  async runTest(step: string, testFn: () => Promise<any>): Promise<boolean> {
    const start = Date.now();
    console.log(`\n🧪 Testing: ${step}`);
    
    try {
      const result = await testFn();
      const duration = Date.now() - start;
      
      this.results.push({
        step,
        success: true,
        duration,
        details: result
      });
      
      console.log(`✅ ${step} - ${duration}ms`);
      return true;
    } catch (error) {
      const duration = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.results.push({
        step,
        success: false,
        duration,
        error: errorMessage
      });
      
      console.log(`❌ ${step} - ${duration}ms - ${errorMessage}`);
      return false;
    }
  }

  async testSystemConfiguration(): Promise<any> {
    const config = await robustContentIndexer.validateConfiguration();
    
    if (!config.valid) {
      throw new Error(`Configuration issues: ${config.issues.join(', ')}`);
    }
    
    return {
      valid: config.valid,
      recommendations: config.recommendations
    };
  }

  async testDatabaseConnection(): Promise<any> {
    // Test basic database connectivity
    const { data, error } = await this.supabase
      .from('pages')
      .select('count')
      .limit(1);
    
    if (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
    
    return { connected: true, hasPages: (data as any)?.[0]?.count > 0 };
  }

  async testDocumentsTable(): Promise<any> {
    // Test documents table exists and is accessible
    const { data, error } = await this.supabase
      .from('documents')
      .select('count')
      .limit(1);
    
    if (error) {
      throw new Error(`Documents table access failed: ${error.message}`);
    }
    
    return { accessible: true, hasDocuments: (data as any)?.[0]?.count > 0 };
  }

  async testContentIndexing(workspaceId: string): Promise<any> {
    // Clean up any existing test data
    await this.supabase
      .from('documents')
      .delete()
      .eq('source_block_id', 'test-page-content');
    
    // Test indexing with sample content
    const testContent = `
# Test Page for RAG Pipeline

This is a comprehensive test document to verify the RAG indexing pipeline.

## Features Being Tested
- Content extraction from page structure
- Embedding generation with OpenAI
- Vector storage in PostgreSQL
- Metadata handling

## Sample Data
The system should be able to:
1. Extract this text content
2. Generate embeddings for search
3. Store with proper metadata
4. Enable retrieval via similarity search

### Technical Details
- Technology: RAG (Retrieval-Augmented Generation)
- Database: PostgreSQL with pgvector
- AI Model: OpenAI text-embedding-3-small
- Search: Hybrid vector + full-text search

This content should be discoverable when searching for "RAG pipeline test".
    `.trim();

    const passageIds = await embeddingGenerationService.processDocument(
      workspaceId,
      testContent,
      {
        source_block_id: 'test-page-content',
        page_name: 'RAG Pipeline Test Page',
        block_type: 'test-page',
        storage_path: 'test:rag-pipeline-page'
      }
    );
    
    return {
      passageIds,
      passageCount: passageIds.length,
      contentLength: testContent.length
    };
  }

  async testVectorSearch(workspaceId: string): Promise<any> {
    const searchResults = await embeddingGenerationService.searchSimilarDocuments(
      workspaceId,
      'RAG pipeline test features',
      5,
      0.3
    );
    
    if (searchResults.length === 0) {
      throw new Error('No search results found for test query');
    }
    
    const relevantResults = searchResults.filter(result => 
      result.passage_id?.includes('test-page-content') ||
      result.content.includes('RAG pipeline') ||
      result.content.includes('test document')
    );
    
    return {
      totalResults: searchResults.length,
      relevantResults: relevantResults.length,
      topResult: searchResults[0],
      avgSimilarity: searchResults.reduce((sum, r) => sum + (r.similarity || 0), 0) / searchResults.length
    };
  }

  async testRAGGeneration(workspaceId: string): Promise<any> {
    // First search for content
    const searchResults = await embeddingGenerationService.searchSimilarDocuments(
      workspaceId,
      'What are the features being tested in the RAG pipeline?',
      3,
      0.3
    );
    
    if (searchResults.length === 0) {
      throw new Error('No search results for RAG generation test');
    }
    
    // Build context
    const context = await ragService.buildAugmentedContext(
      'What are the features being tested?',
      searchResults,
      { maxTokens: 1000, includeCitations: true }
    );
    
    // Generate answer
    const result = await ragService.generateAnswerWithCitations(
      'What are the main features being tested in the RAG pipeline?',
      context
    );
    
    return {
      searchResultsCount: searchResults.length,
      contextTokens: context.totalTokens,
      answerLength: result.answer.length,
      citationsCount: result.citations.length,
      confidence: result.confidence,
      answer: result.answer.substring(0, 200) + '...' // Truncate for logging
    };
  }

  async testWorkspaceIndexing(workspaceId: string): Promise<any> {
    // Get workspace stats before indexing
    const beforeStats = await this.getWorkspaceDocumentCount(workspaceId);
    
    // Index a single test page (if available)
    const { data: pages } = await this.supabase
      .from('pages')
      .select('id, title')
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false)
      .limit(1);
    
    if (pages && pages.length > 0) {
      await automaticPageIndexer.indexPageContent(pages[0].id);
    }
    
    // Get stats after indexing
    const afterStats = await this.getWorkspaceDocumentCount(workspaceId);
    
    return {
      pagesTested: pages?.length || 0,
      documentsBefore: beforeStats,
      documentsAfter: afterStats,
      documentsCreated: afterStats - beforeStats
    };
  }

  async getWorkspaceDocumentCount(workspaceId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);
    
    return count || 0;
  }

  async cleanupTestData(): Promise<any> {
    // Clean up test documents
    const { data, error } = await this.supabase
      .from('documents')
      .delete()
      .or('source_block_id.eq.test-page-content,passage_id.like.*test*')
      .select('passage_id');
    
    return {
      cleaned: !error,
      deletedCount: data?.length || 0,
      error: error?.message
    };
  }

  printResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 RAG PIPELINE TEST RESULTS');
    console.log('='.repeat(60));
    
    let passedCount = 0;
    let failedCount = 0;
    let totalDuration = 0;
    
    this.results.forEach(result => {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${result.step} (${result.duration}ms)`);
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      
      if (result.success) {
        passedCount++;
      } else {
        failedCount++;
      }
      
      totalDuration += result.duration;
    });
    
    console.log('\n' + '-'.repeat(60));
    console.log(`📊 SUMMARY:`);
    console.log(`   Total Tests: ${this.results.length}`);
    console.log(`   Passed: ${passedCount}`);
    console.log(`   Failed: ${failedCount}`);
    console.log(`   Success Rate: ${Math.round((passedCount / this.results.length) * 100)}%`);
    console.log(`   Total Duration: ${totalDuration}ms`);
    console.log('='.repeat(60));
    
    if (failedCount === 0) {
      console.log('🎉 All tests passed! Your RAG pipeline is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Check the errors above for troubleshooting.');
    }
  }
}

async function main() {
  const workspaceId = process.argv[2];
  
  if (!workspaceId) {
    console.error('❌ Please provide a workspace ID as an argument');
    console.log('Usage: npx tsx scripts/test-rag-pipeline.ts <workspaceId>');
    process.exit(1);
  }
  
  console.log('🚀 RAG Pipeline Comprehensive Test Suite');
  console.log(`📋 Testing workspace: ${workspaceId}`);
  console.log(`🕐 Started at: ${new Date().toISOString()}`);
  
  const tester = new RAGPipelineTests();
  
  // Run all tests
  await tester.runTest('System Configuration', () => tester.testSystemConfiguration());
  await tester.runTest('Database Connection', () => tester.testDatabaseConnection());
  await tester.runTest('Documents Table Access', () => tester.testDocumentsTable());
  await tester.runTest('Content Indexing', () => tester.testContentIndexing(workspaceId));
  await tester.runTest('Vector Search', () => tester.testVectorSearch(workspaceId));
  await tester.runTest('RAG Answer Generation', () => tester.testRAGGeneration(workspaceId));
  await tester.runTest('Workspace Page Indexing', () => tester.testWorkspaceIndexing(workspaceId));
  
  // Cleanup
  console.log('\n🧹 Cleaning up test data...');
  await tester.cleanupTestData();
  
  // Print final results
  tester.printResults();
  
  // Exit with appropriate code
  const hasFailures = tester.results.some(r => !r.success);
  process.exit(hasFailures ? 1 : 0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test suite failed with error:', error);
    process.exit(1);
  });
}