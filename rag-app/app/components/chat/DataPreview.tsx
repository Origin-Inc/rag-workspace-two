import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Database, Hash, Calendar, Type, ToggleLeft, FileSpreadsheet } from 'lucide-react';
import { cn } from '~/utils/cn';
import type { FileSchema } from '~/services/file-processing.server';

interface DataPreviewProps {
  tableName: string;
  schema: FileSchema;
  filename: string;
  rowCount: number;
  sizeBytes: number;
  className?: string;
  onLoadMore?: () => void;
  isLoading?: boolean;
}

export function DataPreview({ 
  tableName,
  schema,
  filename,
  rowCount,
  sizeBytes,
  className,
  onLoadMore,
  isLoading = false
}: DataPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };
  
  // Get icon for column type
  const getColumnIcon = (type: string) => {
    switch (type) {
      case 'number':
        return <Hash className="w-3 h-3" />;
      case 'date':
      case 'datetime':
        return <Calendar className="w-3 h-3" />;
      case 'boolean':
        return <ToggleLeft className="w-3 h-3" />;
      default:
        return <Type className="w-3 h-3" />;
    }
  };
  
  // Sort data
  const sortedData = useMemo(() => {
    if (!sortColumn || !schema.sampleData) return schema.sampleData;
    
    return [...schema.sampleData].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [schema.sampleData, sortColumn, sortDirection]);
  
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };
  
  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {filename}
              </h3>
              <div className="flex items-center gap-4 mt-1 text-xs text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  Table: {tableName}
                </span>
                <span>{rowCount.toLocaleString()} rows</span>
                <span>{schema.columns.length} columns</span>
                <span>{formatFileSize(sizeBytes)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
      
      {/* Table */}
      {isExpanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {schema.columns.map((column) => (
                  <th
                    key={column.name}
                    onClick={() => handleSort(column.name)}
                    className={cn(
                      "px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300",
                      "hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer",
                      "select-none"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {getColumnIcon(column.type)}
                      <span>{column.name}</span>
                      {sortColumn === column.name && (
                        <span className="text-xs text-gray-500">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, rowIndex) => (
                <tr 
                  key={rowIndex}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  {schema.columns.map((column) => {
                    const value = row[column.name];
                    const displayValue = value === null || value === undefined 
                      ? <span className="text-gray-400 italic">null</span>
                      : value === true ? '✓' 
                      : value === false ? '✗'
                      : String(value);
                    
                    return (
                      <td 
                        key={column.name}
                        className="px-4 py-2 text-gray-900 dark:text-gray-100"
                      >
                        <div className="truncate max-w-xs" title={String(displayValue)}>
                          {displayValue}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Load More / Summary */}
          <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Showing {Math.min(sortedData.length, rowCount)} of {rowCount.toLocaleString()} rows
              </span>
              {onLoadMore && sortedData.length < rowCount && (
                <button
                  onClick={onLoadMore}
                  disabled={isLoading}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded",
                    "bg-blue-600 text-white hover:bg-blue-700",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "transition-colors"
                  )}
                >
                  {isLoading ? 'Loading...' : 'Load More'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}