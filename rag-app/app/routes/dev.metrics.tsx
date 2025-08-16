import { useState, useEffect } from 'react';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { 
  ChartBarIcon, 
  ClockIcon, 
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CpuChipIcon,
  ServerIcon,
  BoltIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import { cn } from '~/utils/cn';

// This route is only available in development
export async function loader({ request }: LoaderFunctionArgs) {
  if (process.env.NODE_ENV === 'production' && !request.headers.get('X-Dev-Token')) {
    throw new Response('Not Found', { status: 404 });
  }

  return json({
    environment: process.env.NODE_ENV,
    timestamp: Date.now(),
  });
}

interface WebVitalsData {
  cls?: number;
  fcp?: number;
  lcp?: number;
  ttfb?: number;
  inp?: number;
}

interface APIMetric {
  endpoint: string;
  method: string;
  count: number;
  avgDuration: number;
  p95: number;
  p99: number;
  errorRate: number;
}

interface ComponentMetric {
  componentName: string;
  renderCount: number;
  avgRenderDuration: number;
  unnecessaryRenders: number;
}

export default function DevMetricsDashboard() {
  const { environment } = useLoaderData<typeof loader>();
  const [webVitals, setWebVitals] = useState<WebVitalsData>({});
  const [apiMetrics, setApiMetrics] = useState<APIMetric[]>([]);
  const [componentMetrics, setComponentMetrics] = useState<ComponentMetric[]>([]);
  const [memoryUsage, setMemoryUsage] = useState({ used: 0, total: 0, limit: 0 });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateMetrics = () => {
      // Get Web Vitals
      if ((window as any).performanceMonitor) {
        const metrics = (window as any).performanceMonitor.getCurrentMetrics();
        setWebVitals(metrics);
      }

      // Get API metrics
      if ((window as any).apiMonitor) {
        const stats = (window as any).apiMonitor.getStats();
        setApiMetrics(stats.slice(0, 10)); // Top 10 endpoints
      }

      // Get component metrics
      if ((window as any).componentTracker) {
        const metrics = (window as any).componentTracker.getMetrics();
        setComponentMetrics(
          metrics
            .sort((a: ComponentMetric, b: ComponentMetric) => b.renderCount - a.renderCount)
            .slice(0, 10)
        );
      }

      // Get memory usage
      if ((performance as any).memory) {
        const memory = (performance as any).memory;
        setMemoryUsage({
          used: memory.usedJSHeapSize / 1024 / 1024,
          total: memory.totalJSHeapSize / 1024 / 1024,
          limit: memory.jsHeapSizeLimit / 1024 / 1024,
        });
      }
    };

    updateMetrics(); // Initial update

    let intervalId: NodeJS.Timeout;
    if (autoRefresh) {
      intervalId = setInterval(updateMetrics, refreshInterval);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, refreshInterval]);

  const getVitalRating = (metric: string, value?: number): 'good' | 'needs-improvement' | 'poor' | 'unknown' => {
    if (value === undefined) return 'unknown';
    
    const thresholds: Record<string, [number, number]> = {
      cls: [0.1, 0.25],
      fcp: [1800, 3000],
      lcp: [2500, 4000],
      ttfb: [800, 1800],
      inp: [200, 500],
    };
    
    const [good, poor] = thresholds[metric] || [0, 0];
    if (value <= good) return 'good';
    if (value <= poor) return 'needs-improvement';
    return 'poor';
  };

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'good': return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20';
      case 'needs-improvement': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/20';
      case 'poor': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ChartBarIcon className="h-6 w-6" />
              Developer Metrics Dashboard
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Real-time performance monitoring • Environment: {environment}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            >
              <option value="1000">1s</option>
              <option value="5000">5s</option>
              <option value="10000">10s</option>
              <option value="30000">30s</option>
            </select>
            
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                "px-3 py-1 text-sm rounded-lg flex items-center gap-2",
                autoRefresh 
                  ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400"
              )}
            >
              <ArrowPathIcon className={cn("h-4 w-4", autoRefresh && "animate-spin")} />
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </button>
          </div>
        </div>

        {/* Web Vitals */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <BoltIcon className="h-5 w-5" />
            Core Web Vitals
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { key: 'cls', label: 'CLS', unit: '', description: 'Cumulative Layout Shift' },
              { key: 'fcp', label: 'FCP', unit: 'ms', description: 'First Contentful Paint' },
              { key: 'lcp', label: 'LCP', unit: 'ms', description: 'Largest Contentful Paint' },
              { key: 'ttfb', label: 'TTFB', unit: 'ms', description: 'Time to First Byte' },
              { key: 'inp', label: 'INP', unit: 'ms', description: 'Interaction to Next Paint' },
            ].map(({ key, label, unit, description }) => {
              const value = webVitals[key as keyof WebVitalsData];
              const rating = getVitalRating(key, value);
              
              return (
                <div key={key} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
                  <div className={cn("text-2xl font-bold rounded px-2 py-1 inline-block", getRatingColor(rating))}>
                    {value !== undefined ? `${value.toFixed(unit === '' ? 3 : 0)}${unit}` : '-'}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{description}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Memory Usage */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <CpuChipIcon className="h-5 w-5" />
            Memory Usage
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Heap Usage</span>
              <span className="text-sm font-medium">
                {memoryUsage.used.toFixed(1)} MB / {memoryUsage.limit.toFixed(1)} MB
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className={cn(
                  "h-2 rounded-full transition-all",
                  memoryUsage.used / memoryUsage.limit < 0.7 
                    ? "bg-green-500"
                    : memoryUsage.used / memoryUsage.limit < 0.9
                    ? "bg-yellow-500"
                    : "bg-red-500"
                )}
                style={{ width: `${(memoryUsage.used / memoryUsage.limit) * 100}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {((memoryUsage.used / memoryUsage.limit) * 100).toFixed(1)}% utilized
            </div>
          </div>
        </div>

        {/* API Performance */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <ServerIcon className="h-5 w-5" />
            API Performance (Top 10 Endpoints)
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Endpoint</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Calls</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Avg</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">P95</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">P99</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Error %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {apiMetrics.length > 0 ? apiMetrics.map((metric, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-2 text-sm">
                      <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{metric.method}</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{metric.endpoint}</span>
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">{metric.count}</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">{metric.avgDuration.toFixed(0)}ms</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">{metric.p95.toFixed(0)}ms</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">{metric.p99.toFixed(0)}ms</td>
                    <td className="px-4 py-2 text-sm text-right">
                      <span className={cn(
                        "px-2 py-1 rounded text-xs font-medium",
                        metric.errorRate === 0 
                          ? "text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/20"
                          : metric.errorRate < 0.01
                          ? "text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/20"
                          : "text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/20"
                      )}>
                        {(metric.errorRate * 100).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No API calls recorded yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Component Performance */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <ClockIcon className="h-5 w-5" />
            Component Render Performance (Top 10)
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Component</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Renders</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Avg Duration</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Unnecessary</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {componentMetrics.length > 0 ? componentMetrics.map((metric, index) => {
                  const unnecessaryRate = metric.renderCount > 0 ? metric.unnecessaryRenders / metric.renderCount : 0;
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-2 text-sm font-mono text-gray-900 dark:text-white">
                        {metric.componentName}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">
                        {metric.renderCount}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-white">
                        {metric.avgRenderDuration.toFixed(2)}ms
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        <span className={cn(
                          "px-2 py-1 rounded text-xs font-medium",
                          unnecessaryRate < 0.2
                            ? "text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/20"
                            : unnecessaryRate < 0.5
                            ? "text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/20"
                            : "text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/20"
                        )}>
                          {metric.unnecessaryRenders} ({(unnecessaryRate * 100).toFixed(0)}%)
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {metric.avgRenderDuration < 16 ? (
                          <CheckCircleIcon className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 mx-auto" />
                        )}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No component metrics recorded yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Console Commands */}
        <div className="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Debug Console Commands</h3>
          <div className="space-y-1 text-xs font-mono text-gray-600 dark:text-gray-400">
            <div>window.performanceMonitor.getMetrics() - Get Web Vitals metrics</div>
            <div>window.apiMonitor.getStats() - Get API performance stats</div>
            <div>window.componentTracker.getMetrics() - Get component render metrics</div>
            <div>window.apiMonitor.exportMetrics() - Export API metrics as JSON</div>
          </div>
        </div>
      </div>
    </div>
  );
}