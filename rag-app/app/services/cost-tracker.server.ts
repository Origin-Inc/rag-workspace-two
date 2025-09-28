/**
 * Cost Tracking Service
 * Real-time tracking of API usage and costs with alerting
 */

import { prisma } from '~/utils/prisma.server';
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

export interface CostAlert {
  type: 'daily' | 'monthly' | 'per_request';
  threshold: number;
  currentValue: number;
  message: string;
}

export class CostTrackerService {
  private static instance: CostTrackerService;
  private dailyLimit: number;
  private monthlyLimit: number;
  private perRequestLimit: number;

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

      // Store in database
      await this.storeUsageRecord({
        model,
        inputTokens,
        outputTokens,
        totalCost,
        cached,
        userId,
        requestId,
        timestamp: new Date()
      });

      // Check for alerts
      const alerts = await this.checkAlerts(userId);
      if (alerts.length > 0) {
        this.handleAlerts(alerts, requestId);
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
   * Store usage record in database
   */
  private async storeUsageRecord(record: UsageRecord): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO api_usage (
          model, 
          input_tokens, 
          output_tokens, 
          total_cost, 
          cached, 
          user_id, 
          request_id, 
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        record.model, record.inputTokens, record.outputTokens, record.totalCost, record.cached, record.userId || null, record.requestId || null, record.timestamp
      );
    } catch (error) {
      // If table doesn't exist, log warning but don't fail
      logger.warn('Could not store usage record (table may not exist)', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get daily total cost
   */
  async getDailyTotal(userId?: string): Promise<number> {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const result = await prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COALESCE(SUM(total_cost), 0) as total
        FROM api_usage
        WHERE created_at >= ${startOfDay}
        ${userId ? prisma.$queryRaw`AND user_id = ${userId}` : prisma.$queryRaw``}
      `;

      return result[0]?.total || 0;
    } catch (error) {
      logger.warn('Could not get daily total', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  /**
   * Get monthly total cost
   */
  async getMonthlyTotal(userId?: string): Promise<number> {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const result = await prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COALESCE(SUM(total_cost), 0) as total
        FROM api_usage
        WHERE created_at >= ${startOfMonth}
        ${userId ? prisma.$queryRaw`AND user_id = ${userId}` : prisma.$queryRaw``}
      `;

      return result[0]?.total || 0;
    } catch (error) {
      logger.warn('Could not get monthly total', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  /**
   * Check for cost alerts
   */
  private async checkAlerts(userId?: string): Promise<CostAlert[]> {
    const alerts: CostAlert[] = [];

    // Check daily limit
    const dailyTotal = await this.getDailyTotal(userId);
    if (dailyTotal > this.dailyLimit * 0.8) {
      alerts.push({
        type: 'daily',
        threshold: this.dailyLimit,
        currentValue: dailyTotal,
        message: `Daily cost approaching limit: $${dailyTotal.toFixed(2)} of $${this.dailyLimit}`
      });
    }

    // Check monthly limit
    const monthlyTotal = await this.getMonthlyTotal(userId);
    if (monthlyTotal > this.monthlyLimit * 0.8) {
      alerts.push({
        type: 'monthly',
        threshold: this.monthlyLimit,
        currentValue: monthlyTotal,
        message: `Monthly cost approaching limit: $${monthlyTotal.toFixed(2)} of $${this.monthlyLimit}`
      });
    }

    return alerts;
  }

  /**
   * Handle cost alerts
   */
  private handleAlerts(alerts: CostAlert[], requestId: string): void {
    for (const alert of alerts) {
      logger.warn('Cost alert triggered', {
        requestId,
        alertType: alert.type,
        threshold: alert.threshold,
        currentValue: alert.currentValue,
        message: alert.message
      });

      // TODO: Send notifications (email, Slack, etc.)
      // This would integrate with your notification service
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(options: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    groupBy?: 'hour' | 'day' | 'week' | 'month';
  }) {
    const { userId, startDate, endDate, groupBy = 'day' } = options;

    try {
      // Build date filter
      const dateFilter = [];
      if (startDate) {
        dateFilter.push(prisma.$queryRaw`created_at >= ${startDate}`);
      }
      if (endDate) {
        dateFilter.push(prisma.$queryRaw`created_at <= ${endDate}`);
      }

      // Determine grouping
      const timeFormat = {
        hour: "DATE_TRUNC('hour', created_at)",
        day: "DATE_TRUNC('day', created_at)",
        week: "DATE_TRUNC('week', created_at)",
        month: "DATE_TRUNC('month', created_at)"
      }[groupBy];

      const query = `
        SELECT 
          ${timeFormat} as period,
          model,
          COUNT(*) as request_count,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(total_cost) as total_cost,
          AVG(total_cost) as avg_cost_per_request,
          SUM(CASE WHEN cached THEN 1 ELSE 0 END) as cached_requests
        FROM api_usage
        WHERE 1=1
        ${userId ? `AND user_id = '${userId}'` : ''}
        ${startDate ? `AND created_at >= '${startDate.toISOString()}'` : ''}
        ${endDate ? `AND created_at <= '${endDate.toISOString()}'` : ''}
        GROUP BY period, model
        ORDER BY period DESC
      `;

      const results = await prisma.$queryRawUnsafe(query);
      
      return results;
    } catch (error) {
      logger.error('Failed to get usage stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
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
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await prisma.$queryRaw<Array<{
        total_spent: number;
        cached_count: number;
        total_count: number;
      }>>`
        SELECT 
          SUM(total_cost) as total_spent,
          SUM(CASE WHEN cached THEN 1 ELSE 0 END) as cached_count,
          COUNT(*) as total_count
        FROM api_usage
        WHERE created_at >= ${startDate}
        ${userId ? prisma.$queryRaw`AND user_id = ${userId}` : prisma.$queryRaw``}
      `;

      const result = stats[0] || { total_spent: 0, cached_count: 0, total_count: 0 };
      const cacheHitRate = result.total_count > 0 
        ? (result.cached_count / result.total_count) 
        : 0;

      // Calculate potential savings (assuming 30% of queries could be cached)
      const targetCacheRate = 0.3;
      const avgCostReduction = 0.9; // 90% cost reduction for cached queries
      const potentialSavings = result.total_spent * targetCacheRate * avgCostReduction;

      // Recommend cache TTL based on usage patterns
      const recommendedCacheTTL = cacheHitRate < 0.1 ? 3600 : // 1 hour for low hit rate
                                  cacheHitRate < 0.2 ? 7200 : // 2 hours for medium
                                  10800; // 3 hours for high

      return {
        totalSpent: result.total_spent || 0,
        potentialSavings,
        cacheHitRate,
        recommendedCacheTTL
      };
    } catch (error) {
      logger.error('Failed to calculate cache savings', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        totalSpent: 0,
        potentialSavings: 0,
        cacheHitRate: 0,
        recommendedCacheTTL: 3600
      };
    }
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
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const breakdown = await prisma.$queryRaw<Array<{
        model: string;
        total_cost: number;
        request_count: number;
        avg_cost: number;
      }>>`
        SELECT 
          model,
          SUM(total_cost) as total_cost,
          COUNT(*) as request_count,
          AVG(total_cost) as avg_cost
        FROM api_usage
        WHERE created_at >= ${startDate}
        ${userId ? prisma.$queryRaw`AND user_id = ${userId}` : prisma.$queryRaw``}
        GROUP BY model
        ORDER BY total_cost DESC
      `;

      const totalCost = breakdown.reduce((sum, item) => sum + (item.total_cost || 0), 0);

      return breakdown.map(item => ({
        model: item.model,
        totalCost: item.total_cost || 0,
        requestCount: item.request_count || 0,
        avgCostPerRequest: item.avg_cost || 0,
        percentageOfTotal: totalCost > 0 ? ((item.total_cost || 0) / totalCost) * 100 : 0
      }));
    } catch (error) {
      logger.error('Failed to get cost breakdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }
}

// Export singleton instance
export const costTracker = CostTrackerService.getInstance();