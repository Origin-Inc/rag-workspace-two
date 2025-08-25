import { memo, useCallback, useMemo, useState, useRef, Suspense } from 'react';
import { 
  useExpensiveComputation, 
  useDebouncedCallback,
  useThrottledCallback,
  usePerformanceMonitor,
  createPropsComparer,
  BatchedUpdates,
  PerformanceMarker
} from '~/utils/react-performance';
import { VirtualizedDataGrid } from './VirtualizedDataGrid';
import { ViewSwitcher } from './ViewSwitcher';
import { useViewState } from '~/hooks/useViewState';
import { useProgressiveDataLoad } from '~/hooks/useProgressiveDataLoad';
import type { 
  DatabaseBlock, 
  DatabaseColumn, 
  DatabaseRow, 
  Filter, 
  Sort,
  ViewType 
} from '~/types/database-block';
import { cn } from '~/utils/cn';

// Lazy load view components for better initial load
const DatabaseGallery = React.lazy(() => import('./DatabaseGallery'));
const DatabaseKanban = React.lazy(() => import('./DatabaseKanban'));
const DatabaseCalendar = React.lazy(() => import('./DatabaseCalendar'));
const DatabaseTimeline = React.lazy(() => import('./DatabaseTimeline'));

interface OptimizedDatabaseBlockProps {
  block: DatabaseBlock;
  onUpdateBlock?: (updates: Partial<DatabaseBlock>) => void;
  className?: string;
  maxRows?: number;
  enablePerformanceMonitoring?: boolean;
}

// Memoized filter function
const applyFilters = (rows: DatabaseRow[], filters: Filter[]): DatabaseRow[] => {
  if (filters.length === 0) return rows;
  
  return rows.filter(row => {
    return filters.every(filter => {
      const value = row.cells[filter.columnId];
      
      switch (filter.operator) {
        case 'equals':
          return value === filter.value;
        case 'not_equals':
          return value !== filter.value;
        case 'contains':
          return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
        case 'not_contains':
          return !String(value).toLowerCase().includes(String(filter.value).toLowerCase());
        case 'greater_than':
          return Number(value) > Number(filter.value);
        case 'less_than':
          return Number(value) < Number(filter.value);
        case 'is_empty':
          return value == null || value === '';
        case 'is_not_empty':
          return value != null && value !== '';
        default:
          return true;
      }
    });
  });
};

// Memoized sort function
const applySorts = (rows: DatabaseRow[], sorts: Sort[]): DatabaseRow[] => {
  if (sorts.length === 0) return rows;
  
  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const aVal = a.cells[sort.columnId];
      const bVal = b.cells[sort.columnId];
      
      let comparison = 0;
      
      if (aVal == null && bVal == null) comparison = 0;
      else if (aVal == null) comparison = 1;
      else if (bVal == null) comparison = -1;
      else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      if (comparison !== 0) {
        return sort.direction === 'desc' ? -comparison : comparison;
      }
    }
    
    return 0;
  });
};

// Main component with heavy memoization
export const OptimizedDatabaseBlock = memo(function OptimizedDatabaseBlock({
  block,
  onUpdateBlock,
  className,
  maxRows = 100000,
  enablePerformanceMonitoring = false
}: OptimizedDatabaseBlockProps) {
  // Performance monitoring
  const perfMonitor = enablePerformanceMonitoring ? usePerformanceMonitor('OptimizedDatabaseBlock') : null;
  const perfMarker = useRef(new PerformanceMarker());
  
  // State management
  const { viewState, updateViewState } = useViewState(block.id);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sorts, setSorts] = useState<Sort[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Progressive data loading
  const {
    rows: loadedRows,
    totalRows,
    isLoading,
    isLoadingMore,
    hasMore,
    progress,
    loadMore,
    loadVirtualWindow,
    prefetchAdjacent,
    updateCachedRow,
    invalidateAndReload
  } = useProgressiveDataLoad({
    blockId: block.id,
    filters,
    sorts,
    searchQuery,
    initialPageSize: 100,
    maxPageSize: 1000
  });
  
  // Batched updates for better performance
  const batchedUpdates = useRef(new BatchedUpdates((updates) => {
    const newCells: Record<string, Record<string, any>> = {};
    
    updates.forEach((value, rowId) => {
      newCells[rowId] = value;
    });
    
    // Send batched update to server
    if (onUpdateBlock) {
      onUpdateBlock({
        rows: block.rows.map(row => 
          newCells[row.id] ? { ...row, cells: { ...row.cells, ...newCells[row.id] }} : row
        )
      });
    }
  }, 100));
  
  // Expensive computations with memoization
  const processedRows = useExpensiveComputation(() => {
    perfMarker.current.mark('process-start');
    
    let result = loadedRows;
    
    // Apply filters
    if (filters.length > 0) {
      result = applyFilters(result, filters);
    }
    
    // Apply sorts
    if (sorts.length > 0) {
      result = applySorts(result, sorts);
    }
    
    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(row => 
        Object.values(row.cells).some(value => 
          String(value).toLowerCase().includes(query)
        )
      );
    }
    
    const duration = perfMarker.current.measure('process-rows', 'process-start');
    
    if (enablePerformanceMonitoring && duration) {
      console.debug(`Row processing took ${duration.toFixed(2)}ms for ${result.length} rows`);
    }
    
    return result;
  }, [loadedRows, filters, sorts, searchQuery], {
    debugLabel: 'processedRows',
    equalityFn: (a, b) => a.length === b.length && a[0]?.id === b[0]?.id
  });
  
  // Debounced search handler
  const [handleSearch] = useDebouncedCallback(
    (query: string) => {
      setSearchQuery(query);
    },
    300
  );
  
  // Throttled scroll handler for virtual window loading
  const handleScroll = useThrottledCallback(
    (scrollTop: number, scrollHeight: number, clientHeight: number) => {
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
      
      // Load more when scrolled to 80%
      if (scrollPercentage > 0.8 && hasMore && !isLoadingMore) {
        loadMore();
      }
      
      // Prefetch adjacent data
      const currentIndex = Math.floor((scrollTop / scrollHeight) * totalRows);
      prefetchAdjacent(currentIndex);
    },
    100
  );
  
  // Memoized callbacks
  const handleUpdateRow = useCallback((rowId: string, updates: Partial<DatabaseRow['cells']>) => {
    // Update cache immediately for optimistic UI
    updateCachedRow(rowId, { cells: updates });
    
    // Batch the update for server sync
    batchedUpdates.current.add(rowId, updates);
  }, [updateCachedRow]);
  
  const handleSelectRow = useCallback((rowId: string, isSelected: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (isSelected) {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }
      return next;
    });
  }, []);
  
  const handleSelectAllRows = useCallback((isSelected: boolean) => {
    if (isSelected) {
      setSelectedRows(new Set(processedRows.map(row => row.id)));
    } else {
      setSelectedRows(new Set());
    }
  }, [processedRows]);
  
  const handleViewChange = useCallback((newView: ViewType) => {
    updateViewState({ currentView: newView });
  }, [updateViewState]);
  
  const handleAddFilter = useCallback((filter: Filter) => {
    setFilters(prev => [...prev, filter]);
  }, []);
  
  const handleRemoveFilter = useCallback((index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  }, []);
  
  const handleAddSort = useCallback((sort: Sort) => {
    setSorts(prev => [...prev, sort]);
  }, []);
  
  const handleRemoveSort = useCallback((index: number) => {
    setSorts(prev => prev.filter((_, i) => i !== index));
  }, []);
  
  // Memoized view component props
  const viewProps = useMemo(() => ({
    columns: block.columns,
    rows: processedRows,
    selectedRows,
    onUpdateRow: handleUpdateRow,
    onSelectRow: handleSelectRow,
    onSelectAllRows: handleSelectAllRows
  }), [block.columns, processedRows, selectedRows, handleUpdateRow, handleSelectRow, handleSelectAllRows]);
  
  // Render the appropriate view
  const renderView = useCallback(() => {
    switch (viewState.currentView) {
      case 'table':
        return (
          <VirtualizedDataGrid
            {...viewProps}
            className="h-full"
          />
        );
      
      case 'gallery':
        return (
          <Suspense fallback={<div>Loading gallery view...</div>}>
            <DatabaseGallery
              {...viewProps}
              settings={viewState.viewSettings.gallery}
              onUpdateSettings={(settings) => 
                updateViewState({ 
                  viewSettings: { 
                    ...viewState.viewSettings, 
                    gallery: settings 
                  } 
                })
              }
            />
          </Suspense>
        );
      
      case 'kanban':
        return (
          <Suspense fallback={<div>Loading kanban view...</div>}>
            <DatabaseKanban
              {...viewProps}
              groupBy={viewState.viewSettings.kanban.groupBy}
              onUpdateGroupBy={(groupBy) => 
                updateViewState({ 
                  viewSettings: { 
                    ...viewState.viewSettings, 
                    kanban: { ...viewState.viewSettings.kanban, groupBy } 
                  } 
                })
              }
            />
          </Suspense>
        );
      
      case 'calendar':
        return (
          <Suspense fallback={<div>Loading calendar view...</div>}>
            <DatabaseCalendar
              {...viewProps}
              dateField={viewState.viewSettings.calendar.dateField}
              onUpdateDateField={(dateField) => 
                updateViewState({ 
                  viewSettings: { 
                    ...viewState.viewSettings, 
                    calendar: { ...viewState.viewSettings.calendar, dateField } 
                  } 
                })
              }
            />
          </Suspense>
        );
      
      case 'timeline':
        return (
          <Suspense fallback={<div>Loading timeline view...</div>}>
            <DatabaseTimeline
              {...viewProps}
              startDateField={viewState.viewSettings.timeline.startDateField}
              endDateField={viewState.viewSettings.timeline.endDateField}
              onUpdateSettings={(settings) => 
                updateViewState({ 
                  viewSettings: { 
                    ...viewState.viewSettings, 
                    timeline: settings 
                  } 
                })
              }
            />
          </Suspense>
        );
      
      default:
        return <VirtualizedDataGrid {...viewProps} className="h-full" />;
    }
  }, [viewState, viewProps, updateViewState]);
  
  // Performance stats for debugging
  useEffect(() => {
    if (enablePerformanceMonitoring && perfMonitor) {
      const stats = perfMonitor.getRenderStats();
      const processStats = perfMarker.current.getStats('process-rows');
      
      console.debug('Performance Stats:', {
        renders: stats,
        processing: processStats,
        loadedRows: loadedRows.length,
        processedRows: processedRows.length,
        cacheHitRate: `${progress}%`
      });
    }
  }, [enablePerformanceMonitoring, perfMonitor, loadedRows.length, processedRows.length, progress]);
  
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with controls */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <ViewSwitcher
            currentView={viewState.currentView}
            onViewChange={handleViewChange}
          />
          
          <input
            type="text"
            placeholder="Search..."
            onChange={(e) => handleSearch(e.target.value)}
            className="px-3 py-1.5 border rounded-md"
          />
        </div>
        
        <div className="flex items-center gap-2 text-sm text-gray-600">
          {isLoading && <span>Loading...</span>}
          {isLoadingMore && <span>Loading more...</span>}
          <span>{processedRows.length} of {totalRows} rows</span>
          {selectedRows.size > 0 && (
            <span className="ml-2 font-medium">
              {selectedRows.size} selected
            </span>
          )}
        </div>
      </div>
      
      {/* Filter bar */}
      {filters.length > 0 && (
        <div className="flex items-center gap-2 p-2 border-b bg-gray-50">
          <span className="text-sm font-medium">Filters:</span>
          {filters.map((filter, index) => (
            <div key={index} className="flex items-center gap-1 px-2 py-1 bg-white border rounded">
              <span className="text-sm">
                {block.columns.find(c => c.id === filter.columnId)?.name}
                {' '}{filter.operator}{' '}
                {filter.value}
              </span>
              <button
                onClick={() => handleRemoveFilter(index)}
                className="ml-1 text-gray-500 hover:text-red-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Sort bar */}
      {sorts.length > 0 && (
        <div className="flex items-center gap-2 p-2 border-b bg-gray-50">
          <span className="text-sm font-medium">Sorts:</span>
          {sorts.map((sort, index) => (
            <div key={index} className="flex items-center gap-1 px-2 py-1 bg-white border rounded">
              <span className="text-sm">
                {block.columns.find(c => c.id === sort.columnId)?.name}
                {' '}{sort.direction === 'asc' ? '↑' : '↓'}
              </span>
              <button
                onClick={() => handleRemoveSort(index)}
                className="ml-1 text-gray-500 hover:text-red-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Main view area */}
      <div className="flex-1 overflow-hidden">
        {renderView()}
      </div>
      
      {/* Progress bar for loading */}
      {(isLoading || isLoadingMore) && (
        <div className="h-1 bg-gray-200">
          <div 
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}, createPropsComparer(['block', 'onUpdateBlock', 'className', 'maxRows', 'enablePerformanceMonitoring'], {
  block: (a, b) => a.id === b.id && a.columns.length === b.columns.length
}));

export default OptimizedDatabaseBlock;