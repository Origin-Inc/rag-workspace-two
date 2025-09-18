import { useState, useRef, useEffect } from 'react';
import { useFetcher } from '@remix-run/react';
import { 
  Search, 
  Sparkles, 
  TrendingUp, 
  BarChart3, 
  PieChart,
  Calculator,
  Calendar,
  Filter,
  Loader2,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { cn } from '~/utils/cn';

interface AnalyticsQueryInterfaceProps {
  databaseBlockId: string;
  columns?: Array<{ id: string; name: string; type: string }>;
  className?: string;
}

export function AnalyticsQueryInterface({ 
  databaseBlockId, 
  columns = [],
  className 
}: AnalyticsQueryInterfaceProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fetcher = useFetcher();

  const isLoading = fetcher.state !== 'idle';
  const queryResult = fetcher.data;

  // Load recent queries from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`analytics-queries-${databaseBlockId}`);
    if (stored) {
      setRecentQueries(JSON.parse(stored).slice(0, 5));
    }
  }, [databaseBlockId]);

  // Generate smart suggestions based on columns
  const suggestions = generateSuggestions(columns);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    // Save to recent queries
    const updated = [query, ...recentQueries.filter(q => q !== query)].slice(0, 5);
    setRecentQueries(updated);
    localStorage.setItem(`analytics-queries-${databaseBlockId}`, JSON.stringify(updated));

    // Submit query
    const formData = new FormData();
    formData.append('query', query);
    formData.append('databaseBlockId', databaseBlockId);
    
    fetcher.submit(formData, {
      method: 'post',
      action: '/api/analytics-query'
    });

    setShowSuggestions(false);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Query Input */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Ask a question about your data..."
            className="w-full pl-10 pr-24 py-3 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[rgba(33,33,33,1)] text-gray-900 dark:text-white"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">Analyze</span>
              </>
            )}
          </button>
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && (query.length === 0 || query.length > 2) && (
          <div className="absolute z-10 w-full mt-2 bg-white dark:bg-[rgba(33,33,33,1)] rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto">
            {/* Smart Suggestions */}
            {suggestions.length > 0 && (
              <div className="p-2">
                <p className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Suggested queries
                </p>
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion.text)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors flex items-center gap-2"
                  >
                    {suggestion.icon}
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {suggestion.text}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Recent Queries */}
            {recentQueries.length > 0 && (
              <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                <p className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Recent queries
                </p>
                {recentQueries.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSuggestionClick(q)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">{q}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </form>

      {/* Query Result */}
      {queryResult && (
        <div className="bg-white dark:bg-[rgba(33,33,33,1)] rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          {queryResult.success ? (
            <>
              {/* Result Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Query Successful
                  </span>
                  {queryResult.metadata?.confidence && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Confidence: {queryResult.metadata.confidence}%
                    </span>
                  )}
                </div>
                {queryResult.metadata && (
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    {queryResult.metadata.rowsAffected !== undefined && (
                      <span>{queryResult.metadata.rowsAffected} rows</span>
                    )}
                    {queryResult.metadata.executionTime && (
                      <span>{queryResult.metadata.executionTime}ms</span>
                    )}
                    {queryResult.metadata.cached && (
                      <span className="text-blue-500">Cached</span>
                    )}
                  </div>
                )}
              </div>

              {/* Result Display */}
              <div className="space-y-3">
                {renderQueryResult(queryResult.data, queryResult.metadata?.intent)}
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  Query Failed
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {queryResult.error || 'An unknown error occurred'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Generate smart suggestions based on column types
function generateSuggestions(columns: Array<{ id: string; name: string; type: string }>) {
  const suggestions: Array<{ text: string; icon: JSX.Element }> = [];
  
  // Find numeric columns
  const numericColumns = columns.filter(c => 
    ['number', 'currency', 'percent'].includes(c.type)
  );
  
  // Find date columns
  const dateColumns = columns.filter(c => 
    ['date', 'datetime'].includes(c.type)
  );
  
  // Find category columns
  const categoryColumns = columns.filter(c => 
    ['select', 'multi-select', 'status'].includes(c.type)
  );

  // Generate suggestions based on column types
  if (numericColumns.length > 0) {
    const col = numericColumns[0];
    suggestions.push({
      text: `Total ${col.name.toLowerCase()}`,
      icon: <Calculator className="w-4 h-4 text-blue-500" />
    });
    suggestions.push({
      text: `Average ${col.name.toLowerCase()}`,
      icon: <TrendingUp className="w-4 h-4 text-green-500" />
    });
  }

  if (dateColumns.length > 0) {
    suggestions.push({
      text: 'Show data from this month',
      icon: <Calendar className="w-4 h-4 text-purple-500" />
    });
    suggestions.push({
      text: 'Trend over time',
      icon: <TrendingUp className="w-4 h-4 text-blue-500" />
    });
  }

  if (categoryColumns.length > 0) {
    const col = categoryColumns[0];
    suggestions.push({
      text: `Group by ${col.name.toLowerCase()}`,
      icon: <PieChart className="w-4 h-4 text-orange-500" />
    });
  }

  // Generic suggestions
  suggestions.push({
    text: 'Count all items',
    icon: <BarChart3 className="w-4 h-4 text-indigo-500" />
  });

  if (numericColumns.length > 0) {
    suggestions.push({
      text: `Top 10 by ${numericColumns[0].name.toLowerCase()}`,
      icon: <Filter className="w-4 h-4 text-gray-500" />
    });
  }

  return suggestions.slice(0, 5);
}

// Render query result based on type
function renderQueryResult(data: any, intent?: string) {
  if (data === null || data === undefined) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No data</p>;
  }

  // Single value result (aggregation)
  if (typeof data === 'number' || typeof data === 'string') {
    return (
      <div className="text-center py-8">
        <p className="text-3xl font-bold text-gray-900 dark:text-white">
          {typeof data === 'number' ? formatNumber(data) : data}
        </p>
      </div>
    );
  }

  // Array result (list/filter)
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <p className="text-sm text-gray-500 dark:text-gray-400">No results found</p>;
    }

    // For trend data
    if (data[0]?.period && data[0]?.value !== undefined) {
      return <TrendChart data={data} />;
    }

    // Regular list
    return <DataTable data={data} />;
  }

  // Object result (comparison)
  if (typeof data === 'object') {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return <p className="text-sm text-gray-500 dark:text-gray-400">No data</p>;
    }

    // Comparison chart
    return <ComparisonChart data={entries} />;
  }

  return <pre className="text-xs">{JSON.stringify(data, null, 2)}</pre>;
}

// Simple trend chart component
function TrendChart({ data }: { data: Array<{ period: string; value: number }> }) {
  const max = Math.max(...data.map(d => d.value));
  
  return (
    <div className="space-y-2">
      {data.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-20">
            {item.period}
          </span>
          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-6 relative">
            <div
              className="absolute left-0 top-0 h-full bg-blue-500 rounded-full"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-900 dark:text-white w-16 text-right">
            {formatNumber(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Simple comparison chart
function ComparisonChart({ data }: { data: Array<[string, number]> }) {
  const max = Math.max(...data.map(([_, v]) => v));
  
  return (
    <div className="space-y-2">
      {data.map(([label, value], idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="text-sm text-gray-700 dark:text-gray-300 w-24">
            {label}
          </span>
          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded h-6 relative">
            <div
              className="absolute left-0 top-0 h-full bg-green-500 rounded"
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-900 dark:text-white w-16 text-right">
            {formatNumber(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Simple data table
function DataTable({ data }: { data: any[] }) {
  if (data.length === 0) return null;
  
  const columns = Object.keys(data[0]).filter(k => k !== 'id');
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {columns.map((col) => (
              <th key={col} className="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map((row, idx) => (
            <tr key={idx} className="border-b border-gray-100 dark:border-gray-800">
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 text-gray-900 dark:text-white">
                  {formatValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 10 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
          Showing first 10 of {data.length} results
        </p>
      )}
    </div>
  );
}

// Format numbers nicely
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  if (num < 1 && num > 0) {
    return num.toFixed(2);
  }
  return num.toLocaleString();
}

// Format any value for display
function formatValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatNumber(value);
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}