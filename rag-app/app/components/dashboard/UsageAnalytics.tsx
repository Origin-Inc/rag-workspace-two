import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';

export interface CreditUsageData {
  date: string;
  credits: number;
  apiCalls: number;
}

export interface StorageData {
  type: string;
  size: number;
  color: string;
}

export interface TeamActivityData {
  name: string;
  value: number;
  percentage: number;
}

export interface UsageMetrics {
  totalCredits: number;
  usedCredits: number;
  totalStorage: number;
  usedStorage: number;
  apiCallsToday: number;
  activeUsers: number;
}

export interface UsageAnalyticsProps {
  workspaceId: string;
  creditUsageData?: CreditUsageData[];
  storageData?: StorageData[];
  teamActivityData?: TeamActivityData[];
  metrics?: UsageMetrics;
  className?: string;
  showTable?: boolean;
}

// Generate mock data for testing
export function generateMockCreditUsageData(days: number = 30): CreditUsageData[] {
  const data: CreditUsageData[] = [];
  const today = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = startOfDay(subDays(today, i));
    data.push({
      date: format(date, 'MMM dd'),
      credits: Math.floor(Math.random() * 500) + 100,
      apiCalls: Math.floor(Math.random() * 1000) + 200,
    });
  }
  
  return data;
}

export function generateMockStorageData(): StorageData[] {
  return [
    { type: 'Documents', size: 2.5, color: '#3B82F6' },
    { type: 'Images', size: 1.8, color: '#10B981' },
    { type: 'Databases', size: 3.2, color: '#8B5CF6' },
    { type: 'Backups', size: 1.5, color: '#F59E0B' },
    { type: 'Other', size: 0.5, color: '#6B7280' },
  ];
}

export function generateMockTeamActivityData(): TeamActivityData[] {
  const activities = [
    { name: 'John Doe', value: 345 },
    { name: 'Jane Smith', value: 287 },
    { name: 'Bob Johnson', value: 198 },
    { name: 'Alice Brown', value: 156 },
    { name: 'Others', value: 89 },
  ];
  
  const total = activities.reduce((sum, item) => sum + item.value, 0);
  
  return activities.map(item => ({
    ...item,
    percentage: Math.round((item.value / total) * 100),
  }));
}

export function generateMockMetrics(): UsageMetrics {
  return {
    totalCredits: 10000,
    usedCredits: 3456,
    totalStorage: 100, // GB
    usedStorage: 9.5, // GB
    apiCallsToday: 1234,
    activeUsers: 12,
  };
}

// Custom tooltip for charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Colors for pie chart
const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444'];

export function UsageAnalytics({
  workspaceId,
  creditUsageData = generateMockCreditUsageData(),
  storageData = generateMockStorageData(),
  teamActivityData = generateMockTeamActivityData(),
  metrics = generateMockMetrics(),
  className = '',
  showTable = true,
}: UsageAnalyticsProps) {
  // Calculate percentages
  const creditPercentage = useMemo(() => {
    if (!metrics) return 0;
    return Math.round((metrics.usedCredits / metrics.totalCredits) * 100);
  }, [metrics]);

  const storagePercentage = useMemo(() => {
    if (!metrics) return 0;
    return Math.round((metrics.usedStorage / metrics.totalStorage) * 100);
  }, [metrics]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Metrics Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                AI Credits
              </p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {metrics.usedCredits.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                of {metrics.totalCredits.toLocaleString()}
              </p>
            </div>
            <div className="flex items-center justify-center w-12 h-12">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  className="text-gray-200 dark:text-gray-700"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${creditPercentage * 1.26} 126`}
                  className="text-blue-600"
                />
              </svg>
              <span className="absolute text-xs font-medium">{creditPercentage}%</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Storage
              </p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {metrics.usedStorage} GB
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                of {metrics.totalStorage} GB
              </p>
            </div>
            <div className="flex items-center justify-center w-12 h-12">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  className="text-gray-200 dark:text-gray-700"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${storagePercentage * 1.26} 126`}
                  className="text-green-600"
                />
              </svg>
              <span className="absolute text-xs font-medium">{storagePercentage}%</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            API Calls Today
          </p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
            {metrics.apiCallsToday.toLocaleString()}
          </p>
          <p className="text-xs text-green-600 dark:text-green-400">
            +12% from yesterday
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Active Users
          </p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
            {metrics.activeUsers}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Last 24 hours
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Credits Usage Line Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            AI Credits Usage (30 days)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={creditUsageData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis 
                dataKey="date" 
                className="text-xs"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'currentColor' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="credits"
                stroke="#3B82F6"
                fill="#3B82F6"
                fillOpacity={0.3}
                name="Credits"
              />
              <Line
                type="monotone"
                dataKey="apiCalls"
                stroke="#10B981"
                name="API Calls"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Storage by Type Bar Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Storage by Type
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={storageData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis 
                dataKey="type"
                className="text-xs"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'currentColor' }}
                label={{ value: 'GB', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="size" name="Size (GB)">
                {storageData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Team Activity Pie Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Team Activity Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={teamActivityData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ percentage }) => `${percentage}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {teamActivityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {teamActivityData.map((member, index) => (
              <div key={member.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center">
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-gray-600 dark:text-gray-400">{member.name}</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {member.value} actions
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* API Calls Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            API Calls Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={creditUsageData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis 
                dataKey="date"
                className="text-xs"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'currentColor' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="apiCalls"
                stroke="#10B981"
                strokeWidth={2}
                dot={{ fill: '#10B981', r: 4 }}
                activeDot={{ r: 6 }}
                name="API Calls"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Usage Table */}
      {showTable && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Detailed Usage Report
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    AI Credits
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    API Calls
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Storage (GB)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Active Users
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {creditUsageData.slice(0, 7).reverse().map((day, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {day.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {day.credits.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {day.apiCalls.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {(9.5 + Math.random() * 0.5).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {Math.floor(Math.random() * 5) + 8}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      ${(day.credits * 0.002 + day.apiCalls * 0.0001).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Showing last 7 days • Updated hourly
              </p>
              <button className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                Export Full Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}