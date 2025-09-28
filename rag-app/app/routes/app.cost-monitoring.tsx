/**
 * Cost Monitoring Page
 * Displays the GPT-5 migration cost monitoring dashboard
 */

import { json } from '@remix-run/node';
import type { LoaderFunction } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireUser } from '~/services/auth/auth.server';
import { CostMonitoringDashboard } from '~/components/CostMonitoringDashboard';
import { aiModelConfig } from '~/services/ai-model-config.server';

interface LoaderData {
  user: { id: string; email: string };
  modelConfig: {
    model: string;
    fallbackModel: string;
    contextWindow: number;
    maxTokens: number;
  };
  rolloutPercentage: number;
}

export const loader: LoaderFunction = async ({ request }) => {
  const user = await requireUser(request);
  const config = aiModelConfig.getConfig();
  
  return json<LoaderData>({
    user: {
      id: user.id,
      email: user.email
    },
    modelConfig: {
      model: config.model,
      fallbackModel: config.fallbackModel,
      contextWindow: config.contextWindow,
      maxTokens: config.maxTokens
    },
    rolloutPercentage: parseInt(process.env.GPT5_ROLLOUT_PERCENTAGE || '100')
  });
};

export default function CostMonitoring() {
  const { modelConfig, rolloutPercentage } = useLoaderData<LoaderData>();

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            AI Cost Monitoring
          </h1>
          <p className="mt-2 text-gray-600">
            Track API usage and costs for the GPT-5 migration
          </p>
        </div>

        {/* Model Information Banner */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Current Configuration
              </h3>
              <div className="mt-1 flex items-center gap-4 text-sm text-gray-600">
                <span>Model: <strong>{modelConfig.model}</strong></span>
                <span>•</span>
                <span>Context: <strong>{(modelConfig.contextWindow / 1000).toFixed(0)}K tokens</strong></span>
                <span>•</span>
                <span>Max Output: <strong>{(modelConfig.maxTokens / 1000).toFixed(0)}K tokens</strong></span>
                <span>•</span>
                <span>Rollout: <strong>{rolloutPercentage}%</strong></span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Fallback Model</div>
              <div className="text-sm font-medium text-gray-700">
                {modelConfig.fallbackModel}
              </div>
            </div>
          </div>
        </div>

        {/* Main Dashboard */}
        <CostMonitoringDashboard />

        {/* Additional Information */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cost Optimization Tips */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-3">Cost Optimization Tips</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Enable caching for repeated queries to save up to 90% on costs</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Use GPT-4o-mini for simple queries that don't require advanced reasoning</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Batch similar queries together to improve cache hit rates</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Monitor daily costs and adjust usage patterns as needed</span>
              </li>
            </ul>
          </div>

          {/* Migration Benefits */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-3">GPT-5-mini Benefits</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span><strong>83% cost reduction</strong> compared to GPT-4-turbo</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span><strong>3x larger context window</strong> (400K vs 128K tokens)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span><strong>16x better rate limits</strong> (500K TPM vs 30K TPM)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span><strong>Superior math accuracy</strong> (94.6% vs 42%)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}