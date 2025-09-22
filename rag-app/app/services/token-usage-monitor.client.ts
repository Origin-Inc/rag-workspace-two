/**
 * Token Usage Monitor for tracking context window usage
 */

export interface TokenUsageEntry {
  timestamp: Date;
  query: string;
  model: string;
  contextTokens: number;
  responseTokens: number;
  totalTokens: number;
  truncated: boolean;
  samplingStrategy?: string;
}

export class TokenUsageMonitor {
  private static instance: TokenUsageMonitor;
  private usageHistory: TokenUsageEntry[] = [];
  private readonly MAX_HISTORY = 100;
  
  private constructor() {}
  
  public static getInstance(): TokenUsageMonitor {
    if (!TokenUsageMonitor.instance) {
      TokenUsageMonitor.instance = new TokenUsageMonitor();
    }
    return TokenUsageMonitor.instance;
  }
  
  /**
   * Record token usage for a query
   */
  public recordUsage(entry: Omit<TokenUsageEntry, 'timestamp'>): void {
    const fullEntry: TokenUsageEntry = {
      ...entry,
      timestamp: new Date(),
    };
    
    this.usageHistory.push(fullEntry);
    
    // Maintain max history size
    if (this.usageHistory.length > this.MAX_HISTORY) {
      this.usageHistory.shift();
    }
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Token Usage]', {
        query: entry.query.substring(0, 50) + '...',
        model: entry.model,
        tokens: {
          context: entry.contextTokens,
          response: entry.responseTokens,
          total: entry.totalTokens,
        },
        efficiency: ((entry.responseTokens / entry.totalTokens) * 100).toFixed(1) + '%',
        truncated: entry.truncated,
        strategy: entry.samplingStrategy,
      });
    }
  }
  
  /**
   * Get usage statistics
   */
  public getStatistics(): {
    totalQueries: number;
    averageContextTokens: number;
    averageResponseTokens: number;
    averageTotalTokens: number;
    truncationRate: number;
    samplingStrategies: Record<string, number>;
    tokensByModel: Record<string, { count: number; avgTokens: number }>;
  } {
    if (this.usageHistory.length === 0) {
      return {
        totalQueries: 0,
        averageContextTokens: 0,
        averageResponseTokens: 0,
        averageTotalTokens: 0,
        truncationRate: 0,
        samplingStrategies: {},
        tokensByModel: {},
      };
    }
    
    const totalQueries = this.usageHistory.length;
    const contextSum = this.usageHistory.reduce((sum, e) => sum + e.contextTokens, 0);
    const responseSum = this.usageHistory.reduce((sum, e) => sum + e.responseTokens, 0);
    const totalSum = this.usageHistory.reduce((sum, e) => sum + e.totalTokens, 0);
    const truncatedCount = this.usageHistory.filter(e => e.truncated).length;
    
    // Count sampling strategies
    const samplingStrategies: Record<string, number> = {};
    this.usageHistory.forEach(entry => {
      if (entry.samplingStrategy) {
        samplingStrategies[entry.samplingStrategy] = (samplingStrategies[entry.samplingStrategy] || 0) + 1;
      }
    });
    
    // Group by model
    const tokensByModel: Record<string, { count: number; avgTokens: number }> = {};
    const modelGroups = this.groupBy(this.usageHistory, 'model');
    
    for (const [model, entries] of Object.entries(modelGroups)) {
      const modelTotal = entries.reduce((sum, e) => sum + e.totalTokens, 0);
      tokensByModel[model] = {
        count: entries.length,
        avgTokens: Math.round(modelTotal / entries.length),
      };
    }
    
    return {
      totalQueries,
      averageContextTokens: Math.round(contextSum / totalQueries),
      averageResponseTokens: Math.round(responseSum / totalQueries),
      averageTotalTokens: Math.round(totalSum / totalQueries),
      truncationRate: (truncatedCount / totalQueries) * 100,
      samplingStrategies,
      tokensByModel,
    };
  }
  
  /**
   * Get recent usage history
   */
  public getRecentUsage(limit: number = 10): TokenUsageEntry[] {
    return this.usageHistory.slice(-limit);
  }
  
  /**
   * Check if approaching token limit
   */
  public isApproachingLimit(currentTokens: number, model: string): {
    approaching: boolean;
    percentage: number;
    remaining: number;
  } {
    const limits: Record<string, number> = {
      'gpt-4-turbo-preview': 128000,
      'gpt-4-turbo': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16384,
    };
    
    const limit = limits[model] || 128000;
    const percentage = (currentTokens / limit) * 100;
    const remaining = limit - currentTokens;
    
    return {
      approaching: percentage > 80,
      percentage,
      remaining,
    };
  }
  
  /**
   * Clear usage history
   */
  public clearHistory(): void {
    this.usageHistory = [];
  }
  
  /**
   * Export usage data for analysis
   */
  public exportData(): string {
    return JSON.stringify(this.usageHistory, null, 2);
  }
  
  /**
   * Helper to group array by property
   */
  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const group = String(item[key]);
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }
}

// Export singleton instance
export const tokenMonitor = TokenUsageMonitor.getInstance();