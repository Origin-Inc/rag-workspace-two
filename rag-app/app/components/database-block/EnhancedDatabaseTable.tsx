// Enhanced Database Table Component with Virtual Scrolling and Performance Optimizations
// Handles 50,000+ records efficiently with real-time collaboration

import React, { 
  useEffect, 
  useRef, 
  useState, 
  useCallback, 
  useMemo, 
  memo,
  useImperativeHandle,
  forwardRef
} from 'react';
import { FixedSizeGrid as Grid, VariableSizeGrid } from 'react-window';
import { FixedSizeList as List } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDragAndDrop } from '@formkit/drag-and-drop/react';
import { cn } from '~/utils/cn';
import type {
  DatabaseBlockEnhanced,
  DatabaseColumnEnhanced,
  DatabaseRowEnhanced,
  DatabaseViewEnhanced,
  FilterEnhanced,
  SortConfig
} from '~/types/database-block-enhanced';

// Custom hooks for performance
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDatabaseBlockOptimized } from '~/hooks/useDatabaseBlockOptimized';
import { useVirtualScrolling } from '~/hooks/useVirtualScrolling';
import { useRealtimeCollaboration } from '~/hooks/useRealtimeCollaboration';
import { useKeyboardNavigation } from '~/hooks/useKeyboardNavigation';

// Sub-components
import { DatabaseCell } from './cells/DatabaseCell';
import { ColumnHeader } from './headers/ColumnHeader';
import { DatabaseToolbar } from './toolbar/DatabaseToolbar';
import { FilterBuilder } from './filters/FilterBuilder';
import { SortBuilder } from './sorts/SortBuilder';
import { ViewSwitcher } from './views/ViewSwitcher';
import { PresenceIndicator } from './collaboration/PresenceIndicator';
import { LoadingOverlay } from './overlays/LoadingOverlay';
import { ErrorBoundary } from './ErrorBoundary';

interface EnhancedDatabaseTableProps {
  databaseBlockId: string;
  workspaceId: string;
  userId?: string;
  userName?: string;
  className?: string;
  
  // View configuration
  viewId?: string;
  initialFilters?: FilterEnhanced[];
  initialSorts?: SortConfig[];
  
  // Performance options
  pageSize?: number;
  overscan?: number;
  enableVirtualScrolling?: boolean;
  enableRealtime?: boolean;
  enablePresence?: boolean;
  
  // Feature flags
  enableComments?: boolean;
  enableHistory?: boolean;
  enableExport?: boolean;
  enableImport?: boolean;
  
  // Event handlers
  onRowSelect?: (rowIds: string[]) => void;
  onRowUpdate?: (rowId: string, data: any) => void;
  onError?: (error: Error) => void;
}

export interface DatabaseTableHandle {
  scrollToRow: (rowIndex: number) => void;
  scrollToColumn: (columnIndex: number) => void;
  refreshData: () => void;
  exportData: (format: string) => void;
  getSelectedRows: () => string[];
  clearSelection: () => void;
}

const ITEM_SIZE = 40; // Row height
const HEADER_HEIGHT = 48;
const TOOLBAR_HEIGHT = 56;

export const EnhancedDatabaseTable = memo(forwardRef<
  DatabaseTableHandle,
  EnhancedDatabaseTableProps
>(function EnhancedDatabaseTable({
  databaseBlockId,
  workspaceId,
  userId,
  userName,
  className,
  viewId,
  initialFilters = [],
  initialSorts = [],
  pageSize = 100,
  overscan = 10,
  enableVirtualScrolling = true,
  enableRealtime = true,
  enablePresence = true,
  enableComments = true,
  enableHistory = true,
  enableExport = true,
  enableImport = true,
  onRowSelect,
  onRowUpdate,
  onError
}, ref) {
  // Refs for virtual scrolling
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<VariableSizeGrid>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  
  // State management
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    rowId?: string;
    columnId?: string;
  } | null>(null);
  
  // View state
  const [currentView, setCurrentView] = useState<DatabaseViewEnhanced | null>(null);
  const [filters, setFilters] = useState<FilterEnhanced[]>(initialFilters);
  const [sorts, setSorts] = useState<SortConfig[]>(initialSorts);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Performance state
  const [loadedRowRanges, setLoadedRowRanges] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);

  // Custom hooks
  const {
    databaseBlock,
    columns,
    views,
    rows,
    totalCount,
    isLoading: dataLoading,
    error,
    loadMoreRows,
    updateCell,
    addRow,
    deleteRows,
    updateColumn,
    addColumn,
    deleteColumn,
    invalidateData
  } = useDatabaseBlockOptimized({
    databaseBlockId,
    workspaceId,
    pageSize,
    overscan,
    enableRealtime,
    filters,
    sorts,
    searchQuery,
    viewId: currentView?.id
  });

  const {
    onlineUsers,
    editingCells,
    cursorPositions,
    broadcastCursor,
    broadcastEdit,
    stopEditing
  } = useRealtimeCollaboration({
    databaseBlockId,
    userId,
    userName,
    enabled: enablePresence
  });

  const {
    handleKeyDown,
    focusedCell,
    setFocusedCell,
    selectedRange,
    setSelectedRange
  } = useKeyboardNavigation({
    rows,
    columns,
    onCellEdit: handleCellEdit,
    onRowSelect: handleRowSelection,
    onCopy: handleCopy,
    onPaste: handlePaste
  });

  // Memoized calculations
  const columnWidths = useMemo(() => {
    return columns.map(col => col.width || 150);
  }, [columns]);

  const totalWidth = useMemo(() => {
    return columnWidths.reduce((sum, width) => sum + width, 48); // +48 for row number column
  }, [columnWidths]);

  const visibleColumns = useMemo(() => {
    if (currentView?.visibleColumns) {
      return columns.filter(col => currentView.visibleColumns.includes(col.columnId));
    }
    return columns.filter(col => !col.isHidden);
  }, [columns, currentView]);

  // Virtual scrolling setup
  const rowVirtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ITEM_SIZE,
    overscan
  });

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: visibleColumns.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => columnWidths[index] || 150,
    overscan: 3
  });

  // Infinite loading
  const isItemLoaded = useCallback((index: number) => {
    return !!rows[index];
  }, [rows]);

  const loadMoreItems = useCallback(async (startIndex: number, stopIndex: number) => {
    if (!hasNextPage || isLoading) return;
    
    setIsLoading(true);
    try {
      await loadMoreRows(startIndex, stopIndex);
      setLoadedRowRanges(prev => {
        const newSet = new Set(prev);
        for (let i = startIndex; i <= stopIndex; i++) {
          newSet.add(i.toString());
        }
        return newSet;
      });
    } catch (error) {
      onError?.(error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [hasNextPage, isLoading, loadMoreRows, onError]);

  // Event handlers
  const handleCellEdit = useCallback((rowId: string, columnId: string, value: any) => {
    setEditingCell(`${rowId}-${columnId}`);
    broadcastEdit(rowId, columnId, true);
    
    // Optimistic update
    updateCell(rowId, columnId, value);
    onRowUpdate?.(rowId, { [columnId]: value });
  }, [updateCell, onRowUpdate, broadcastEdit]);

  const handleCellEditEnd = useCallback(() => {
    if (editingCell) {
      const [rowId, columnId] = editingCell.split('-');
      broadcastEdit(rowId, columnId, false);
      setEditingCell(null);
    }
  }, [editingCell, broadcastEdit]);

  const handleRowSelection = useCallback((rowId: string, multi: boolean, range: boolean) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      
      if (range && selectedRows.size > 0) {
        // Range selection
        const firstSelected = Array.from(selectedRows)[0];
        const firstIndex = rows.findIndex(r => r.id === firstSelected);
        const currentIndex = rows.findIndex(r => r.id === rowId);
        
        if (firstIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(firstIndex, currentIndex);
          const end = Math.max(firstIndex, currentIndex);
          
          newSet.clear();
          for (let i = start; i <= end; i++) {
            if (rows[i]) {
              newSet.add(rows[i].id);
            }
          }
        }
      } else if (multi) {
        // Multi selection
        if (newSet.has(rowId)) {
          newSet.delete(rowId);
        } else {
          newSet.add(rowId);
        }
      } else {
        // Single selection
        newSet.clear();
        newSet.add(rowId);
      }
      
      return newSet;
    });
  }, [rows, selectedRows]);

  const handleContextMenu = useCallback((
    e: React.MouseEvent, 
    rowId?: string, 
    columnId?: string
  ) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      rowId,
      columnId
    });
  }, []);

  const handleCopy = useCallback(() => {
    if (selectedCells.size > 0) {
      // Copy selected cells
      const cellData = Array.from(selectedCells).map(cellId => {
        const [rowId, columnId] = cellId.split('-');
        const row = rows.find(r => r.id === rowId);
        return row?.data[columnId] || '';
      });
      
      navigator.clipboard.writeText(cellData.join('\t'));
    } else if (selectedRows.size > 0) {
      // Copy selected rows
      const rowData = Array.from(selectedRows).map(rowId => {
        const row = rows.find(r => r.id === rowId);
        return visibleColumns.map(col => row?.data[col.columnId] || '').join('\t');
      });
      
      navigator.clipboard.writeText(rowData.join('\n'));
    }
  }, [selectedCells, selectedRows, rows, visibleColumns]);

  const handlePaste = useCallback(async (clipboardData: string) => {
    if (!editingCell) return;
    
    const [rowId, columnId] = editingCell.split('-');
    await handleCellEdit(rowId, columnId, clipboardData);
  }, [editingCell, handleCellEdit]);

  // Imperative handle for external control
  useImperativeHandle(ref, () => ({
    scrollToRow: (rowIndex: number) => {
      rowVirtualizer.scrollToIndex(rowIndex);
    },
    scrollToColumn: (columnIndex: number) => {
      columnVirtualizer.scrollToIndex(columnIndex);
    },
    refreshData: () => {
      invalidateData();
    },
    exportData: (format: string) => {
      // TODO: Implement export functionality
    },
    getSelectedRows: () => Array.from(selectedRows),
    clearSelection: () => {
      setSelectedRows(new Set());
      setSelectedCells(new Set());
    }
  }), [rowVirtualizer, columnVirtualizer, invalidateData, selectedRows]);

  // Effects
  useEffect(() => {
    if (viewId && views.length > 0) {
      const view = views.find(v => v.id === viewId);
      if (view) {
        setCurrentView(view);
        setFilters(view.filters);
        setSorts(view.sorts);
      }
    }
  }, [viewId, views]);

  useEffect(() => {
    onRowSelect?.(Array.from(selectedRows));
  }, [selectedRows, onRowSelect]);

  // Keyboard event handler
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (containerRef.current?.contains(document.activeElement)) {
        handleKeyDown(e);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleKeyDown]);

  // Error handling
  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  // Render loading state
  if (dataLoading && rows.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-64', className)}>
        <LoadingOverlay />
      </div>
    );
  }

  // Render error state
  if (error && !databaseBlock) {
    return (
      <div className={cn('flex items-center justify-center h-64 text-red-500', className)}>
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Error Loading Database</h3>
          <p className="text-sm">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div 
        className={cn('flex flex-col h-full bg-white dark:bg-[rgba(33,33,33,1)]', className)}
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Toolbar */}
        <DatabaseToolbar
          databaseBlock={databaseBlock}
          currentView={currentView}
          views={views}
          selectedRows={selectedRows}
          searchQuery={searchQuery}
          onViewChange={setCurrentView}
          onSearchChange={setSearchQuery}
          onFilterChange={setFilters}
          onSortChange={setSorts}
          onAddRow={() => addRow({})}
          onDeleteRows={() => deleteRows(Array.from(selectedRows))}
          onAddColumn={addColumn}
          onExport={enableExport ? () => {} : undefined}
          onImport={enableImport ? () => {} : undefined}
          className="h-14 border-b"
        />

        {/* View Switcher */}
        <ViewSwitcher
          views={views}
          currentView={currentView}
          onViewChange={setCurrentView}
          className="h-10 border-b"
        />

        {/* Table Container */}
        <div className="flex-1 relative overflow-hidden">
          {/* Presence Indicators */}
          {enablePresence && onlineUsers.length > 0 && (
            <PresenceIndicator
              users={onlineUsers}
              editingCells={editingCells}
              cursorPositions={cursorPositions}
              className="absolute top-2 right-2 z-10"
            />
          )}

          {/* Virtual Scrolling Table */}
          <div className="h-full w-full overflow-auto">
            {/* Column Headers */}
            <div
              ref={headerRef}
              className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex"
              style={{ height: HEADER_HEIGHT, minWidth: totalWidth }}
            >
              {/* Row Number Header */}
              <div className="sticky left-0 z-30 w-12 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedRows.size === rows.length && rows.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedRows(new Set(rows.map(r => r.id)));
                    } else {
                      setSelectedRows(new Set());
                    }
                  }}
                  className="rounded border-gray-300"
                />
              </div>

              {/* Column Headers */}
              {columnVirtualizer.getVirtualItems().map((virtualColumn) => {
                const column = visibleColumns[virtualColumn.index];
                if (!column) return null;

                return (
                  <div
                    key={column.id}
                    className="absolute top-0"
                    style={{
                      left: virtualColumn.start + 48,
                      width: virtualColumn.size,
                      height: HEADER_HEIGHT
                    }}
                  >
                    <ColumnHeader
                      column={column}
                      sort={sorts.find(s => s.columnId === column.columnId)}
                      onSort={(direction) => {
                        const newSorts = sorts.filter(s => s.columnId !== column.columnId);
                        if (direction) {
                          newSorts.push({
                            columnId: column.columnId,
                            direction,
                            priority: 0,
                            nullsLast: false
                          });
                        }
                        setSorts(newSorts);
                      }}
                      onUpdateColumn={(updates) => updateColumn(column.id, updates)}
                      onDeleteColumn={() => deleteColumn(column.id)}
                      onResize={(width) => updateColumn(column.id, { width })}
                      onContextMenu={(e) => handleContextMenu(e, undefined, column.columnId)}
                    />
                  </div>
                );
              })}
            </div>

            {/* Virtual Rows */}
            <InfiniteLoader
              isItemLoaded={isItemLoaded}
              itemCount={totalCount}
              loadMoreItems={loadMoreItems}
              threshold={overscan}
            >
              {({ onItemsRendered, ref: infiniteRef }) => (
                <div
                  ref={infiniteRef}
                  style={{
                    height: rowVirtualizer.getTotalSize(),
                    minWidth: totalWidth
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    if (!row) {
                      // Loading placeholder
                      return (
                        <div
                          key={virtualRow.index}
                          className="absolute left-0 flex animate-pulse bg-gray-100"
                          style={{
                            top: virtualRow.start,
                            height: virtualRow.size,
                            width: totalWidth
                          }}
                        />
                      );
                    }

                    const isSelected = selectedRows.has(row.id);

                    return (
                      <div
                        key={row.id}
                        className={cn(
                          'absolute left-0 flex border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800',
                          isSelected && 'bg-blue-50'
                        )}
                        style={{
                          top: virtualRow.start,
                          height: virtualRow.size,
                          width: totalWidth
                        }}
                        onClick={(e) => 
                          handleRowSelection(row.id, e.metaKey || e.ctrlKey, e.shiftKey)
                        }
                        onContextMenu={(e) => handleContextMenu(e, row.id)}
                      >
                        {/* Row Number */}
                        <div className="sticky left-0 z-10 w-12 bg-white dark:bg-[rgba(33,33,33,1)] border-r border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleRowSelection(row.id, true, false);
                            }}
                            className="rounded border-gray-300 mr-1"
                          />
                          {virtualRow.index + 1}
                        </div>

                        {/* Cells */}
                        {columnVirtualizer.getVirtualItems().map((virtualColumn) => {
                          const column = visibleColumns[virtualColumn.index];
                          if (!column) return null;

                          const cellId = `${row.id}-${column.columnId}`;
                          const isEditing = editingCell === cellId;
                          const editingUser = editingCells.get(cellId);

                          return (
                            <div
                              key={column.id}
                              className="absolute"
                              style={{
                                left: virtualColumn.start + 48,
                                width: virtualColumn.size,
                                height: ITEM_SIZE
                              }}
                            >
                              <DatabaseCell
                                column={column}
                                value={row.data[column.columnId]}
                                computedValue={row.computedData[column.columnId]}
                                isEditing={isEditing}
                                isSelected={selectedCells.has(cellId)}
                                isFocused={focusedCell === cellId}
                                editingUser={editingUser}
                                onStartEdit={() => {
                                  setEditingCell(cellId);
                                  setFocusedCell(cellId);
                                  broadcastEdit(row.id, column.columnId, true);
                                }}
                                onEndEdit={handleCellEditEnd}
                                onUpdate={(value) => handleCellEdit(row.id, column.columnId, value)}
                                onFocus={() => {
                                  setFocusedCell(cellId);
                                  broadcastCursor(row.id, column.columnId);
                                }}
                                onContextMenu={(e) => handleContextMenu(e, row.id, column.columnId)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </InfiniteLoader>
          </div>

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute bottom-4 right-4 bg-white dark:bg-[rgba(33,33,33,1)] rounded-lg shadow-lg px-4 py-2">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm text-gray-600">Loading...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}));