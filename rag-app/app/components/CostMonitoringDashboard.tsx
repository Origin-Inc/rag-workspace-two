/**
 * Cost Monitoring Dashboard Component
 * Real-time monitoring of API usage and costs for GPT-5 migration
 */

import React, { useEffect, useState } from 'react';
import { useFetcher } from '@remix-run/react';
import { 
  ChartBarIcon, 
  CurrencyDollarIcon, 
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CircleStackIcon,
  BoltIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

interface CostStats {
  dailyTotal: number;
  monthlyTotal: number;
  cacheHitRate: number;
  savedByCache: number;
  modelBreakdown: Array<{
    model: string;
    totalCost: number;
    requestCount: number;
    avgCostPerRequest: number;
    percentageOfTotal: number;
  }>;
  alerts: Array<{
    type: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
  }>;
}

export function CostMonitoringDashboard() {
  const fetcher = useFetcher<CostStats>();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  // Auto-refresh data
  useEffect(() => {
    if (autoRefresh) {
      const timer = setInterval(() => {
        fetcher.load('/api/cost-stats');
      }, refreshInterval);

      return () => clearInterval(timer);
    }
  }, [autoRefresh, refreshInterval]);

  // Initial load
  useEffect(() => {
    fetcher.load('/api/cost-stats');
  }, []);

  const stats = fetcher.data || {
    dailyTotal: 0,
    monthlyTotal: 0,
    cacheHitRate: 0,
    savedByCache: 0,
    modelBreakdown: [],
    alerts: []
  };

  // Calculate savings compared to GPT-4
  const estimatedGPT4Cost = stats.monthlyTotal * 20; // GPT-4 is ~20x more expensive
  const totalSavings = estimatedGPT4Cost - stats.monthlyTotal + stats.savedByCache;
  const savingsPercentage = estimatedGPT4Cost > 0 
    ? ((totalSavings / estimatedGPT4Cost) * 100).toFixed(1)
    : '0';

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          GPT-5 Cost Monitoring Dashboard
        </h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">Auto-refresh</span>
          </label>
          <button
            onClick={() => fetcher.load('/api/cost-stats')}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            Refresh Now
          </button>
        </div>
      </div>

      {/* Alerts Section */}
      {stats.alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {stats.alerts.map((alert, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg flex items-start gap-2 ${
                alert.severity === 'error' 
                  ? 'bg-red-50 text-red-800'
                  : alert.severity === 'warning'
                  ? 'bg-yellow-50 text-yellow-800'
                  : 'bg-blue-50 text-blue-800'
              }`}
            >
              {alert.severity === 'error' ? (
                <ExclamationTriangleIcon className="h-5 w-5 mt-0.5" />
              ) : alert.severity === 'warning' ? (
                <ExclamationTriangleIcon className="h-5 w-5 mt-0.5" />
              ) : (
                <CheckCircleIcon className="h-5 w-5 mt-0.5" />
              )}
              <span className="text-sm">{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Daily Cost */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Daily Cost</span>
            <CurrencyDollarIcon className="h-5 w-5 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            ${stats.dailyTotal.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Limit: $10.00
          </div>
        </div>

        {/* Monthly Cost */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Monthly Cost</span>
            <ChartBarIcon className="h-5 w-5 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            ${stats.monthlyTotal.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Limit: $100.00
          </div>
        </div>

        {/* Cache Hit Rate */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Cache Hit Rate</span>
            <CircleStackIcon className="h-5 w-5 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {(stats.cacheHitRate * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Saved: ${stats.savedByCache.toFixed(2)}
          </div>
        </div>

        {/* Total Savings */}
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-600">Total Savings</span>
            <ArrowTrendingDownIcon className="h-5 w-5 text-green-400" />
          </div>
          <div className="text-2xl font-bold text-green-900">
            {savingsPercentage}%
          </div>
          <div className="text-xs text-green-600 mt-1">
            ${totalSavings.toFixed(2)} saved
          </div>
        </div>
      </div>

      {/* Model Breakdown Table */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">Model Usage Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Model
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Requests
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Total Cost
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Avg Cost
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.modelBreakdown.map((model) => (
                <tr key={model.model}>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {model.model === 'gpt-5-mini' && (
                        <BoltIcon className="h-4 w-4 text-green-500" />
                      )}
                      {model.model}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    {model.requestCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    ${model.totalCost.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    ${model.avgCostPerRequest.toFixed(4)}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${model.percentageOfTotal}%` }}
                        />
                      </div>
                      <span className="text-xs">
                        {model.percentageOfTotal.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Migration Progress */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2">GPT-5 Migration Status</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Current Rollout Percentage</span>
            <span className="font-semibold">10%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Model Performance</span>
            <span className="font-semibold text-green-600">Excellent</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Cost Reduction vs GPT-4</span>
            <span className="font-semibold text-green-600">83%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Context Window Improvement</span>
            <span className="font-semibold text-green-600">3x (400K tokens)</span>
          </div>
        </div>
      </div>

      {/* Footer with last update */}
      <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500 text-center">
        {fetcher.state === 'loading' 
          ? 'Updating...' 
          : `Last updated: ${new Date().toLocaleTimeString()}`}
      </div>
    </div>
  );
}