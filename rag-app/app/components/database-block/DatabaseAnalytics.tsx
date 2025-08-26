import { useState } from 'react';
import { 
  Brain, 
  ChevronDown,
  ChevronUp,
  Sparkles,
  TrendingUp,
  BarChart3,
  HelpCircle
} from 'lucide-react';
import { cn } from '~/utils/cn';
import { AnalyticsQueryInterface } from '~/components/analytics/AnalyticsQueryInterface';

interface DatabaseAnalyticsProps {
  databaseBlockId?: string;
  columns?: Array<{ id: string; name: string; type: string }>;
  rows?: any[];
  className?: string;
}

export function DatabaseAnalytics({ 
  databaseBlockId,
  columns = [],
  rows = [],
  className 
}: DatabaseAnalyticsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'insights' | 'query'>('insights');

  // Calculate basic insights
  const insights = calculateInsights(columns, rows);

  return (
    <div className={cn(
      'border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50',
      className
    )}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-500" />
          <span className="font-medium text-gray-900 dark:text-white">
            Analytics & Insights
          </span>
          {!isExpanded && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {insights.totalRows} rows • {insights.numericColumns} numeric columns
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4">
          {/* Tabs */}
          <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 mb-4">
            <button
              onClick={() => setActiveTab('insights')}
              className={cn(
                'pb-2 px-1 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'insights'
                  ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-white'
              )}
            >
              Quick Insights
            </button>
            <button
              onClick={() => setActiveTab('query')}
              className={cn(
                'pb-2 px-1 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'query'
                  ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-white'
              )}
            >
              Natural Language Query
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'insights' ? (
            <QuickInsights insights={insights} columns={columns} rows={rows} />
          ) : (
            <div className="space-y-4">
              {/* Help text */}
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                    Ask questions in plain English
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Try: "What's the total revenue?" or "Show me the top 5 products by sales"
                  </p>
                </div>
              </div>

              {/* Query Interface */}
              {databaseBlockId ? (
                <AnalyticsQueryInterface 
                  databaseBlockId={databaseBlockId}
                  columns={columns}
                />
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p className="text-sm">Save the database block to enable natural language queries</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Quick Insights Component
function QuickInsights({ 
  insights, 
  columns, 
  rows 
}: { 
  insights: any; 
  columns: any[]; 
  rows: any[] 
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Total Rows */}
      <InsightCard
        icon={<BarChart3 className="w-4 h-4" />}
        label="Total Rows"
        value={insights.totalRows}
        color="blue"
      />

      {/* Filled Cells */}
      <InsightCard
        icon={<Sparkles className="w-4 h-4" />}
        label="Data Completeness"
        value={`${insights.completeness}%`}
        color="green"
      />

      {/* Numeric Columns */}
      {insights.numericColumns > 0 && (
        <InsightCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Numeric Fields"
          value={insights.numericColumns}
          color="purple"
        />
      )}

      {/* Date Range */}
      {insights.dateRange && (
        <InsightCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Date Range"
          value={insights.dateRange}
          color="orange"
        />
      )}

      {/* Numeric Summaries */}
      {insights.numericSummaries.map((summary: any, idx: number) => (
        <div key={idx} className="col-span-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            {summary.columnName}
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Min</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {formatValue(summary.min)}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Avg</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {formatValue(summary.avg)}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Max</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {formatValue(summary.max)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Insight Card Component
function InsightCard({ 
  icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
  };

  return (
    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className={cn('inline-flex p-1.5 rounded-md mb-2', colorClasses[color])}>
        {icon}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

// Calculate basic insights from data
function calculateInsights(columns: any[], rows: any[]) {
  const numericColumns = columns.filter(c => 
    ['number', 'currency', 'percent'].includes(c.type)
  );
  
  const dateColumns = columns.filter(c => 
    ['date', 'datetime'].includes(c.type)
  );

  // Calculate completeness
  let filledCells = 0;
  let totalCells = rows.length * columns.length;
  
  rows.forEach(row => {
    columns.forEach(col => {
      if (row[col.id] !== null && row[col.id] !== undefined && row[col.id] !== '') {
        filledCells++;
      }
    });
  });

  const completeness = totalCells > 0 
    ? Math.round((filledCells / totalCells) * 100) 
    : 0;

  // Calculate numeric summaries
  const numericSummaries = numericColumns.slice(0, 2).map(col => {
    const values = rows
      .map(row => parseFloat(row[col.id]))
      .filter(v => !isNaN(v));
    
    if (values.length === 0) {
      return null;
    }

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      columnName: col.name,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
      sum
    };
  }).filter(Boolean);

  // Calculate date range
  let dateRange = null;
  if (dateColumns.length > 0 && rows.length > 0) {
    const col = dateColumns[0];
    const dates = rows
      .map(row => row[col.id] ? new Date(row[col.id]) : null)
      .filter(d => d && !isNaN(d.getTime()));
    
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      if (minDate.toDateString() === maxDate.toDateString()) {
        dateRange = minDate.toLocaleDateString();
      } else {
        const days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
        dateRange = `${days} days`;
      }
    }
  }

  return {
    totalRows: rows.length,
    numericColumns: numericColumns.length,
    completeness,
    numericSummaries,
    dateRange
  };
}

// Format value for display
function formatValue(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  if (value < 1 && value > 0) {
    return value.toFixed(2);
  }
  return value.toLocaleString();
}