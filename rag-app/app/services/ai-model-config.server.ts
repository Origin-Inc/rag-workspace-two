/**
 * AI Model Configuration Service
 * Centralized configuration for OpenAI models with GPT-5-mini support
 * Includes fallback mechanisms and cost optimization settings
 */

import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('ai-model-config');

export interface ModelConfig {
  model: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  cacheEnabled: boolean;
  verbosity: 'low' | 'medium' | 'high';
  reasoningEffort: 'minimal' | 'medium' | 'maximum';
}

export interface ModelPricing {
  inputCost: number;  // Cost per 1M tokens
  outputCost: number; // Cost per 1M tokens
  cachedCost: number; // Cost per 1M cached tokens
}

export class AIModelConfigService {
  private static instance: AIModelConfigService;
  private config: ModelConfig;
  private pricing: Record<string, ModelPricing>;

  private constructor() {
    // Initialize with environment variable or default to gpt-5-mini
    const modelName = process.env.OPENAI_MODEL || 'gpt-5-mini';
    
    this.config = {
      model: modelName,
      fallbackModel: process.env.OPENAI_FALLBACK_MODEL || 'gpt-5-mini',
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '8000'),
      contextWindow: this.getContextWindow(modelName),
      cacheEnabled: process.env.ENABLE_CACHE !== 'false',
      verbosity: (process.env.OPENAI_VERBOSITY as any) || 'medium',
      reasoningEffort: (process.env.OPENAI_REASONING as any) || 'minimal'
    };

    // Model pricing in USD per 1M tokens
    this.pricing = {
      'gpt-5-mini': {
        inputCost: 0.25,
        outputCost: 2.00,
        cachedCost: 0.03
      },
      'gpt-5-nano': {
        inputCost: 0.10,
        outputCost: 0.80,
        cachedCost: 0.01
      },
      'gpt-4-turbo-preview': {
        inputCost: 10.00,
        outputCost: 30.00,
        cachedCost: 5.00
      },
      'gpt-4o-mini': {
        inputCost: 0.15,
        outputCost: 0.60,
        cachedCost: 0.075
      },
      'gpt-4o': {
        inputCost: 5.00,
        outputCost: 15.00,
        cachedCost: 2.50
      }
    };

    logger.trace('AI Model Configuration initialized', {
      model: this.config.model,
      fallback: this.config.fallbackModel,
      maxTokens: this.config.maxTokens,
      contextWindow: this.config.contextWindow,
      cacheEnabled: this.config.cacheEnabled
    });
  }

  static getInstance(): AIModelConfigService {
    if (!AIModelConfigService.instance) {
      AIModelConfigService.instance = new AIModelConfigService();
    }
    return AIModelConfigService.instance;
  }

  /**
   * Get current model configuration
   */
  getConfig(): ModelConfig {
    return { ...this.config };
  }

  /**
   * Get model name with feature flag support
   */
  async getModelName(userId?: string, useFeatureFlag = true): Promise<string> {
    // Check feature flag for gradual rollout
    if (useFeatureFlag && userId) {
      const rolloutPercentage = parseInt(process.env.GPT5_ROLLOUT_PERCENTAGE || '100');
      
      if (rolloutPercentage < 100) {
        // Use simple hash-based rollout
        const userHash = this.hashUserId(userId);
        const isInRollout = (userHash % 100) < rolloutPercentage;
        
        if (!isInRollout) {
          logger.trace('User not in GPT-5 rollout, using fallback', {
            userId,
            rolloutPercentage,
            fallbackModel: this.config.fallbackModel
          });
          return this.config.fallbackModel;
        }
      }
    }

    return this.config.model;
  }

  /**
   * Get context window size for a model
   */
  private getContextWindow(model: string): number {
    const windows: Record<string, number> = {
      'gpt-5-mini': 400000,
      'gpt-5-nano': 200000,
      'gpt-5': 500000,
      'gpt-4-turbo-preview': 128000,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16384
    };

    return windows[model] || 100000;
  }

  /**
   * Get optimal parameters for a specific query type
   */
  getOptimalParameters(queryType: 'simple' | 'analysis' | 'complex' | 'creative') {
    const baseConfig = this.getConfig();

    switch (queryType) {
      case 'simple':
        return {
          ...baseConfig,
          temperature: 0.1,
          maxTokens: 2000,
          reasoningEffort: 'minimal' as const,
          verbosity: 'low' as const
        };
      
      case 'analysis':
        return {
          ...baseConfig,
          temperature: 0.3,
          maxTokens: 6000,
          reasoningEffort: 'medium' as const,
          verbosity: 'medium' as const
        };
      
      case 'complex':
        return {
          ...baseConfig,
          temperature: 0.4,
          maxTokens: 10000,
          reasoningEffort: 'maximum' as const,
          verbosity: 'high' as const
        };
      
      case 'creative':
        return {
          ...baseConfig,
          temperature: 0.7,
          maxTokens: 8000,
          reasoningEffort: 'medium' as const,
          verbosity: 'medium' as const
        };
      
      default:
        return baseConfig;
    }
  }

  /**
   * Build OpenAI API parameters with GPT-5 enhancements
   */
  buildAPIParameters(options: {
    messages: any[];
    jsonResponse?: boolean;
    jsonSchema?: any;
    stream?: boolean;
    customTools?: boolean;
    queryType?: 'simple' | 'analysis' | 'complex' | 'creative';
  }) {
    const params = this.getOptimalParameters(options.queryType || 'analysis');

    const apiParams: any = {
      model: params.model,
      messages: options.messages,
      // gpt-5-mini only supports temperature=1
      ...(params.model === 'gpt-5-mini' 
        ? {} // Don't include temperature for gpt-5-mini (uses default of 1)
        : { temperature: params.temperature }),
      // Use max_completion_tokens for newer models (gpt-5, etc), max_tokens for older ones
      ...(params.model.includes('gpt-5') || params.model.includes('gpt-4o') 
        ? { max_completion_tokens: params.maxTokens } 
        : { max_tokens: params.maxTokens })
    };

    // Add GPT-5 specific parameters
    if (params.model.includes('gpt-5')) {
      // Note: verbosity and reasoning_effort are GPT-5 features that may not be available yet
      // Commenting out until confirmed available in API
      // apiParams.verbosity = params.verbosity;
      // apiParams.reasoning_effort = params.reasoningEffort;

      // Note: cache_control is not supported by OpenAI API
      // Caching should be implemented at application level instead
    }

    // Handle JSON response format
    if (options.jsonResponse) {
      // Use standard JSON mode (json_schema not yet widely available)
      apiParams.response_format = { type: 'json_object' };
    }

    // Handle custom tools for raw text output (GPT-5 feature)
    // Note: custom tools with plaintext format not yet supported by API
    // if (options.customTools && params.model.includes('gpt-5')) {
    //   apiParams.tools = [{ type: 'custom', format: 'plaintext' }];
    // }

    // Enable streaming if requested
    if (options.stream) {
      apiParams.stream = true;
    }

    return apiParams;
  }

  /**
   * Calculate cost for a completion
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number, cached = false): number {
    const pricing = this.pricing[model];
    
    if (!pricing) {
      logger.warn('No pricing data for model', { model });
      return 0;
    }

    const inputCost = (inputTokens / 1_000_000) * (cached ? pricing.cachedCost : pricing.inputCost);
    const outputCost = (outputTokens / 1_000_000) * pricing.outputCost;
    
    return inputCost + outputCost;
  }

  /**
   * Get model pricing information
   */
  getPricing(model?: string): ModelPricing | Record<string, ModelPricing> {
    if (model) {
      return this.pricing[model];
    }
    return this.pricing;
  }

  /**
   * Simple hash function for user ID based rollout
   */
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Check if model supports a specific feature
   */
  supportsFeature(model: string, feature: 'json_schema' | 'custom_tools' | 'verbosity' | 'caching'): boolean {
    const gpt5Features = ['json_schema', 'custom_tools', 'verbosity', 'caching'];
    
    if (model.includes('gpt-5')) {
      return gpt5Features.includes(feature);
    }

    // GPT-4 models support basic features
    if (model.includes('gpt-4')) {
      return feature === 'caching' || feature === 'json_schema';
    }

    return false;
  }

  /**
   * Select best model for a specific task
   */
  selectModelForTask(task: {
    requiresLargeContext?: boolean;
    requiresMath?: boolean;
    requiresSpeed?: boolean;
    budgetSensitive?: boolean;
    complexity: 'low' | 'medium' | 'high';
  }): string {
    // For budget-sensitive simple tasks - use gpt-5-mini for good balance
    if (task.budgetSensitive && task.complexity === 'low') {
      return 'gpt-5-mini';
    }

    // For math-heavy or analytical tasks
    if (task.requiresMath || task.requiresLargeContext) {
      return 'gpt-5-mini';
    }

    // For speed-critical simple tasks (when available)
    if (task.requiresSpeed && task.complexity === 'low') {
      return 'gpt-5-nano'; // Will fallback to gpt-5-mini if not available
    }

    // Default to configured model
    return this.config.model;
  }
}

// Export singleton instance
export const aiModelConfig = AIModelConfigService.getInstance();