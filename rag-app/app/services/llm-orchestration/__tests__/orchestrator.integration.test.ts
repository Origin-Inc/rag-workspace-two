import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { LLMOrchestrator } from '../orchestrator.server';
import { createMockOpenAI } from '../__mocks__/openai.mock';
import { createMockSupabase, mockWorkspaces } from '../__mocks__/supabase.mock';
import { testQueries, validateResponseStructure } from './fixtures';

// Mock all external dependencies
vi.mock('../../openai.server', () => ({
  openai: createMockOpenAI()
}));

vi.mock('~/utils/supabase.server', () => ({
  createSupabaseAdmin: () => createMockSupabase()
}));

// Mock RAG service
vi.mock('../../rag.server', () => ({
  RAGService: class {
    async buildAugmentedContext(query: string, results: any[]) {
      return {
        text: 'Mocked context text',
        citations: [],
        totalTokens: 100
      };
    }
  }
}));

describe('LLMOrchestrator Integration Tests', () => {
  let orchestrator: LLMOrchestrator;
  
  beforeAll(() => {
    // Set up any global mocks if needed
  });
  
  beforeEach(() => {
    orchestrator = new LLMOrchestrator({
      enabled: true,
      ttl: 60,
      maxSize: 10
    });
    vi.clearAllMocks();
  });
  
  describe('Complete Query Flow', () => {
    it('should process a data query end-to-end', async () => {
      const result = await orchestrator.processQuery(
        'show my tasks',
        mockWorkspaces[0].id,
        'test-user-id',
        { includeDebug: true }
      );
      
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response.blocks).toBeInstanceOf(Array);
      expect(result.response.blocks.length).toBeGreaterThan(0);
      
      // Check performance metrics
      expect(result.performance.totalTime).toBeGreaterThan(0);
      expect(result.performance.intentClassificationTime).toBeGreaterThan(0);
      expect(result.performance.contextExtractionTime).toBeGreaterThan(0);
      expect(result.performance.routingTime).toBeGreaterThan(0);
      expect(result.performance.executionTime).toBeGreaterThan(0);
      expect(result.performance.structuringTime).toBeGreaterThan(0);
      
      // Check debug info
      expect(result.debug).toBeDefined();
      expect(result.debug?.intent).toBe('data_query');
      expect(result.debug?.confidence).toBeGreaterThan(0.8);
    });
    
    it('should process content search queries', async () => {
      const result = await orchestrator.processQuery(
        'find documentation about authentication',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      expect(result.success).toBe(true);
      expect(result.response.blocks).toBeDefined();
      
      // Should return text blocks for content
      const textBlocks = result.response.blocks.filter(b => b.type === 'text');
      expect(textBlocks.length).toBeGreaterThan(0);
    });
    
    it('should process analytics queries', async () => {
      const result = await orchestrator.processQuery(
        'show revenue trends for last quarter',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      expect(result.success).toBe(true);
      
      // Should return chart blocks for analytics
      const chartBlocks = result.response.blocks.filter(b => b.type === 'chart');
      expect(chartBlocks.length).toBeGreaterThan(0);
    });
    
    it('should handle summary requests', async () => {
      const result = await orchestrator.processQuery(
        'summarize the current project status',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      expect(result.success).toBe(true);
      expect(result.response.metadata.dataSources).toContain('content');
    });
    
    it('should handle action requests', async () => {
      const result = await orchestrator.processQuery(
        'create a new task for bug fixing',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      expect(result.success).toBe(true);
      // Action queries should have confirmation blocks
      expect(result.response.blocks.some(b => 
        b.type === 'text' && b.content.includes('action')
      )).toBe(true);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid workspace gracefully', async () => {
      const result = await orchestrator.processQuery(
        'show my tasks',
        'invalid-workspace-id',
        'test-user-id'
      );
      
      expect(result.success).toBe(false);
      expect(result.response.blocks[0].type).toBe('text');
      expect(result.response.blocks[0].content).toContain('error');
    });
    
    it('should handle timeout gracefully', async () => {
      // Mock a slow response
      vi.mock('../../openai.server', () => ({
        openai: {
          chat: {
            completions: {
              create: async () => {
                await new Promise(resolve => setTimeout(resolve, 200));
                return { choices: [{ message: { content: '{}' } }] };
              }
            }
          }
        }
      }));
      
      const result = await orchestrator.processQuery(
        'complex query',
        mockWorkspaces[0].id,
        'test-user-id',
        { maxResponseTime: 100 }
      );
      
      // Should still return a result even if slow
      expect(result.success).toBeDefined();
      expect(result.response).toBeDefined();
    });
  });
  
  describe('Caching', () => {
    it('should cache successful responses', async () => {
      // First call
      const result1 = await orchestrator.processQuery(
        'show my tasks',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      const time1 = result1.performance.totalTime;
      
      // Second call (should be cached)
      const result2 = await orchestrator.processQuery(
        'show my tasks',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      const time2 = result2.performance.totalTime;
      
      // Cached response should be much faster
      expect(time2).toBeLessThan(time1 / 2);
      expect(result1.response).toEqual(result2.response);
    });
    
    it('should bypass cache when requested', async () => {
      // First call
      await orchestrator.processQuery(
        'show my tasks',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      // Second call with bypass
      const result = await orchestrator.processQuery(
        'show my tasks',
        mockWorkspaces[0].id,
        'test-user-id',
        { bypassCache: true }
      );
      
      // Should still take full processing time
      expect(result.performance.totalTime).toBeGreaterThan(0);
      expect(result.performance.intentClassificationTime).toBeGreaterThan(0);
    });
    
    it('should not cache action queries', async () => {
      // First call
      const result1 = await orchestrator.processQuery(
        'create new task',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      // Second call
      const result2 = await orchestrator.processQuery(
        'create new task',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      // Should not be cached (similar processing times)
      expect(result2.performance.totalTime).toBeGreaterThan(0);
      expect(result2.performance.intentClassificationTime).toBeGreaterThan(0);
    });
  });
  
  describe('Performance Requirements', () => {
    it('should process queries under 2 seconds', async () => {
      const startTime = Date.now();
      
      const result = await orchestrator.processQuery(
        'show my tasks with status pending',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000);
      expect(result.performance.totalTime).toBeLessThan(2000);
    });
    
    it('should handle concurrent queries efficiently', async () => {
      const queries = [
        'show my tasks',
        'find documentation',
        'revenue analytics',
        'summarize project'
      ];
      
      const startTime = Date.now();
      
      const results = await Promise.all(
        queries.map(q => orchestrator.processQuery(
          q,
          mockWorkspaces[0].id,
          'test-user-id'
        ))
      );
      
      const duration = Date.now() - startTime;
      
      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.response).toBeDefined();
      });
      
      // Should complete reasonably fast even with concurrent queries
      expect(duration).toBeLessThan(3000);
    });
  });
  
  describe('Response Validation', () => {
    it('should generate valid structured responses', async () => {
      const queries = Object.values(testQueries).flat().slice(0, 10);
      
      for (const query of queries) {
        const result = await orchestrator.processQuery(
          query,
          mockWorkspaces[0].id,
          'test-user-id'
        );
        
        if (result.success) {
          const validation = validateResponseStructure(result.response);
          expect(validation.valid).toBe(true);
          
          if (!validation.valid) {
            console.log(`Query: ${query}`);
            console.log(`Errors: ${validation.errors.join(', ')}`);
          }
        }
      }
    });
    
    it('should include appropriate metadata', async () => {
      const result = await orchestrator.processQuery(
        'show analytics for last month',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      expect(result.response.metadata).toBeDefined();
      expect(result.response.metadata.confidence).toBeGreaterThan(0);
      expect(result.response.metadata.confidence).toBeLessThanOrEqual(1);
      expect(result.response.metadata.dataSources).toBeInstanceOf(Array);
      expect(result.response.metadata.dataSources.length).toBeGreaterThan(0);
    });
  });
  
  describe('Cache Management', () => {
    it('should provide cache statistics', () => {
      const stats = orchestrator.getCacheStats();
      
      expect(stats.size).toBeDefined();
      expect(stats.maxSize).toBe(10);
      expect(stats.ttl).toBe(60);
      expect(stats.enabled).toBe(true);
    });
    
    it('should clear cache on demand', async () => {
      // Add some cached entries
      await orchestrator.processQuery(
        'query 1',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      await orchestrator.processQuery(
        'query 2',
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      let stats = orchestrator.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      
      // Clear cache
      orchestrator.clearCache();
      
      stats = orchestrator.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });
});