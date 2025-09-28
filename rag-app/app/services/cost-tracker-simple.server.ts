/**
 * Simplified Cost Tracking Service
 * Real-time tracking of API usage and costs (without database dependency)
 */

import { DebugLogger } from '~/utils/debug-logger';
import { aiModelConfig } from './ai-model-config.server';

const logger = new DebugLogger('cost-tracker');

export interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  cached: boolean;
  userId?: string;
  requestId?: string;
  timestamp: Date;
}

export class CostTrackerService {
  private static instance: CostTrackerService;
  private dailyLimit: number;
  private monthlyLimit: number;
  private perRequestLimit: number;
  
  // In-memory storage for demonstration
  private usageRecords: UsageRecord[] = [];

  private constructor() {
    this.dailyLimit = parseFloat(process.env.DAILY_COST_LIMIT || '10');
    this.monthlyLimit = parseFloat(process.env.MONTHLY_COST_LIMIT || '100');
    this.perRequestLimit = parseFloat(process.env.PER_REQUEST_COST_LIMIT || '0.50');
  }

  static getInstance(): CostTrackerService {
    if (!CostTrackerService.instance) {
      CostTrackerService.instance = new CostTrackerService();
    }
    return CostTrackerService.instance;
  }

  /**
   * Track API usage and calculate cost
   */
  async trackUsage(completion: any, model: string, userId?: string, cached = false): Promise<number> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Extract token counts from OpenAI response
      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      const totalTokens = completion.usage?.total_tokens || 0;

      // Calculate cost using model config
      const totalCost = aiModelConfig.calculateCost(model, inputTokens, outputTokens, cached);

      // Log the usage
      logger.trace('API usage tracked', {
        requestId,
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        totalCost,
        cached,
        userId
      });

      // Store in memory (in production, this would be database)
      const record: UsageRecord = {
        model,
        inputTokens,
        outputTokens,
        totalCost,
        cached,
        userId,
        requestId,
        timestamp: new Date()
      };
      
      this.usageRecords.push(record);
      
      // Keep only last 1000 records in memory
      if (this.usageRecords.length > 1000) {
        this.usageRecords = this.usageRecords.slice(-1000);
      }

      return totalCost;
    } catch (error) {
      logger.error('Failed to track usage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        model
      });
      return 0;
    }
  }

  /**
   * Get daily total cost
   */
  async getDailyTotal(userId?: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const dailyRecords = this.usageRecords.filter(record => {
      const matchesDate = record.timestamp >= startOfDay;
      const matchesUser = !userId || record.userId === userId;
      return matchesDate && matchesUser;
    });
    
    return dailyRecords.reduce((sum, record) => sum + record.totalCost, 0);
  }

  /**
   * Get monthly total cost
   */
  async getMonthlyTotal(userId?: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const monthlyRecords = this.usageRecords.filter(record => {
      const matchesDate = record.timestamp >= startOfMonth;
      const matchesUser = !userId || record.userId === userId;
      return matchesDate && matchesUser;
    });
    
    return monthlyRecords.reduce((sum, record) => sum + record.totalCost, 0);
  }

  /**
   * Calculate potential savings with caching
   */
  async calculateCacheSavings(userId?: string, days = 30): Promise<{
    totalSpent: number;
    potentialSavings: number;
    cacheHitRate: number;
    recommendedCacheTTL: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const relevantRecords = this.usageRecords.filter(record => {
      const matchesDate = record.timestamp >= startDate;
      const matchesUser = !userId || record.userId === userId;
      return matchesDate && matchesUser;
    });
    
    const totalSpent = relevantRecords.reduce((sum, r) => sum + r.totalCost, 0);
    const cachedCount = relevantRecords.filter(r => r.cached).length;
    const totalCount = relevantRecords.length;
    
    const cacheHitRate = totalCount > 0 ? cachedCount / totalCount : 0;
    
    // Calculate potential savings (assuming 30% of queries could be cached)
    const targetCacheRate = 0.3;
    const avgCostReduction = 0.9; // 90% cost reduction for cached queries
    const potentialSavings = totalSpent * targetCacheRate * avgCostReduction;
    
    // Recommend cache TTL based on usage patterns
    const recommendedCacheTTL = cacheHitRate < 0.1 ? 3600 : // 1 hour for low hit rate
                                cacheHitRate < 0.2 ? 7200 : // 2 hours for medium
                                10800; // 3 hours for high
    
    return {
      totalSpent,
      potentialSavings,
      cacheHitRate,
      recommendedCacheTTL
    };
  }

  /**
   * Get cost breakdown by model
   */
  async getCostBreakdown(userId?: string, days = 30): Promise<Array<{
    model: string;
    totalCost: number;
    requestCount: number;
    avgCostPerRequest: number;
    percentageOfTotal: number;
  }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const relevantRecords = this.usageRecords.filter(record => {
      const matchesDate = record.timestamp >= startDate;
      const matchesUser = !userId || record.userId === userId;
      return matchesDate && matchesUser;
    });
    
    // Group by model
    const breakdown = new Map<string, {
      totalCost: number;
      requestCount: number;
    }>();
    
    for (const record of relevantRecords) {
      const existing = breakdown.get(record.model) || { totalCost: 0, requestCount: 0 };
      breakdown.set(record.model, {
        totalCost: existing.totalCost + record.totalCost,
        requestCount: existing.requestCount + 1
      });
    }
    
    const totalCost = Array.from(breakdown.values())
      .reduce((sum, item) => sum + item.totalCost, 0);
    
    // Convert to array and sort
    const results = Array.from(breakdown.entries())
      .map(([model, data]) => ({
        model,
        totalCost: data.totalCost,
        requestCount: data.requestCount,
        avgCostPerRequest: data.requestCount > 0 ? data.totalCost / data.requestCount : 0,
        percentageOfTotal: totalCost > 0 ? (data.totalCost / totalCost) * 100 : 0
      }))
      .sort((a, b) => b.totalCost - a.totalCost);
    
    return results;
  }

  /**
   * Get recent usage records
   */
  getRecentRecords(limit = 10): UsageRecord[] {
    return this.usageRecords.slice(-limit).reverse();
  }

  /**
   * Clear all records (for testing)
   */
  clearRecords(): void {
    this.usageRecords = [];
    logger.info('All usage records cleared');
  }
}

// Export singleton instance
export const costTracker = CostTrackerService.getInstance();