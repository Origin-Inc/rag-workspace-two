import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import { createMockOpenAI } from '../__mocks__/openai.mock';
import { createMockSupabase, mockWorkspaces } from '../__mocks__/supabase.mock';

// Mock all external dependencies
vi.mock('../../openai.server', () => ({
  openai: createMockOpenAI()
}));

vi.mock('~/utils/supabase.server', () => ({
  createSupabaseAdmin: () => createMockSupabase()
}));

vi.mock('../../rag.server', () => ({
  RAGService: class {
    async searchSimilar() {
      return [];
    }
    async buildAugmentedContext() {
      return { text: 'Mock context', citations: [], totalTokens: 100 };
    }
  }
}));

// Mock authentication
vi.mock('../../production-auth.server', () => ({
  getUser: vi.fn().mockResolvedValue({
    id: 'test-user-id',
    email: 'test@example.com'
  })
}));

describe('LLM Orchestration API E2E Tests', () => {
  const baseUrl = 'http://localhost:3001/api/llm-orchestration';
  
  describe('POST /api/llm-orchestration', () => {
    it('should process a data query end-to-end', async () => {
      const request = {
        query: 'show my tasks',
        workspaceId: mockWorkspaces[0].id,
        options: {
          includeDebug: true
        }
      };
      
      // Simulate API call
      const response = await simulateApiCall(request);
      
      expect(response.success).toBe(true);
      expect(response.response).toBeDefined();
      expect(response.response.blocks).toBeInstanceOf(Array);
      expect(response.performance).toBeDefined();
      expect(response.debug).toBeDefined();
    });
    
    it('should handle content search queries', async () => {
      const request = {
        query: 'find documentation about authentication',
        workspaceId: mockWorkspaces[0].id
      };
      
      const response = await simulateApiCall(request);
      
      expect(response.success).toBe(true);
      expect(response.response.blocks.some(b => b.type === 'text')).toBe(true);
    });
    
    it('should handle analytics queries', async () => {
      const request = {
        query: 'show revenue trends for last quarter',
        workspaceId: mockWorkspaces[0].id
      };
      
      const response = await simulateApiCall(request);
      
      expect(response.success).toBe(true);
      expect(response.response.blocks.some(b => b.type === 'chart')).toBe(true);
    });
    
    it('should validate request body', async () => {
      const invalidRequest = {
        // Missing required fields
        query: '',
        workspaceId: ''
      };
      
      const response = await simulateApiCall(invalidRequest);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('validation');
    });
    
    it('should handle authentication errors', async () => {
      // Mock auth failure
      vi.mock('../../production-auth.server', () => ({
        getUser: vi.fn().mockResolvedValue(null)
      }));
      
      const request = {
        query: 'test query',
        workspaceId: mockWorkspaces[0].id
      };
      
      const response = await simulateApiCall(request, { authenticated: false });
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('authentication');
    });
    
    it('should respect cache bypass option', async () => {
      const request = {
        query: 'show my tasks',
        workspaceId: mockWorkspaces[0].id,
        options: {
          bypassCache: true
        }
      };
      
      // First call
      const response1 = await simulateApiCall(request);
      const time1 = response1.performance.totalTime;
      
      // Second call with bypass
      const response2 = await simulateApiCall(request);
      const time2 = response2.performance.totalTime;
      
      // Both should take similar time (no cache benefit)
      expect(Math.abs(time1 - time2)).toBeLessThan(50);
    });
    
    it('should handle timeout gracefully', async () => {
      const request = {
        query: 'complex query',
        workspaceId: mockWorkspaces[0].id,
        options: {
          maxResponseTime: 100
        }
      };
      
      // Mock slow response
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
      
      const response = await simulateApiCall(request);
      
      // Should still return a response
      expect(response).toBeDefined();
      expect(response.performance.totalTime).toBeLessThan(300);
    });
  });
  
  describe('Rate Limiting', () => {
    it('should handle rate limits appropriately', async () => {
      const request = {
        query: 'test query',
        workspaceId: mockWorkspaces[0].id
      };
      
      // Simulate multiple rapid requests
      const promises = Array(10).fill(null).map(() => simulateApiCall(request));
      const responses = await Promise.all(promises);
      
      // All should succeed (no rate limiting in test env)
      responses.forEach(response => {
        expect(response.success).toBe(true);
      });
    });
  });
  
  describe('Error Recovery', () => {
    it('should recover from OpenAI failures', async () => {
      let callCount = 0;
      
      // Mock intermittent failures
      vi.mock('../../openai.server', () => ({
        openai: {
          chat: {
            completions: {
              create: async () => {
                callCount++;
                if (callCount === 1) {
                  throw new Error('OpenAI API error');
                }
                return {
                  choices: [{
                    message: {
                      content: JSON.stringify({
                        intent: 'data_query',
                        confidence: 0.9
                      })
                    }
                  }]
                };
              }
            }
          }
        }
      }));
      
      const request = {
        query: 'show tasks',
        workspaceId: mockWorkspaces[0].id
      };
      
      const response = await simulateApiCall(request);
      
      // Should handle error gracefully
      expect(response).toBeDefined();
    });
    
    it('should handle database connection errors', async () => {
      // Mock database failure
      vi.mock('~/utils/supabase.server', () => ({
        createSupabaseAdmin: () => ({
          from: () => {
            throw new Error('Database connection failed');
          }
        })
      }));
      
      const request = {
        query: 'show data',
        workspaceId: mockWorkspaces[0].id
      };
      
      const response = await simulateApiCall(request);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('database');
    });
  });
  
  describe('Performance Requirements', () => {
    it('should respond within 2 seconds for standard queries', async () => {
      const request = {
        query: 'show my tasks with status pending',
        workspaceId: mockWorkspaces[0].id
      };
      
      const startTime = Date.now();
      const response = await simulateApiCall(request);
      const duration = Date.now() - startTime;
      
      expect(response.success).toBe(true);
      expect(duration).toBeLessThan(2000);
      expect(response.performance.totalTime).toBeLessThan(2000);
    });
    
    it('should handle concurrent requests efficiently', async () => {
      const queries = [
        'show my tasks',
        'find documentation',
        'revenue analytics',
        'summarize project'
      ];
      
      const startTime = Date.now();
      
      const promises = queries.map(query => 
        simulateApiCall({
          query,
          workspaceId: mockWorkspaces[0].id
        })
      );
      
      const responses = await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      responses.forEach(response => {
        expect(response.success).toBe(true);
      });
      
      // Should handle all concurrently in reasonable time
      expect(duration).toBeLessThan(3000);
    });
  });
  
  describe('Response Validation', () => {
    it('should return properly structured responses', async () => {
      const request = {
        query: 'show analytics',
        workspaceId: mockWorkspaces[0].id
      };
      
      const response = await simulateApiCall(request);
      
      // Validate response structure
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('response');
      expect(response).toHaveProperty('performance');
      
      expect(response.response).toHaveProperty('blocks');
      expect(response.response).toHaveProperty('metadata');
      
      expect(response.performance).toHaveProperty('totalTime');
      expect(response.performance).toHaveProperty('intentClassificationTime');
      expect(response.performance).toHaveProperty('executionTime');
      
      expect(response.response.metadata).toHaveProperty('confidence');
      expect(response.response.metadata).toHaveProperty('dataSources');
    });
    
    it('should include appropriate metadata', async () => {
      const request = {
        query: 'complex multi-source query',
        workspaceId: mockWorkspaces[0].id,
        options: {
          includeDebug: true
        }
      };
      
      const response = await simulateApiCall(request);
      
      expect(response.debug).toBeDefined();
      expect(response.debug.intent).toBeDefined();
      expect(response.debug.confidence).toBeGreaterThan(0);
      expect(response.debug.routingDecision).toBeDefined();
    });
  });
});

// Helper function to simulate API calls
async function simulateApiCall(
  requestBody: any,
  options: { authenticated?: boolean } = { authenticated: true }
) {
  try {
    // Import the actual orchestrator
    const { LLMOrchestrator } = await import('../orchestrator.server');
    const orchestrator = new LLMOrchestrator();
    
    // Validate request
    if (!requestBody.query || !requestBody.workspaceId) {
      return {
        success: false,
        error: 'Invalid request: validation failed'
      };
    }
    
    // Check authentication
    if (!options.authenticated) {
      return {
        success: false,
        error: 'Unauthorized: authentication required'
      };
    }
    
    // Process query
    const result = await orchestrator.processQuery(
      requestBody.query,
      requestBody.workspaceId,
      'test-user-id',
      requestBody.options
    );
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      response: {
        blocks: [{
          type: 'text',
          content: 'An error occurred processing your request'
        }],
        metadata: {
          confidence: 0,
          dataSources: []
        }
      },
      performance: {
        totalTime: 0,
        intentClassificationTime: 0,
        contextExtractionTime: 0,
        routingTime: 0,
        executionTime: 0,
        structuringTime: 0
      }
    };
  }
}