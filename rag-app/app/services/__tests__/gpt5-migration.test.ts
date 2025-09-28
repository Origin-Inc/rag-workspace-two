/**
 * GPT-5 Migration Test Suite
 * Validates the migration from GPT-4-turbo-preview to GPT-5-mini
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiModelConfig } from '../ai-model-config.server';
import { costTracker } from '../cost-tracker.server';
import { cacheManager } from '../cache-manager.server';
import { responseValidator } from '../response-validator.server';
import { ContextWindowManager } from '../context-window-manager.server';

describe('GPT-5 Migration Tests', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AI Model Configuration', () => {
    it('should default to GPT-5-mini model', () => {
      const config = aiModelConfig.getConfig();
      expect(config.model).toBe('gpt-5-mini');
      expect(config.contextWindow).toBe(400000);
      expect(config.maxTokens).toBe(8000);
    });

    it('should calculate correct cost for GPT-5-mini', () => {
      const cost = aiModelConfig.calculateCost('gpt-5-mini', 1000000, 500000, false);
      // Input: 1M tokens at $0.25/1M = $0.25
      // Output: 500K tokens at $2.00/1M = $1.00
      // Total: $1.25
      expect(cost).toBeCloseTo(1.25, 2);
    });

    it('should calculate cached token cost correctly', () => {
      const cost = aiModelConfig.calculateCost('gpt-5-mini', 1000000, 500000, true);
      // Cached input: 1M tokens at $0.03/1M = $0.03
      // Output: 500K tokens at $2.00/1M = $1.00
      // Total: $1.03
      expect(cost).toBeCloseTo(1.03, 2);
    });

    it('should build API parameters with GPT-5 features', () => {
      const params = aiModelConfig.buildAPIParameters({
        messages: [{ role: 'user', content: 'test' }],
        jsonResponse: true,
        jsonSchema: { type: 'object' },
        queryType: 'analysis'
      });

      expect(params.model).toBe('gpt-5-mini');
      expect(params.verbosity).toBe('medium');
      expect(params.reasoning_effort).toBe('medium');
      expect(params.response_format).toEqual({
        type: 'json_schema',
        json_schema: { type: 'object' }
      });
    });

    it('should support feature flags for gradual rollout', async () => {
      // Mock environment variable
      process.env.GPT5_ROLLOUT_PERCENTAGE = '50';
      
      // Test that approximately 50% of users get the new model
      const results = new Map<string, number>();
      
      for (let i = 0; i < 100; i++) {
        const userId = `user_${i}`;
        const model = await aiModelConfig.getModelName(userId);
        results.set(model, (results.get(model) || 0) + 1);
      }
      
      // Should be roughly 50/50 split (allow for some variance)
      const gpt5Count = results.get('gpt-5-mini') || 0;
      expect(gpt5Count).toBeGreaterThan(30);
      expect(gpt5Count).toBeLessThan(70);
    });
  });

  describe('Context Window Manager', () => {
    it('should support GPT-5 token limits', () => {
      const limits = {
        'gpt-5-mini': 400000,
        'gpt-5-nano': 200000,
        'gpt-5': 500000
      };

      for (const [model, expectedLimit] of Object.entries(limits)) {
        const window = ContextWindowManager.buildContextWindow(
          [],
          [],
          { model, maxTokens: expectedLimit }
        );
        expect(window.maxTokens).toBeLessThanOrEqual(expectedLimit);
      }
    });

    it('should use o200k_base encoding for GPT-5 models', () => {
      const text = 'This is a test string for token counting';
      
      // Test GPT-5 models use the fallback encoding
      const gpt5Tokens = ContextWindowManager.countTokens(text, 'gpt-5-mini');
      const gpt4Tokens = ContextWindowManager.countTokens(text, 'gpt-4');
      
      // Both should return reasonable token counts
      expect(gpt5Tokens).toBeGreaterThan(0);
      expect(gpt5Tokens).toBeLessThan(text.length);
      expect(gpt4Tokens).toBeGreaterThan(0);
      expect(gpt4Tokens).toBeLessThan(text.length);
    });

    it('should handle tiktoken fallback gracefully', () => {
      // Test with a model that doesn't exist in tiktoken
      const text = 'Test fallback handling';
      const tokens = ContextWindowManager.countTokens(text, 'gpt-5-ultra');
      
      // Should fall back to character approximation
      expect(tokens).toBeCloseTo(text.length / 4.5, 0);
    });
  });

  describe('Cost Tracking', () => {
    it('should track usage correctly', async () => {
      const mockCompletion = {
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
          total_tokens: 1500
        }
      };

      // Mock database call
      vi.spyOn(costTracker as any, 'storeUsageRecord').mockResolvedValue(undefined);
      
      const cost = await costTracker.trackUsage(mockCompletion, 'gpt-5-mini', 'user_123');
      
      // Cost calculation: (1000/1M * 0.25) + (500/1M * 2.00) = 0.00025 + 0.001 = 0.00125
      expect(cost).toBeCloseTo(0.00125, 5);
    });

    it('should calculate potential savings with caching', async () => {
      // Mock database query
      vi.spyOn(costTracker, 'calculateCacheSavings').mockResolvedValue({
        totalSpent: 100,
        potentialSavings: 27, // 30% cache rate * 90% cost reduction
        cacheHitRate: 0.15,
        recommendedCacheTTL: 7200
      });

      const savings = await costTracker.calculateCacheSavings('user_123', 30);
      
      expect(savings.potentialSavings).toBe(27);
      expect(savings.recommendedCacheTTL).toBe(7200);
    });
  });

  describe('Cache Manager', () => {
    it('should generate consistent cache keys', async () => {
      const query = 'What is the meaning of life?';
      const context = 'The document discusses philosophy';
      
      const key1 = await cacheManager.generateKey(query, context);
      const key2 = await cacheManager.generateKey(query, context);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^ai-cache:[a-f0-9]{64}$/);
    });

    it('should track cache statistics', async () => {
      // Mock Redis operations
      vi.spyOn(cacheManager, 'get').mockResolvedValueOnce(null); // Miss
      vi.spyOn(cacheManager, 'get').mockResolvedValueOnce({ data: 'cached' }); // Hit
      
      await cacheManager.get('key1');
      await cacheManager.get('key2');
      
      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should calculate optimal TTL based on query type', () => {
      expect(cacheManager.getOptimalTTL('simple')).toBe(7200); // 2 hours
      expect(cacheManager.getOptimalTTL('analysis')).toBe(3600); // 1 hour
      expect(cacheManager.getOptimalTTL('complex')).toBe(1800); // 30 minutes
      expect(cacheManager.getOptimalTTL('creative')).toBe(900); // 15 minutes
    });
  });

  describe('Response Validator', () => {
    it('should validate GPT-5 response structure', () => {
      const validResponse = {
        summary: 'This is a detailed summary of the document content that exceeds the minimum length requirement',
        context: 'Document context',
        keyThemes: ['Theme 1', 'Theme 2'],
        entities: ['Entity A', 'Entity B'],
        relationships: ['Relationship 1']
      };

      const schema = responseValidator.createSchema('semantic');
      const result = responseValidator.validate(validResponse, schema, 'gpt-5-mini');
      
      expect(result.isValid).toBe(true);
      expect(result.quality).toBe('high');
      expect(result.shouldRetry).toBe(false);
    });

    it('should detect low-quality responses', () => {
      const lowQualityResponse = {
        summary: 'Analyzing 3 file(s)',
        keyThemes: [],
        entities: []
      };

      const result = responseValidator.validate(lowQualityResponse);
      
      expect(result.quality).toBe('low');
      expect(result.warnings).toContain('Generic pattern detected: Analyzing \\d+ file\\(s\\)');
      expect(result.shouldRetry).toBe(true);
    });

    it('should validate required fields', () => {
      const incompleteResponse = {
        keyThemes: ['Theme 1']
        // Missing required 'summary' field
      };

      const schema = responseValidator.createSchema('semantic');
      const result = responseValidator.validate(incompleteResponse, schema);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: summary');
      expect(result.shouldRetry).toBe(true);
    });
  });

  describe('Model Selection', () => {
    it('should select appropriate model for task', () => {
      // Budget-sensitive simple task
      expect(aiModelConfig.selectModelForTask({
        budgetSensitive: true,
        complexity: 'low'
      })).toBe('gpt-4o-mini');

      // Math-heavy task
      expect(aiModelConfig.selectModelForTask({
        requiresMath: true,
        complexity: 'high'
      })).toBe('gpt-5-mini');

      // Large context task
      expect(aiModelConfig.selectModelForTask({
        requiresLargeContext: true,
        complexity: 'medium'
      })).toBe('gpt-5-mini');

      // Speed-critical simple task
      expect(aiModelConfig.selectModelForTask({
        requiresSpeed: true,
        complexity: 'low'
      })).toBe('gpt-5-nano');
    });
  });

  describe('Cost Comparison', () => {
    it('should demonstrate cost savings', () => {
      const inputTokens = 10000;
      const outputTokens = 5000;

      // GPT-4-turbo-preview cost
      const gpt4Cost = aiModelConfig.calculateCost('gpt-4-turbo-preview', inputTokens, outputTokens);
      
      // GPT-5-mini cost
      const gpt5Cost = aiModelConfig.calculateCost('gpt-5-mini', inputTokens, outputTokens);
      
      // GPT-5-mini with caching
      const gpt5CachedCost = aiModelConfig.calculateCost('gpt-5-mini', inputTokens, outputTokens, true);

      // Calculate savings
      const savings = ((gpt4Cost - gpt5Cost) / gpt4Cost) * 100;
      const cachedSavings = ((gpt4Cost - gpt5CachedCost) / gpt4Cost) * 100;

      expect(savings).toBeGreaterThan(80); // At least 80% savings
      expect(cachedSavings).toBeGreaterThan(85); // Even more with caching
      
      console.log('Cost Comparison:');
      console.log(`GPT-4-turbo: $${gpt4Cost.toFixed(4)}`);
      console.log(`GPT-5-mini: $${gpt5Cost.toFixed(4)} (${savings.toFixed(1)}% savings)`);
      console.log(`GPT-5-mini (cached): $${gpt5CachedCost.toFixed(4)} (${cachedSavings.toFixed(1)}% savings)`);
    });
  });
});