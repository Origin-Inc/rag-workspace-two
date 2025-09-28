/**
 * API endpoint for cost statistics
 * Provides real-time cost monitoring data for the dashboard
 */

import { json } from '@remix-run/node';
import type { LoaderFunction } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { costTracker } from '~/services/cost-tracker-simple.server';
// import { cacheManager } from '~/services/cache-manager.server';

export const loader: LoaderFunction = async ({ request }) => {
  try {
    // Require authentication
    const user = await requireUser(request);
    
    // Get cost statistics
    const [
      dailyTotal,
      monthlyTotal,
      costBreakdown,
      cacheSavings,
      cacheStats
    ] = await Promise.all([
      costTracker.getDailyTotal(user.id),
      costTracker.getMonthlyTotal(user.id),
      costTracker.getCostBreakdown(user.id, 30),
      costTracker.calculateCacheSavings(user.id, 30),
      Promise.resolve({ hits: 0, misses: 0, hitRate: 0, savedCost: 0, savedTokens: 0 })
    ]);

    // Check for alerts
    const alerts = [];
    
    // Daily limit alert
    const dailyLimit = parseFloat(process.env.DAILY_COST_LIMIT || '10');
    if (dailyTotal > dailyLimit * 0.8) {
      alerts.push({
        type: 'cost',
        severity: dailyTotal > dailyLimit ? 'error' : 'warning',
        message: `Daily cost ${dailyTotal > dailyLimit ? 'exceeded' : 'approaching'} limit: $${dailyTotal.toFixed(2)} of $${dailyLimit}`
      });
    }

    // Monthly limit alert
    const monthlyLimit = parseFloat(process.env.MONTHLY_COST_LIMIT || '100');
    if (monthlyTotal > monthlyLimit * 0.8) {
      alerts.push({
        type: 'cost',
        severity: monthlyTotal > monthlyLimit ? 'error' : 'warning',
        message: `Monthly cost ${monthlyTotal > monthlyLimit ? 'exceeded' : 'approaching'} limit: $${monthlyTotal.toFixed(2)} of $${monthlyLimit}`
      });
    }

    // Low cache hit rate alert
    if (cacheStats.hitRate < 0.1 && cacheStats.hits + cacheStats.misses > 10) {
      alerts.push({
        type: 'performance',
        severity: 'info',
        message: `Low cache hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%. Consider warming cache with common queries.`
      });
    }

    // Success alert if significant savings
    if (cacheSavings.potentialSavings > 50) {
      alerts.push({
        type: 'success',
        severity: 'info',
        message: `Great job! You're saving $${cacheSavings.potentialSavings.toFixed(2)} with caching.`
      });
    }

    return json({
      dailyTotal,
      monthlyTotal,
      cacheHitRate: cacheStats.hitRate,
      savedByCache: cacheStats.savedCost,
      modelBreakdown: costBreakdown,
      alerts,
      cacheSavings,
      cacheStats
    });
  } catch (error) {
    console.error('Failed to get cost stats:', error);
    
    // Return default values if there's an error
    return json({
      dailyTotal: 0,
      monthlyTotal: 0,
      cacheHitRate: 0,
      savedByCache: 0,
      modelBreakdown: [],
      alerts: [{
        type: 'error',
        severity: 'error',
        message: 'Failed to load cost statistics. Please check your configuration.'
      }]
    });
  }
};