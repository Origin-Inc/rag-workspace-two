import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { performanceMonitor } from '~/services/monitoring/performance-monitor.server';
import { getWorkspaceStats } from '~/services/database/optimized-queries.server';
import { requireUser } from '~/services/auth/auth.server';
import { Activity, Database, Zap, AlertTriangle, TrendingUp, Clock } from 'lucide-react';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  
  // Get performance stats
  const dbStats = performanceMonitor.getStats('db');
  const httpStats = performanceMonitor.getStats('http.request');
  const slowQueries = performanceMonitor.getSlowQueries(20);
  
  // Get workspace stats (using optimized query)
  let workspaceStats = null;
  try {
    // This would need the workspace ID from the user's context
    // For demo purposes, we'll skip this
    // workspaceStats = await getWorkspaceStats(workspaceId);
  } catch (error) {
    console.error('Failed to get workspace stats:', error);
  }

  return json({
    dbStats,
    httpStats,
    slowQueries,
    workspaceStats,
    timestamp: new Date().toISOString()
  });
}

export default function PerformanceDashboard() {
  const { dbStats, httpStats, slowQueries, workspaceStats, timestamp } = useLoaderData<typeof loader>();

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusColor = (duration: number) => {
    if (duration < 50) return 'text-green-600';
    if (duration < 200) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-600" />
            Performance Dashboard
          </h1>
          <p className="text-gray-600 mt-2">
            Last updated: {new Date(timestamp).toLocaleString()}
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <Database className="w-10 h-10 text-blue-600" />
              <span className="text-2xl font-bold">{dbStats.count}</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600">Database Queries</h3>
            <p className={`text-lg font-semibold mt-1 ${getStatusColor(dbStats.avg)}`}>
              {formatDuration(dbStats.avg)} avg
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <Zap className="w-10 h-10 text-green-600" />
              <span className="text-2xl font-bold">{httpStats.count}</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600">HTTP Requests</h3>
            <p className={`text-lg font-semibold mt-1 ${getStatusColor(httpStats.avg)}`}>
              {formatDuration(httpStats.avg)} avg
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <AlertTriangle className="w-10 h-10 text-yellow-600" />
              <span className="text-2xl font-bold">{dbStats.slowQueries}</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600">Slow Queries</h3>
            <p className="text-lg font-semibold mt-1 text-yellow-600">
              &gt;100ms
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="w-10 h-10 text-purple-600" />
              <span className="text-2xl font-bold">{dbStats.criticalQueries}</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600">Critical Queries</h3>
            <p className="text-lg font-semibold mt-1 text-red-600">
              &gt;500ms
            </p>
          </div>
        </div>

        {/* Database Performance */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Database Performance</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-gray-600">Min</p>
                <p className={`text-xl font-semibold ${getStatusColor(dbStats.min)}`}>
                  {formatDuration(dbStats.min)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">P50 (Median)</p>
                <p className={`text-xl font-semibold ${getStatusColor(dbStats.p50)}`}>
                  {formatDuration(dbStats.p50)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">P95</p>
                <p className={`text-xl font-semibold ${getStatusColor(dbStats.p95)}`}>
                  {formatDuration(dbStats.p95)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Max</p>
                <p className={`text-xl font-semibold ${getStatusColor(dbStats.max)}`}>
                  {formatDuration(dbStats.max)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Slow Queries */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Slow Queries
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Query Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 dark:bg-dark-primary">
                {slowQueries.length > 0 ? (
                  slowQueries.map((query, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {query.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={getStatusColor(query.duration)}>
                          {formatDuration(query.duration)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(query.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {query.error ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                            Error
                          </span>
                        ) : query.duration > 500 ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                            Critical
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            Slow
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                      No slow queries detected
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recommendations */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">Performance Recommendations</h3>
          <ul className="space-y-2 text-blue-800">
            {dbStats.criticalQueries > 0 && (
              <li className="flex items-start gap-2">
                <span className="text-blue-600">•</span>
                <span>Critical queries detected. Review database indexes and query optimization.</span>
              </li>
            )}
            {dbStats.p95 > 200 && (
              <li className="flex items-start gap-2">
                <span className="text-blue-600">•</span>
                <span>P95 latency is high. Consider implementing query caching or connection pooling.</span>
              </li>
            )}
            {dbStats.slowQueries > 10 && (
              <li className="flex items-start gap-2">
                <span className="text-blue-600">•</span>
                <span>Multiple slow queries detected. Run EXPLAIN ANALYZE on problematic queries.</span>
              </li>
            )}
            {httpStats.avg > 300 && (
              <li className="flex items-start gap-2">
                <span className="text-blue-600">•</span>
                <span>HTTP response times are elevated. Consider implementing response caching.</span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}