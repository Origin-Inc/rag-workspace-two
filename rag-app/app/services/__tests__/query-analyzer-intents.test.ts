import { describe, it, expect } from 'vitest';
import { QueryAnalyzer } from '../query-analyzer.client';
import type { DataFile } from '~/atoms/chat-atoms';

describe('QueryAnalyzer Intent Detection', () => {
  const analyzer = new QueryAnalyzer();
  
  const mockFiles: DataFile[] = [
    {
      id: 'file-1',
      pageId: 'test',
      filename: 'sales_data.csv',
      tableName: 'sales_data',
      schema: [],
      rowCount: 1000,
      sizeBytes: 10240,
      uploadedAt: new Date(),
    },
    {
      id: 'file-2',
      pageId: 'test',
      filename: 'customer_info.xlsx',
      tableName: 'customer_info',
      schema: [],
      rowCount: 500,
      sizeBytes: 5120,
      uploadedAt: new Date(),
    },
  ];

  describe('Conversational Intent', () => {
    const conversationalQueries = [
      'how are you doing?',
      'hello there',
      'good morning',
      'thanks for your help',
      'that was helpful',
      'nice work',
      'how are you today?',
      'what\'s up?',
    ];

    conversationalQueries.forEach(query => {
      it(`should detect conversational intent: "${query}"`, () => {
        const result = analyzer.analyzeQuery(query, mockFiles);
        expect(result.intent).toBe('conversational');
        expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      });
    });
  });

  describe('Off-Topic Intent', () => {
    const offTopicQueries = [
      'what is the weather today?',
      'tell me a joke',
      'what time is it?',
      'how to cook pasta',
      'latest news',
      'sports scores',
      'movie recommendations',
      'what\'s the capital of France?',
    ];

    offTopicQueries.forEach(query => {
      it(`should detect off-topic intent: "${query}"`, () => {
        const result = analyzer.analyzeQuery(query, mockFiles);
        expect(result.intent).toBe('off-topic');
        expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      });
    });
  });

  describe('Data Query Intent', () => {
    const dataQueries = [
      'show me sales data',
      'analyze customer info',
      'what\'s in the sales_data file?',
      'summarize the customer data',
      'calculate total sales',
      'average revenue per customer',
      'show top 10 customers',
      'compare sales by region',
    ];

    dataQueries.forEach(query => {
      it(`should detect data query intent: "${query}"`, () => {
        const result = analyzer.analyzeQuery(query, mockFiles);
        expect(result.intent).toBe('query-data');
        expect(result.confidence).toBeGreaterThanOrEqual(0.6);
        expect(result.clarificationNeeded).toBe(false);
      });
    });
  });

  describe('Unclear Intent', () => {
    it('should handle unclear queries with clarification', () => {
      const result = analyzer.analyzeQuery('show me the data', mockFiles);
      expect(result.intent).toBe('query-data');
      expect(result.clarificationNeeded).toBe(true);
      expect(result.clarificationMessage).toBeTruthy();
      expect(result.suggestions).toBeDefined();
    });

    it('should handle empty query', () => {
      const result = analyzer.analyzeQuery('', mockFiles);
      expect(result.intent).toBe('unclear');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('File Reference Detection', () => {
    it('should detect direct file references', () => {
      const result = analyzer.analyzeQuery('analyze sales_data.csv', mockFiles);
      expect(result.mentionsFile).toBe(true);
      expect(result.fileReference).toContain('sales_data');
    });

    it('should detect table name references', () => {
      const result = analyzer.analyzeQuery('query the customer_info table', mockFiles);
      expect(result.mentionsFile).toBe(true);
      expect(result.fileReference).toContain('customer_info');
    });

    it('should handle partial file matches', () => {
      const result = analyzer.analyzeQuery('show me the sales file', mockFiles);
      expect(result.mentionsFile).toBe(true);
      expect(result.fileReference).toContain('sales');
    });
  });

  describe('Context-Aware Detection', () => {
    it('should require files for data queries', () => {
      const resultWithFiles = analyzer.analyzeQuery('calculate average', mockFiles);
      const resultWithoutFiles = analyzer.analyzeQuery('calculate average', []);
      
      expect(resultWithFiles.intent).toBe('query-data');
      expect(resultWithoutFiles.intent).toBe('general-chat');
      expect(resultWithoutFiles.clarificationNeeded).toBe(true);
    });

    it('should handle greeting differently based on context', () => {
      const simpleGreeting = analyzer.analyzeQuery('hi', []);
      const greetingWithFiles = analyzer.analyzeQuery('hi, analyze my data', mockFiles);
      
      expect(simpleGreeting.intent).toBe('greeting');
      expect(greetingWithFiles.intent).toBe('query-data');
    });
  });

  describe('Edge Cases', () => {
    it('should handle mixed intents gracefully', () => {
      const result = analyzer.analyzeQuery('hello, what\'s the weather in my sales data?', mockFiles);
      // Should prioritize data query over off-topic when files are mentioned
      expect(['query-data', 'off-topic']).toContain(result.intent);
    });

    it('should handle very long queries', () => {
      const longQuery = 'I need to analyze the sales data ' + 'and see patterns '.repeat(50);
      const result = analyzer.analyzeQuery(longQuery, mockFiles);
      expect(result.intent).toBe('query-data');
    });

    it('should handle special characters', () => {
      const result = analyzer.analyzeQuery('analyze @#$% sales_data!!!', mockFiles);
      expect(result.intent).toBe('query-data');
      expect(result.mentionsFile).toBe(true);
    });
  });
});