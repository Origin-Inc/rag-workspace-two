import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StructuredOutputGenerator } from '../structured-output.server';
import { ResponseFormat } from '../intent-classifier.server';
import { createQueryResponse, createIntentClassification } from './fixtures';

// Mock OpenAI
vi.mock('../../openai.server', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  }
}));

describe('StructuredOutputGenerator', () => {
  let generator: StructuredOutputGenerator;
  let mockCreate: any;
  
  beforeEach(async () => {
    const { openai } = await import('../../openai.server');
    mockCreate = openai.chat.completions.create as any;
    generator = new StructuredOutputGenerator();
    mockCreate.mockClear();
  });
  
  describe('generateStructuredResponse', () => {
    it('should generate table block for data responses', async () => {
      const queryResponse = createQueryResponse({
        type: 'data',
        data: {
          results: [
            { id: '1', title: 'Task 1', status: 'pending', priority: 1 },
            { id: '2', title: 'Task 2', status: 'done', priority: 2 }
          ]
        }
      });
      
      const classification = createIntentClassification({
        suggestedFormat: ResponseFormat.TABLE
      });
      
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              blocks: [
                {
                  type: 'table',
                  columns: [
                    { id: 'id', name: 'ID', type: 'text' },
                    { id: 'title', name: 'Title', type: 'text' },
                    { id: 'status', name: 'Status', type: 'select' },
                    { id: 'priority', name: 'Priority', type: 'number' }
                  ],
                  rows: queryResponse.data.results
                }
              ],
              metadata: {
                confidence: 0.95,
                dataSources: ['database'],
                suggestions: ['Filter by status', 'Sort by priority']
              }
            })
          }
        }]
      });
      
      const result = await generator.generateStructuredResponse(
        'show my tasks',
        queryResponse,
        classification
      );
      
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe('table');
      expect(result.blocks[0].columns).toHaveLength(4);
      expect(result.blocks[0].rows).toHaveLength(2);
    });
    
    it('should generate chart block for analytics', async () => {
      const queryResponse = createQueryResponse({
        type: 'analytics',
        data: {
          metrics: {
            total: 1500,
            average: 150,
            trend: 'increasing'
          },
          chartData: {
            labels: ['Jan', 'Feb', 'Mar'],
            datasets: [{
              label: 'Revenue',
              data: [100, 150, 200]
            }]
          }
        }
      });
      
      const classification = createIntentClassification({
        suggestedFormat: ResponseFormat.CHART
      });
      
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              blocks: [
                {
                  type: 'chart',
                  chartType: 'line',
                  data: queryResponse.data.chartData,
                  options: {
                    title: 'Revenue Trend',
                    responsive: true
                  }
                },
                {
                  type: 'insight',
                  title: 'Trend Analysis',
                  content: 'Revenue is showing an increasing trend',
                  severity: 'success'
                }
              ],
              metadata: {
                confidence: 0.9,
                dataSources: ['analytics']
              }
            })
          }
        }]
      });
      
      const result = await generator.generateStructuredResponse(
        'show revenue trends',
        queryResponse,
        classification
      );
      
      const chartBlock = result.blocks.find(b => b.type === 'chart');
      expect(chartBlock).toBeDefined();
      expect(chartBlock.chartType).toBe('line');
      expect(chartBlock.data).toBeDefined();
      
      const insightBlock = result.blocks.find(b => b.type === 'insight');
      expect(insightBlock).toBeDefined();
      expect(insightBlock.severity).toBe('success');
    });
    
    it('should generate text blocks for content', async () => {
      const queryResponse = createQueryResponse({
        type: 'content',
        data: {
          content: 'Authentication documentation content here...',
          citations: [
            { source: 'Documentation', relevance: 0.92 }
          ]
        }
      });
      
      const classification = createIntentClassification({
        suggestedFormat: ResponseFormat.TEXT
      });
      
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              blocks: [
                {
                  type: 'text',
                  content: queryResponse.data.content,
                  formatting: {
                    style: 'paragraph'
                  }
                },
                {
                  type: 'list',
                  items: queryResponse.data.citations.map(c => ({
                    text: `Source: ${c.source}`,
                    metadata: { relevance: c.relevance }
                  })),
                  style: 'citations'
                }
              ],
              metadata: {
                confidence: 0.88,
                dataSources: ['content']
              }
            })
          }
        }]
      });
      
      const result = await generator.generateStructuredResponse(
        'find authentication docs',
        queryResponse,
        classification
      );
      
      const textBlock = result.blocks.find(b => b.type === 'text');
      expect(textBlock).toBeDefined();
      expect(textBlock.content).toContain('Authentication');
      
      const citationBlock = result.blocks.find(b => b.type === 'list');
      expect(citationBlock).toBeDefined();
      expect(citationBlock.style).toBe('citations');
    });
    
    it('should handle hybrid responses with multiple blocks', async () => {
      const queryResponse = createQueryResponse({
        type: 'hybrid',
        data: {
          databaseResults: [
            { id: '1', title: 'Task 1' }
          ],
          contentResults: {
            text: 'Related documentation',
            citations: []
          },
          summary: 'Combined results from multiple sources'
        }
      });
      
      const classification = createIntentClassification({
        suggestedFormat: ResponseFormat.MIXED
      });
      
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              blocks: [
                {
                  type: 'text',
                  content: 'Summary: Combined results from multiple sources'
                },
                {
                  type: 'table',
                  columns: [
                    { id: 'id', name: 'ID', type: 'text' },
                    { id: 'title', name: 'Title', type: 'text' }
                  ],
                  rows: queryResponse.data.databaseResults
                },
                {
                  type: 'text',
                  content: 'Related documentation'
                }
              ],
              metadata: {
                confidence: 0.85,
                dataSources: ['database', 'content']
              }
            })
          }
        }]
      });
      
      const result = await generator.generateStructuredResponse(
        'comprehensive query',
        queryResponse,
        classification
      );
      
      expect(result.blocks.length).toBeGreaterThan(2);
      expect(result.blocks.some(b => b.type === 'table')).toBe(true);
      expect(result.blocks.some(b => b.type === 'text')).toBe(true);
      expect(result.metadata.dataSources).toContain('database');
      expect(result.metadata.dataSources).toContain('content');
    });
    
    it('should generate action confirmation blocks', async () => {
      const queryResponse = createQueryResponse({
        type: 'action',
        data: {
          requiresConfirmation: true,
          actionDescription: 'Create a new task with title "Bug fix"',
          parameters: {
            title: 'Bug fix',
            status: 'pending'
          }
        }
      });
      
      const classification = createIntentClassification({
        suggestedFormat: ResponseFormat.ACTION_CONFIRMATION
      });
      
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              blocks: [
                {
                  type: 'action_confirmation',
                  action: 'create_task',
                  description: queryResponse.data.actionDescription,
                  parameters: queryResponse.data.parameters,
                  confirmButton: 'Create Task',
                  cancelButton: 'Cancel'
                }
              ],
              metadata: {
                confidence: 0.95,
                requiresUserAction: true
              }
            })
          }
        }]
      });
      
      const result = await generator.generateStructuredResponse(
        'create new task',
        queryResponse,
        classification
      );
      
      expect(result.blocks[0].type).toBe('action_confirmation');
      expect(result.blocks[0].parameters).toBeDefined();
      expect(result.metadata.requiresUserAction).toBe(true);
    });
  });
  
  describe('error handling', () => {
    it('should handle OpenAI API errors', async () => {
      mockCreate.mockRejectedValue(new Error('API error'));
      
      const queryResponse = createQueryResponse();
      const classification = createIntentClassification();
      
      const result = await generator.generateStructuredResponse(
        'test query',
        queryResponse,
        classification
      );
      
      // Should return fallback structure
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe('text');
      expect(result.blocks[0].content).toContain('error');
    });
    
    it('should handle malformed AI responses', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'not valid json'
          }
        }]
      });
      
      const queryResponse = createQueryResponse();
      const classification = createIntentClassification();
      
      const result = await generator.generateStructuredResponse(
        'test query',
        queryResponse,
        classification
      );
      
      // Should return fallback structure
      expect(result.blocks).toBeDefined();
      expect(result.metadata).toBeDefined();
    });
  });
  
  describe('metadata generation', () => {
    it('should include follow-up questions', async () => {
      const queryResponse = createQueryResponse();
      const classification = createIntentClassification();
      
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              blocks: [{ type: 'text', content: 'Results' }],
              metadata: {
                confidence: 0.9,
                dataSources: ['database'],
                followUpQuestions: [
                  'Would you like to filter by status?',
                  'Show only recent items?'
                ]
              }
            })
          }
        }]
      });
      
      const result = await generator.generateStructuredResponse(
        'show data',
        queryResponse,
        classification
      );
      
      expect(result.metadata.followUpQuestions).toBeInstanceOf(Array);
      expect(result.metadata.followUpQuestions.length).toBeGreaterThan(0);
    });
    
    it('should include helpful suggestions', async () => {
      const queryResponse = createQueryResponse();
      const classification = createIntentClassification();
      
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              blocks: [{ type: 'table', columns: [], rows: [] }],
              metadata: {
                confidence: 0.85,
                dataSources: ['database'],
                suggestions: [
                  'Try adding filters',
                  'Sort by date',
                  'Export to CSV'
                ]
              }
            })
          }
        }]
      });
      
      const result = await generator.generateStructuredResponse(
        'show table',
        queryResponse,
        classification
      );
      
      expect(result.metadata.suggestions).toBeInstanceOf(Array);
      expect(result.metadata.suggestions).toContain('Sort by date');
    });
  });
  
  describe('caching', () => {
    it('should cache responses for identical inputs', async () => {
      const queryResponse = createQueryResponse();
      const classification = createIntentClassification();
      
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              blocks: [{ type: 'text', content: 'Cached result' }],
              metadata: { confidence: 0.9, dataSources: ['cache'] }
            })
          }
        }]
      });
      
      // First call
      await generator.generateStructuredResponse(
        'test query',
        queryResponse,
        classification
      );
      
      expect(mockCreate).toHaveBeenCalledTimes(1);
      
      // Second call with same inputs
      await generator.generateStructuredResponse(
        'test query',
        queryResponse,
        classification
      );
      
      // Should use cache, not call API again
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('performance', () => {
    it('should generate responses quickly', async () => {
      const queryResponse = createQueryResponse();
      const classification = createIntentClassification();
      
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              blocks: [{ type: 'text', content: 'Fast response' }],
              metadata: { confidence: 0.9, dataSources: ['test'] }
            })
          }
        }]
      });
      
      const startTime = Date.now();
      
      await generator.generateStructuredResponse(
        'test',
        queryResponse,
        classification
      );
      
      const duration = Date.now() - startTime;
      
      // Should be fast for mocked response
      expect(duration).toBeLessThan(50);
    });
  });
});