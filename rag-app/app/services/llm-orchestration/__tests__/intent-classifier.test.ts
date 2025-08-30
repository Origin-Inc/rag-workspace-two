import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IntentClassificationService, QueryIntent, ResponseFormat } from '../intent-classifier.server';
import { getMockIntentResponse } from '../__mocks__/openai.mock';
import { testQueries } from './fixtures';

// Mock the OpenAI module
vi.mock('../../openai.server', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  }
}));

describe('IntentClassificationService', () => {
  let service: IntentClassificationService;
  let mockCreate: any;
  
  beforeEach(async () => {
    const { openai } = await import('../../openai.server');
    mockCreate = openai.chat.completions.create as any;
    service = new IntentClassificationService();
    mockCreate.mockClear();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('classifyIntent', () => {
    it('should classify data query intents correctly', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(getMockIntentResponse('show my tasks'))
          }
        }]
      });
      
      const result = await service.classifyIntent('show my tasks');
      
      expect(result.intent).toBe(QueryIntent.DATA_QUERY);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.suggestedFormat).toBe(ResponseFormat.TABLE);
      expect(result.entities).toContainEqual(
        expect.objectContaining({
          type: 'database',
          value: 'tasks'
        })
      );
    });
    
    it('should classify content search intents correctly', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(getMockIntentResponse('find documentation'))
          }
        }]
      });
      
      const result = await service.classifyIntent('find documentation about auth');
      
      expect(result.intent).toBe(QueryIntent.CONTENT_SEARCH);
      expect(result.suggestedFormat).toBe(ResponseFormat.TEXT);
    });
    
    it('should classify analytics intents with time ranges', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: QueryIntent.ANALYTICS,
              confidence: 0.9,
              suggestedFormat: ResponseFormat.CHART,
              entities: [
                { type: 'metric', value: 'revenue', confidence: 0.95 }
              ],
              timeRange: {
                start: null,
                end: null,
                relative: 'last month'
              },
              aggregations: ['sum', 'average'],
              filters: {},
              explanation: 'Analytics query for revenue'
            })
          }
        }]
      });
      
      const result = await service.classifyIntent('show revenue for last month');
      
      expect(result.intent).toBe(QueryIntent.ANALYTICS);
      expect(result.suggestedFormat).toBe(ResponseFormat.CHART);
      expect(result.timeRange?.relative).toBe('last month');
      expect(result.aggregations).toContain('sum');
    });
    
    it('should handle null time ranges from OpenAI', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: QueryIntent.DATA_QUERY,
              confidence: 0.9,
              suggestedFormat: ResponseFormat.TABLE,
              entities: [],
              timeRange: null, // This was causing the Zod error
              aggregations: [],
              filters: {},
              explanation: 'Simple data query'
            })
          }
        }]
      });
      
      const result = await service.classifyIntent('show data');
      
      expect(result.intent).toBe(QueryIntent.DATA_QUERY);
      expect(result.timeRange).toBeNull();
    });
    
    it('should use cache for repeated queries', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(getMockIntentResponse('show my tasks'))
          }
        }]
      });
      
      // First call
      const result1 = await service.classifyIntent('show my tasks');
      expect(mockCreate).toHaveBeenCalledTimes(1);
      
      // Second call (should use cache)
      const result2 = await service.classifyIntent('show my tasks');
      expect(mockCreate).toHaveBeenCalledTimes(1); // Still only 1 call
      
      expect(result1).toEqual(result2);
    });
    
    it('should handle OpenAI errors gracefully', async () => {
      mockCreate.mockRejectedValue(new Error('OpenAI API error'));
      
      const result = await service.classifyIntent('show my tasks');
      
      expect(result.intent).toBe(QueryIntent.AMBIGUOUS);
      expect(result.confidence).toBe(0);
      expect(result.explanation).toContain('fallback');
    });
    
    it('should handle malformed OpenAI responses', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'not valid json'
          }
        }]
      });
      
      const result = await service.classifyIntent('show my tasks');
      
      expect(result.intent).toBe(QueryIntent.AMBIGUOUS);
      expect(result.confidence).toBe(0);
    });
  });
  
  describe('entity extraction', () => {
    it('should extract database entities', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: QueryIntent.DATA_QUERY,
              confidence: 0.9,
              suggestedFormat: ResponseFormat.TABLE,
              entities: [
                { type: 'database', value: 'tasks', confidence: 0.95 },
                { type: 'database', value: 'projects', confidence: 0.85 }
              ],
              timeRange: null,
              aggregations: [],
              filters: {},
              explanation: 'Multiple database references'
            })
          }
        }]
      });
      
      const result = await service.classifyIntent('show tasks and projects');
      const dbRefs = service.extractDatabaseReferences(result);
      
      expect(dbRefs).toEqual(['tasks', 'projects']);
    });
    
    it('should extract time ranges correctly', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: QueryIntent.DATA_QUERY,
              confidence: 0.9,
              suggestedFormat: ResponseFormat.TABLE,
              entities: [],
              timeRange: {
                start: '2024-01-01',
                end: '2024-01-31',
                relative: null
              },
              aggregations: [],
              filters: {},
              explanation: 'Date range query'
            })
          }
        }]
      });
      
      const result = await service.classifyIntent('show data from January');
      const timeRange = service.extractTimeRange(result);
      
      expect(timeRange.start).toBeInstanceOf(Date);
      expect(timeRange.end).toBeInstanceOf(Date);
    });
  });
  
  describe('query type detection', () => {
    it('should identify real-time queries', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: QueryIntent.DATA_QUERY,
              confidence: 0.9,
              suggestedFormat: ResponseFormat.TABLE,
              entities: [
                { type: 'date_range', value: 'today', confidence: 0.95 }
              ],
              timeRange: { relative: 'today', start: null, end: null },
              aggregations: [],
              filters: {},
              explanation: 'Current data query'
            })
          }
        }]
      });
      
      const result = await service.classifyIntent('show today\'s tasks');
      
      expect(service.isRealTimeQuery(result)).toBe(true);
    });
    
    it('should identify cacheable queries', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: QueryIntent.CONTENT_SEARCH,
              confidence: 0.9,
              suggestedFormat: ResponseFormat.TEXT,
              entities: [],
              timeRange: null,
              aggregations: [],
              filters: {},
              explanation: 'Static content search'
            })
          }
        }]
      });
      
      const result = await service.classifyIntent('find documentation');
      
      expect(service.isCacheable(result)).toBe(true);
    });
    
    it('should not cache action queries', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: QueryIntent.ACTION,
              confidence: 0.9,
              suggestedFormat: ResponseFormat.ACTION_CONFIRMATION,
              entities: [],
              timeRange: null,
              aggregations: [],
              filters: {},
              explanation: 'Action query'
            })
          }
        }]
      });
      
      const result = await service.classifyIntent('create new task');
      
      expect(service.isCacheable(result)).toBe(false);
    });
  });
  
  describe('performance', () => {
    it('should classify queries quickly', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(getMockIntentResponse('show my tasks'))
          }
        }]
      });
      
      const startTime = Date.now();
      await service.classifyIntent('show my tasks');
      const duration = Date.now() - startTime;
      
      // Should complete in under 100ms (excluding actual API call)
      expect(duration).toBeLessThan(100);
    });
    
    it('should handle multiple concurrent classifications', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(getMockIntentResponse('show my tasks'))
          }
        }]
      });
      
      const queries = testQueries.dataQuery;
      const promises = queries.map(q => service.classifyIntent(q));
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(queries.length);
      results.forEach(result => {
        expect(result.intent).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      });
    });
  });
});