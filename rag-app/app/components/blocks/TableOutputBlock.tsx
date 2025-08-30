import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Download,
  Search,
  Filter,
  Copy,
  Check,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
} from 'lucide-react';

export interface TableColumn {
  id: string;
  name: string;
  type?: 'text' | 'number' | 'date' | 'boolean' | 'currency' | 'percent' | 'link';
  sortable?: boolean;
  filterable?: boolean;
  width?: number;
  align?: 'left' | 'center' | 'right';
  format?: (value: any) => string;
  hidden?: boolean;
}

export interface TableRow {
  [key: string]: any;
}

export interface TableOutputBlockProps {
  id?: string;
  columns: TableColumn[];
  rows: TableRow[];
  title?: string;
  description?: string;
  options?: {
    sortable?: boolean;
    filterable?: boolean;
    paginated?: boolean;
    pageSize?: number;
    exportable?: boolean;
    searchable?: boolean;
    resizable?: boolean;
    striped?: boolean;
    hoverable?: boolean;
    bordered?: boolean;
    compact?: boolean;
    showRowNumbers?: boolean;
    conditionalFormatting?: Array<{
      column: string;
      condition: (value: any) => boolean;
      className: string;
    }>;
  };
  provenance?: {
    isAIGenerated?: boolean;
    confidence?: number;
    source?: string;
    timestamp?: string;
    query?: string;
  };
  onInsert?: (blockData: any) => void;
  className?: string;
  theme?: 'light' | 'dark';
}

type SortDirection = 'asc' | 'desc' | null;

const formatValue = (value: any, column: TableColumn): string => {
  if (value === null || value === undefined) return '-';
  
  if (column.format) {
    return column.format(value);
  }
  
  switch (column.type) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(value);
    
    case 'percent':
      return `${(value * 100).toFixed(2)}%`;
    
    case 'date':
      return new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    
    case 'boolean':
      return value ? '✓' : '✗';
    
    case 'number':
      return value.toLocaleString();
    
    default:
      return String(value);
  }
};

const getCellAlignment = (column: TableColumn): string => {
  if (column.align) return `text-${column.align}`;
  
  switch (column.type) {
    case 'number':
    case 'currency':
    case 'percent':
      return 'text-right';
    case 'boolean':
      return 'text-center';
    default:
      return 'text-left';
  }
};

export const TableOutputBlock: React.FC<TableOutputBlockProps> = ({
  id,
  columns: initialColumns,
  rows: initialRows,
  title,
  description,
  options = {
    sortable: true,
    filterable: true,
    paginated: true,
    pageSize: 10,
    exportable: true,
    searchable: true,
    resizable: false,
    striped: true,
    hoverable: true,
    bordered: true,
    compact: false,
    showRowNumbers: false,
  },
  provenance,
  onInsert,
  className = '',
  theme = 'light',
}) => {
  const [columns, setColumns] = useState(initialColumns);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [copied, setCopied] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  
  const pageSize = options.pageSize || 10;
  
  // Filter rows based on search and column filters
  const filteredRows = useMemo(() => {
    let filtered = [...initialRows];
    
    // Global search
    if (searchTerm) {
      filtered = filtered.filter(row =>
        Object.entries(row).some(([key, value]) => {
          const column = columns.find(col => col.id === key);
          if (column && !hiddenColumns.has(column.id)) {
            const formatted = formatValue(value, column);
            return formatted.toLowerCase().includes(searchTerm.toLowerCase());
          }
          return false;
        })
      );
    }
    
    // Column filters
    Object.entries(columnFilters).forEach(([columnId, filterValue]) => {
      if (filterValue) {
        filtered = filtered.filter(row => {
          const column = columns.find(col => col.id === columnId);
          if (column) {
            const formatted = formatValue(row[columnId], column);
            return formatted.toLowerCase().includes(filterValue.toLowerCase());
          }
          return true;
        });
      }
    });
    
    return filtered;
  }, [initialRows, searchTerm, columnFilters, columns, hiddenColumns]);
  
  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortColumn || !sortDirection) return filteredRows;
    
    const column = columns.find(col => col.id === sortColumn);
    if (!column) return filteredRows;
    
    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      let comparison = 0;
      
      if (column.type === 'number' || column.type === 'currency' || column.type === 'percent') {
        comparison = Number(aVal) - Number(bVal);
      } else if (column.type === 'date') {
        comparison = new Date(aVal).getTime() - new Date(bVal).getTime();
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredRows, sortColumn, sortDirection, columns]);
  
  // Paginate rows
  const paginatedRows = useMemo(() => {
    if (!options.paginated) return sortedRows;
    
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedRows.slice(start, end);
  }, [sortedRows, currentPage, pageSize, options.paginated]);
  
  const totalPages = Math.ceil(sortedRows.length / pageSize);
  
  const handleSort = useCallback((columnId: string) => {
    if (!options.sortable) return;
    
    if (sortColumn === columnId) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(columnId);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection, options.sortable]);
  
  const handleExport = useCallback((format: 'csv' | 'json') => {
    const dataToExport = sortedRows;
    const visibleColumns = columns.filter(col => !hiddenColumns.has(col.id));
    
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `table-data-${Date.now()}.json`;
      a.click();
    } else if (format === 'csv') {
      const headers = visibleColumns.map(col => col.name).join(',');
      const rows = dataToExport.map(row =>
        visibleColumns.map(col => {
          const value = row[col.id];
          const formatted = formatValue(value, col);
          // Escape quotes and wrap in quotes if contains comma
          return formatted.includes(',') ? `"${formatted.replace(/"/g, '""')}"` : formatted;
        }).join(',')
      ).join('\n');
      const csv = `${headers}\n${rows}`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `table-data-${Date.now()}.csv`;
      a.click();
    }
  }, [sortedRows, columns, hiddenColumns]);
  
  const handleCopyData = useCallback(() => {
    const dataToExport = sortedRows;
    navigator.clipboard.writeText(JSON.stringify(dataToExport, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [sortedRows]);
  
  const toggleColumnVisibility = useCallback((columnId: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }, []);
  
  const visibleColumns = columns.filter(col => !hiddenColumns.has(col.id));
  
  return (
    <div
      className={`
        table-output-block rounded-xl border bg-white dark:bg-gray-900 shadow-sm overflow-hidden
        ${className}
      `}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-gray-800">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {title && (
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {description}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2 ml-4">
            {/* AI Generated Badge */}
            {provenance?.isAIGenerated && (
              <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                  AI Generated
                </span>
                {provenance.confidence && (
                  <span className="text-xs text-purple-500 dark:text-purple-500">
                    {Math.round(provenance.confidence * 100)}%
                  </span>
                )}
              </div>
            )}
            
            {/* Action Buttons */}
            {options.exportable && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleExport('csv')}
                  className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Export as CSV"
                >
                  CSV
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Export as JSON"
                >
                  JSON
                </button>
                <button
                  onClick={handleCopyData}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Copy data"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  )}
                </button>
              </div>
            )}
            
            {provenance?.source && (
              <button
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                title={`Source: ${provenance.source}`}
              >
                <Info className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
            )}
          </div>
        </div>
        
        {/* Search and Filter Bar */}
        <div className="flex items-center gap-2 mt-3">
          {options.searchable && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
          )}
          
          {options.filterable && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-1.5 text-sm border rounded-lg flex items-center gap-1
                ${showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : ''}
                hover:bg-gray-50 dark:hover:bg-gray-800`}
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
          )}
          
          {/* Column Visibility */}
          <div className="relative group">
            <button className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              Columns
            </button>
            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              {columns.map(column => (
                <label
                  key={column.id}
                  className="flex items-center px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.has(column.id)}
                    onChange={() => toggleColumnVisibility(column.id)}
                    className="mr-2"
                  />
                  <span className="text-sm">{column.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        
        {/* Column Filters */}
        {showFilters && options.filterable && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-3">
            {visibleColumns.map(column => (
              <div key={column.id}>
                <label className="text-xs text-gray-600 dark:text-gray-400">
                  {column.name}
                </label>
                <input
                  type="text"
                  placeholder={`Filter ${column.name}...`}
                  value={columnFilters[column.id] || ''}
                  onChange={(e) => setColumnFilters(prev => ({
                    ...prev,
                    [column.id]: e.target.value
                  }))}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
            <tr>
              {options.showRowNumbers && (
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  #
                </th>
              )}
              {visibleColumns.map(column => (
                <th
                  key={column.id}
                  className={`px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider
                    ${getCellAlignment(column)}
                    ${options.sortable && column.sortable !== false ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : ''}
                  `}
                  style={{ width: column.width }}
                  onClick={() => column.sortable !== false && handleSort(column.id)}
                >
                  <div className="flex items-center gap-1">
                    <span>{column.name}</span>
                    {options.sortable && column.sortable !== false && (
                      <span className="ml-auto">
                        {sortColumn === column.id ? (
                          sortDirection === 'asc' ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 opacity-30" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody className="bg-white dark:bg-gray-900 divide-y dark:divide-gray-800">
            {paginatedRows.map((row, rowIndex) => {
              const actualRowIndex = (currentPage - 1) * pageSize + rowIndex;
              return (
                <tr
                  key={rowIndex}
                  className={`
                    ${options.hoverable ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : ''}
                    ${options.striped && actualRowIndex % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-800/50' : ''}
                  `}
                >
                  {options.showRowNumbers && (
                    <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                      {actualRowIndex + 1}
                    </td>
                  )}
                  {visibleColumns.map(column => {
                    const value = row[column.id];
                    const formatted = formatValue(value, column);
                    
                    // Apply conditional formatting
                    let cellClassName = `px-3 py-2 text-sm ${getCellAlignment(column)}`;
                    if (options.conditionalFormatting) {
                      const condition = options.conditionalFormatting.find(
                        cf => cf.column === column.id && cf.condition(value)
                      );
                      if (condition) {
                        cellClassName += ` ${condition.className}`;
                      }
                    }
                    
                    return (
                      <td key={column.id} className={cellClassName}>
                        {column.type === 'link' ? (
                          <a
                            href={value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {formatted}
                          </a>
                        ) : (
                          formatted
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {paginatedRows.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No data to display
          </div>
        )}
      </div>
      
      {/* Pagination */}
      {options.paginated && totalPages > 1 && (
        <div className="px-4 py-3 border-t dark:border-gray-800 flex items-center justify-between">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Showing {((currentPage - 1) * pageSize) + 1} to{' '}
            {Math.min(currentPage * pageSize, sortedRows.length)} of{' '}
            {sortedRows.length} results
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <span className="px-3 py-1 text-sm">
              Page {currentPage} of {totalPages}
            </span>
            
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Footer with Insert Button */}
      {onInsert && (
        <div className="px-4 py-3 border-t dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <button
            onClick={() => onInsert({ type: 'table', columns: visibleColumns, rows: sortedRows, title, description })}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Insert into Page
          </button>
        </div>
      )}
    </div>
  );
};