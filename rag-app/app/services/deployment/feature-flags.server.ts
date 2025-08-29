import { redis } from '~/utils/redis.server';
import { prisma } from '~/utils/db.server';

export interface FeatureFlag {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  rolloutPercentage: number; // 0-100
  targetGroups?: string[]; // User groups or workspace IDs
  conditions?: FlagCondition[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface FlagCondition {
  type: 'user' | 'workspace' | 'time' | 'custom';
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
  value: any;
}

export interface RollbackConfig {
  errorThreshold: number; // Error rate percentage
  latencyThreshold: number; // Response time in ms
  checkInterval: number; // Check interval in seconds
  rollbackDelay: number; // Delay before rollback in seconds
}

/**
 * Feature flag and rollback management system
 */
export class FeatureFlagService {
  private static readonly CACHE_PREFIX = 'feature_flag:';
  private static readonly METRICS_PREFIX = 'metrics:';
  
  /**
   * Check if a feature is enabled for a user
   */
  static async isFeatureEnabled(
    flagName: string,
    userId?: string,
    workspaceId?: string,
    context?: Record<string, any>
  ): Promise<boolean> {
    // Get flag from cache or database
    const flag = await this.getFeatureFlag(flagName);
    if (!flag) return false;
    
    // Check if globally disabled
    if (!flag.enabled) return false;
    
    // Check target groups
    if (flag.targetGroups && flag.targetGroups.length > 0) {
      if (workspaceId && flag.targetGroups.includes(workspaceId)) {
        return true;
      }
      if (userId && flag.targetGroups.includes(userId)) {
        return true;
      }
    }
    
    // Check conditions
    if (flag.conditions && flag.conditions.length > 0) {
      for (const condition of flag.conditions) {
        if (!this.evaluateCondition(condition, { userId, workspaceId, ...context })) {
          return false;
        }
      }
    }
    
    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashString(userId || workspaceId || 'anonymous');
      const bucket = hash % 100;
      return bucket < flag.rolloutPercentage;
    }
    
    return true;
  }
  
  /**
   * Get feature flag by name
   */
  private static async getFeatureFlag(name: string): Promise<FeatureFlag | null> {
    // Check cache first
    const cacheKey = `${this.CACHE_PREFIX}${name}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Fallback to database
    const flag = await prisma.featureFlag.findUnique({
      where: { name }
    });
    
    if (flag) {
      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(flag));
      return flag as any;
    }
    
    return null;
  }
  
  /**
   * Evaluate a condition
   */
  private static evaluateCondition(
    condition: FlagCondition,
    context: Record<string, any>
  ): boolean {
    const value = context[condition.type];
    if (value === undefined) return false;
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'greater_than':
        return Number(value) > Number(condition.value);
      case 'less_than':
        return Number(value) < Number(condition.value);
      default:
        return false;
    }
  }
  
  /**
   * Hash string to number for consistent bucketing
   */
  private static hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  /**
   * Create or update a feature flag
   */
  static async upsertFeatureFlag(flag: Partial<FeatureFlag>): Promise<FeatureFlag> {
    const result = await prisma.featureFlag.upsert({
      where: { name: flag.name! },
      create: {
        name: flag.name!,
        description: flag.description,
        enabled: flag.enabled ?? false,
        rolloutPercentage: flag.rolloutPercentage ?? 0,
        targetGroups: flag.targetGroups || [],
        conditions: flag.conditions || [],
        metadata: flag.metadata || {},
      },
      update: {
        description: flag.description,
        enabled: flag.enabled,
        rolloutPercentage: flag.rolloutPercentage,
        targetGroups: flag.targetGroups,
        conditions: flag.conditions,
        metadata: flag.metadata,
      }
    });
    
    // Clear cache
    await redis.del(`${this.CACHE_PREFIX}${flag.name}`);
    
    return result as any;
  }
  
  /**
   * Gradually roll out a feature
   */
  static async gradualRollout(
    flagName: string,
    targetPercentage: number,
    incrementPercentage: number = 10,
    intervalHours: number = 24
  ): Promise<void> {
    const flag = await this.getFeatureFlag(flagName);
    if (!flag) throw new Error(`Feature flag ${flagName} not found`);
    
    const currentPercentage = flag.rolloutPercentage;
    
    if (currentPercentage >= targetPercentage) {
      return;
    }
    
    // Schedule incremental rollouts
    const steps = Math.ceil((targetPercentage - currentPercentage) / incrementPercentage);
    
    for (let i = 1; i <= steps; i++) {
      const newPercentage = Math.min(
        currentPercentage + incrementPercentage * i,
        targetPercentage
      );
      
      // Schedule update
      setTimeout(async () => {
        await this.upsertFeatureFlag({
          name: flagName,
          rolloutPercentage: newPercentage,
        });
        
        console.log(`[FeatureFlags] Rolled out ${flagName} to ${newPercentage}%`);
      }, intervalHours * 60 * 60 * 1000 * i);
    }
  }
}

/**
 * Automatic rollback system based on error rates
 */
export class RollbackService {
  private static monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  /**
   * Start monitoring a deployment for automatic rollback
   */
  static startMonitoring(
    deploymentId: string,
    config: RollbackConfig,
    onRollback: () => Promise<void>
  ): void {
    // Clear existing monitoring if any
    this.stopMonitoring(deploymentId);
    
    const interval = setInterval(async () => {
      const shouldRollback = await this.checkRollbackConditions(deploymentId, config);
      
      if (shouldRollback) {
        console.error(`[Rollback] Triggering rollback for deployment ${deploymentId}`);
        
        // Stop monitoring
        this.stopMonitoring(deploymentId);
        
        // Wait for rollback delay
        setTimeout(async () => {
          try {
            await onRollback();
            console.log(`[Rollback] Successfully rolled back deployment ${deploymentId}`);
          } catch (error) {
            console.error(`[Rollback] Failed to rollback deployment ${deploymentId}:`, error);
          }
        }, config.rollbackDelay * 1000);
      }
    }, config.checkInterval * 1000);
    
    this.monitoringIntervals.set(deploymentId, interval);
  }
  
  /**
   * Stop monitoring a deployment
   */
  static stopMonitoring(deploymentId: string): void {
    const interval = this.monitoringIntervals.get(deploymentId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(deploymentId);
    }
  }
  
  /**
   * Check if rollback conditions are met
   */
  private static async checkRollbackConditions(
    deploymentId: string,
    config: RollbackConfig
  ): Promise<boolean> {
    const metrics = await this.getDeploymentMetrics(deploymentId);
    
    // Check error rate
    if (metrics.errorRate > config.errorThreshold) {
      console.warn(
        `[Rollback] Error rate ${metrics.errorRate}% exceeds threshold ${config.errorThreshold}%`
      );
      return true;
    }
    
    // Check latency
    if (metrics.avgLatency > config.latencyThreshold) {
      console.warn(
        `[Rollback] Latency ${metrics.avgLatency}ms exceeds threshold ${config.latencyThreshold}ms`
      );
      return true;
    }
    
    // Check health checks
    if (metrics.healthChecksFailed > 0) {
      console.warn(`[Rollback] ${metrics.healthChecksFailed} health checks failed`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Get deployment metrics from Redis
   */
  private static async getDeploymentMetrics(deploymentId: string): Promise<{
    errorRate: number;
    avgLatency: number;
    healthChecksFailed: number;
  }> {
    const metricsKey = `${FeatureFlagService['METRICS_PREFIX']}${deploymentId}`;
    
    // Get metrics from Redis
    const [errors, requests, latencies, healthChecks] = await Promise.all([
      redis.get(`${metricsKey}:errors`) || '0',
      redis.get(`${metricsKey}:requests`) || '1',
      redis.lrange(`${metricsKey}:latencies`, 0, -1),
      redis.get(`${metricsKey}:health_failed`) || '0',
    ]);
    
    const errorCount = parseInt(errors as string);
    const requestCount = parseInt(requests as string);
    const errorRate = (errorCount / Math.max(1, requestCount)) * 100;
    
    const avgLatency = latencies.length > 0
      ? latencies.reduce((sum, l) => sum + parseInt(l), 0) / latencies.length
      : 0;
    
    return {
      errorRate,
      avgLatency,
      healthChecksFailed: parseInt(healthChecks as string),
    };
  }
  
  /**
   * Record deployment metrics
   */
  static async recordMetric(
    deploymentId: string,
    type: 'request' | 'error' | 'latency' | 'health',
    value?: number
  ): Promise<void> {
    const metricsKey = `${FeatureFlagService['METRICS_PREFIX']}${deploymentId}`;
    
    switch (type) {
      case 'request':
        await redis.incr(`${metricsKey}:requests`);
        break;
      case 'error':
        await redis.incr(`${metricsKey}:errors`);
        break;
      case 'latency':
        if (value !== undefined) {
          await redis.lpush(`${metricsKey}:latencies`, value);
          await redis.ltrim(`${metricsKey}:latencies`, 0, 99); // Keep last 100
        }
        break;
      case 'health':
        if (value === 0) {
          await redis.incr(`${metricsKey}:health_failed`);
        }
        break;
    }
    
    // Set expiry on metrics (1 hour)
    await redis.expire(`${metricsKey}:requests`, 3600);
    await redis.expire(`${metricsKey}:errors`, 3600);
    await redis.expire(`${metricsKey}:latencies`, 3600);
    await redis.expire(`${metricsKey}:health_failed`, 3600);
  }
}

/**
 * Canary deployment manager
 */
export class CanaryDeployment {
  /**
   * Start a canary deployment
   */
  static async startCanary(
    featureName: string,
    initialPercentage: number = 10,
    successThreshold: number = 95, // Success rate percentage
    duration: number = 3600 // Duration in seconds
  ): Promise<void> {
    // Enable feature for initial percentage
    await FeatureFlagService.upsertFeatureFlag({
      name: featureName,
      enabled: true,
      rolloutPercentage: initialPercentage,
      metadata: {
        deploymentType: 'canary',
        startTime: new Date(),
        successThreshold,
      }
    });
    
    // Monitor canary health
    const checkInterval = setInterval(async () => {
      const metrics = await RollbackService['getDeploymentMetrics'](featureName);
      const successRate = 100 - metrics.errorRate;
      
      if (successRate < successThreshold) {
        // Rollback canary
        console.error(`[Canary] Rolling back ${featureName} due to low success rate: ${successRate}%`);
        await FeatureFlagService.upsertFeatureFlag({
          name: featureName,
          enabled: false,
        });
        clearInterval(checkInterval);
      }
    }, 60000); // Check every minute
    
    // Gradually increase if successful
    setTimeout(async () => {
      clearInterval(checkInterval);
      
      const metrics = await RollbackService['getDeploymentMetrics'](featureName);
      const successRate = 100 - metrics.errorRate;
      
      if (successRate >= successThreshold) {
        // Promote to full rollout
        console.log(`[Canary] Promoting ${featureName} to full rollout`);
        await FeatureFlagService.gradualRollout(featureName, 100, 20, 1);
      } else {
        // Rollback
        console.error(`[Canary] Rolling back ${featureName} after duration`);
        await FeatureFlagService.upsertFeatureFlag({
          name: featureName,
          enabled: false,
        });
      }
    }, duration * 1000);
  }
}