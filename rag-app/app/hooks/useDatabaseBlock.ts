import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useFetcher } from '@remix-run/react';
import { 
  subscribeToPage,
  broadcast,
  onBroadcast,
  type PresenceState
} from '~/services/realtime.client';
import type {
  DatabaseBlock,
  DatabaseColumn,
  DatabaseRow,
  DatabaseView,
  Filter,
  Sort,
  GetDatabaseRowsResponse
} from '~/types/database-block';

interface VirtualizedDataState {
  rows: Map<number, DatabaseRow>;
  totalCount: number;
  loadedRanges: Array<{ start: number; end: number }>;
  isLoading: boolean;
  error: string | null;
}

interface UseDatabaseBlockOptions {
  pageSize?: number;
  overscan?: number;
  enableRealtime?: boolean;
  enablePresence?: boolean;
  userId?: string;
  userName?: string;
}

export function useDatabaseBlock(
  databaseBlockId: string,
  options: UseDatabaseBlockOptions = {}
) {
  const {
    pageSize = 50,
    overscan = 5,
    enableRealtime = true,
    enablePresence = true,
    userId,
    userName
  } = options;

  const fetcher = useFetcher<GetDatabaseRowsResponse>();
  
  // Core state
  const [databaseBlock, setDatabaseBlock] = useState<DatabaseBlock | null>(null);
  const [columns, setColumns] = useState<DatabaseColumn[]>([]);
  const [currentView, setCurrentView] = useState<DatabaseView | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sorts, setSorts] = useState<Sort[]>([]);
  
  // Virtualized data state
  const [dataState, setDataState] = useState<VirtualizedDataState>({
    rows: new Map(),
    totalCount: 0,
    loadedRanges: [],
    isLoading: false,
    error: null
  });

  // Presence state for collaboration
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([]);
  const [editingCells, setEditingCells] = useState<Map<string, string>>(new Map()); // cellId -> userId
  
  // Refs for optimization
  const loadingRanges = useRef<Set<string>>(new Set());
  const cleanupRef = useRef<(() => void) | null>(null);
  
  // Initialize database block on mount
  useEffect(() => {
    if (!databaseBlockId) return;
    
    console.log('[useDatabaseBlock] Initializing with databaseBlockId:', databaseBlockId);
    
    // Fetch the database block info to get columns
    // Rows will be loaded after columns are received
    console.log('[useDatabaseBlock] Fetching database block info...');
    fetcher.submit(
      {
        action: 'getDatabaseBlock',
        databaseBlockId
      },
      { method: 'post', action: `/api/database-block` }
    );
  }, [databaseBlockId]);


  // ==================== Data Loading ====================

  const loadRange = useCallback(async (start: number, end: number) => {
    const rangeKey = `${start}-${end}`;
    
    // Check if already loading or loaded
    if (loadingRanges.current.has(rangeKey)) return;
    
    const isRangeLoaded = dataState.loadedRanges.some(
      range => range.start <= start && range.end >= end
    );
    if (isRangeLoaded) return;

    loadingRanges.current.add(rangeKey);
    setDataState(prev => ({ ...prev, isLoading: true }));

    // Fetch data from server
    fetcher.submit(
      {
        action: 'getDatabaseRows',
        databaseBlockId,
        limit: end - start + 1,
        offset: start,
        filters: JSON.stringify(filters),
        sorts: JSON.stringify(sorts),
        viewId: currentView?.id
      },
      { method: 'post', action: `/api/database-block` }
    );
  }, [databaseBlockId, filters, sorts, currentView, fetcher]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data && fetcher.state === 'idle') {
      const action = fetcher.formData?.get('action');
      
      console.log('[useDatabaseBlock] Fetcher response for action:', action);
      console.log('[useDatabaseBlock] Fetcher data:', fetcher.data);
      
      // Check if this is a database block response (has success and databaseBlock fields)
      const response = fetcher.data as any;
      if (response.success && response.databaseBlock && response.columns) {
        // This is a getDatabaseBlock response
        console.log('[useDatabaseBlock] getDatabaseBlock response detected');
        console.log('[useDatabaseBlock] Setting database block:', response.databaseBlock);
        setDatabaseBlock(response.databaseBlock);
        
        if (response.columns && Array.isArray(response.columns)) {
          console.log('[useDatabaseBlock] Setting columns:', response.columns.length, 'columns');
          setColumns(response.columns);
          
          // After getting columns, load the initial rows
          console.log('[useDatabaseBlock] Loading initial rows...');
          fetcher.submit(
            {
              action: 'getDatabaseRows',
              databaseBlockId,
              limit: pageSize,
              offset: 0,
              filters: JSON.stringify(filters),
              sorts: JSON.stringify(sorts)
            },
            { method: 'post', action: `/api/database-block` }
          );
        } else {
          console.log('[useDatabaseBlock] No columns in response!');
        }
      } else if (action === 'getDatabaseRows' || (!action && response.rows !== undefined)) {
        // Handle rows response
        const response = fetcher.data as GetDatabaseRowsResponse;
        
        setDataState(prev => {
          const newRows = new Map(prev.rows);
          
          // Check if response has rows before iterating
          if (response.rows && Array.isArray(response.rows)) {
            response.rows.forEach((row, index) => {
              newRows.set(index + (fetcher.formData?.get('offset') as any || 0), row);
            });
          }

          const offset = parseInt(fetcher.formData?.get('offset') as string || '0');
          const limit = parseInt(fetcher.formData?.get('limit') as string || '50');
          
          const newRanges = [...prev.loadedRanges, { start: offset, end: offset + limit - 1 }];
          const mergedRanges = mergeRanges(newRanges);

          return {
            ...prev,
            rows: newRows,
            totalCount: response.totalCount,
            loadedRanges: mergedRanges,
            isLoading: false,
            error: null
          };
        });

        // Clear loading flag
        const offset = parseInt(fetcher.formData?.get('offset') as string || '0');
        const limit = parseInt(fetcher.formData?.get('limit') as string || '50');
        loadingRanges.current.delete(`${offset}-${offset + limit - 1}`);
      } else if (action === 'addColumn') {
        // Handle column response
        const response = fetcher.data as any;
        if (response.success && response.column) {
          // Replace the temporary column with the server's response
          setColumns(prev => {
            // Check if we have a temporary column (starts with col-temp-)
            const tempIndex = prev.findIndex(col => col.id.startsWith('col-temp-'));
            if (tempIndex !== -1) {
              // Replace temporary column with server response
              const newColumns = [...prev];
              newColumns[tempIndex] = response.column;
              return newColumns;
            } else {
              // If no temp column found, just add it (shouldn't happen with optimistic updates)
              return [...prev, response.column];
            }
          });
        }
      } else if (action === 'addRow') {
        // Handle add row response
        const response = fetcher.data as any;
        if (response.success && response.row) {
          console.log('[useDatabaseBlock] Replacing temporary row with server response:', response.row);
          setDataState(prev => {
            const newRows = new Map(prev.rows);
            
            // Find and replace the temporary row
            let foundTemp = false;
            for (const [index, row] of newRows.entries()) {
              if (row.id.startsWith('row-temp-')) {
                // Replace temporary row with server response
                newRows.set(index, response.row);
                foundTemp = true;
                break;
              }
            }
            
            // If no temp row found, add it at the end (shouldn't happen with optimistic updates)
            if (!foundTemp) {
              const newRowIndex = prev.totalCount || 0;
              newRows.set(newRowIndex, response.row);
              return {
                ...prev,
                rows: newRows,
                totalCount: (prev.totalCount || 0) + 1
              };
            }
            
            return {
              ...prev,
              rows: newRows
            };
          });
        }
      } else if (action === 'deleteRow') {
        // Handle delete row response
        const response = fetcher.data as any;
        if (response.success) {
          // Re-fetch rows to get updated data
          const visibleRange = { start: 0, end: pageSize - 1 };
          loadRange(visibleRange.start, visibleRange.end);
        }
      }
    }
  }, [fetcher.data, fetcher.state, fetcher.formData, databaseBlockId, loadRange, pageSize, filters, sorts]);

  // ==================== Virtualization ====================

  const getVisibleRange = useCallback((
    scrollTop: number,
    containerHeight: number,
    rowHeight: number
  ) => {
    const firstVisibleRow = Math.floor(scrollTop / rowHeight);
    const lastVisibleRow = Math.ceil((scrollTop + containerHeight) / rowHeight);
    
    // Add overscan
    const start = Math.max(0, firstVisibleRow - overscan);
    const end = Math.min(dataState.totalCount - 1, lastVisibleRow + overscan);
    
    return { start, end };
  }, [overscan, dataState.totalCount]);

  const ensureRowsLoaded = useCallback((start: number, end: number) => {
    // Find unloaded ranges
    const unloadedRanges = findUnloadedRanges(
      start,
      end,
      dataState.loadedRanges
    );

    // Load each unloaded range
    unloadedRanges.forEach(range => {
      const rangeStart = Math.floor(range.start / pageSize) * pageSize;
      const rangeEnd = Math.min(
        rangeStart + pageSize - 1,
        dataState.totalCount - 1
      );
      loadRange(rangeStart, rangeEnd);
    });
  }, [dataState.loadedRanges, dataState.totalCount, pageSize, loadRange]);

  // ==================== Real-time Updates ====================

  useEffect(() => {
    if (!enableRealtime || !databaseBlockId) return;

    const channelName = `database-${databaseBlockId}`;
    
    const cleanup = subscribeToPage(channelName, {
      blocks: {
        onInsert: (payload) => {
          if (payload.new && payload.new.type === 'database_row') {
            const newRow = payload.new as DatabaseRow;
            setDataState(prev => {
              const newRows = new Map(prev.rows);
              // Insert at the correct position
              newRows.set(newRow.rowNumber, newRow);
              return {
                ...prev,
                rows: newRows,
                totalCount: prev.totalCount + 1
              };
            });
          }
        },
        onUpdate: (payload) => {
          if (payload.new && payload.new.type === 'database_row') {
            const updatedRow = payload.new as DatabaseRow;
            setDataState(prev => {
              const newRows = new Map(prev.rows);
              // Find and update the row
              for (const [index, row] of newRows.entries()) {
                if (row.id === updatedRow.id) {
                  newRows.set(index, updatedRow);
                  break;
                }
              }
              return { ...prev, rows: newRows };
            });
          }
        },
        onDelete: (payload) => {
          if (payload.old && payload.old.type === 'database_row') {
            const deletedRow = payload.old as DatabaseRow;
            setDataState(prev => {
              const newRows = new Map(prev.rows);
              // Find and remove the row
              for (const [index, row] of newRows.entries()) {
                if (row.id === deletedRow.id) {
                  newRows.delete(index);
                  break;
                }
              }
              return {
                ...prev,
                rows: newRows,
                totalCount: prev.totalCount - 1
              };
            });
          }
        }
      },
      presence: enablePresence ? {
        onSync: (state) => {
          const users = Object.values(state).flat() as PresenceState[];
          setOnlineUsers(users);
        },
        onJoin: (key, presence) => {
          setOnlineUsers(prev => [...prev, presence]);
        },
        onLeave: (key, presence) => {
          setOnlineUsers(prev => 
            prev.filter(u => u.userId !== presence.userId)
          );
        }
      } : undefined
    });

    // Listen for cell editing broadcasts
    const unsubscribe = onBroadcast(channelName, 'cell-edit', (payload) => {
      if (payload.action === 'start') {
        setEditingCells(prev => {
          const next = new Map(prev);
          next.set(payload.cellId, payload.userId);
          return next;
        });
      } else if (payload.action === 'end') {
        setEditingCells(prev => {
          const next = new Map(prev);
          next.delete(payload.cellId);
          return next;
        });
      }
    });

    cleanupRef.current = () => {
      cleanup();
      unsubscribe();
    };

    return cleanupRef.current;
  }, [enableRealtime, enablePresence, databaseBlockId]);

  // ==================== Cell Operations ====================

  const updateCell = useCallback(async (
    rowId: string,
    columnId: string,
    value: any
  ) => {
    const cellId = `${rowId}-${columnId}`;
    
    // Clear editing state
    setEditingCells(prev => {
      const next = new Map(prev);
      next.delete(cellId);
      return next;
    });
    
    // Optimistic update
    setDataState(prev => {
      const newRows = new Map(prev.rows);
      for (const [index, row] of newRows.entries()) {
        if (row.id === rowId) {
          const updatedRow = {
            ...row,
            data: { ...row.data, [columnId]: value }
          };
          newRows.set(index, updatedRow);
          break;
        }
      }
      return { ...prev, rows: newRows };
    });

    // Send update to server
    fetcher.submit(
      {
        action: 'updateCell',
        rowId,
        columnId,
        value: JSON.stringify(value)
      },
      { method: 'post', action: `/api/database-block` }
    );

    // Broadcast cell edit end
    if (enableRealtime) {
      broadcast(`database-${databaseBlockId}`, 'cell-edit', {
        action: 'end',
        cellId,
        userId
      });
    }
  }, [databaseBlockId, fetcher, enableRealtime, userId]);

  const startEditingCell = useCallback((rowId: string, columnId: string) => {
    const cellId = `${rowId}-${columnId}`;
    
    // Set local editing state immediately
    setEditingCells(prev => {
      const next = new Map(prev);
      next.set(cellId, userId || 'local-user');
      return next;
    });
    
    // Broadcast to other users if realtime is enabled
    if (enableRealtime && userId) {
      broadcast(`database-${databaseBlockId}`, 'cell-edit', {
        action: 'start',
        cellId,
        userId,
        userName
      });
    }
  }, [databaseBlockId, enableRealtime, userId, userName]);

  // ==================== Row Operations ====================

  const addRow = useCallback(async (data: Record<string, any> = {}) => {
    // Create a new row with temporary ID
    const newRow: DatabaseRow = {
      id: `row-temp-${Date.now()}`, // Temporary ID until server responds
      databaseBlockId: databaseBlockId,
      data: data,
      position: dataState.totalCount || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Optimistic update - add the row immediately
    setDataState(prev => {
      const newRows = new Map(prev.rows);
      // Add to the end of the current data
      newRows.set(prev.totalCount || 0, newRow);
      
      return {
        ...prev,
        rows: newRows,
        totalCount: (prev.totalCount || 0) + 1
      };
    });

    fetcher.submit(
      {
        action: 'addRow',
        databaseBlockId,
        data: JSON.stringify(data)
      },
      { method: 'post', action: `/api/database-block` }
    );
  }, [databaseBlockId, dataState.totalCount, fetcher]);

  const deleteRow = useCallback(async (rowId: string) => {
    // Optimistic delete
    setDataState(prev => {
      const newRows = new Map(prev.rows);
      for (const [index, row] of newRows.entries()) {
        if (row.id === rowId) {
          newRows.delete(index);
          break;
        }
      }
      return {
        ...prev,
        rows: newRows,
        totalCount: prev.totalCount - 1
      };
    });

    fetcher.submit(
      {
        action: 'deleteRow',
        rowId
      },
      { method: 'post', action: `/api/database-block` }
    );
  }, [fetcher]);

  const duplicateRow = useCallback(async (rowId: string) => {
    fetcher.submit(
      {
        action: 'duplicateRow',
        rowId
      },
      { method: 'post', action: `/api/database-block` }
    );
  }, [fetcher]);

  // ==================== Column Operations ====================

  const addColumn = useCallback(async (column: Partial<DatabaseColumn>) => {
    // Create a new column with defaults
    const newColumn: DatabaseColumn = {
      id: `col-temp-${Date.now()}`, // Temporary ID until server responds
      databaseBlockId: databaseBlockId,
      columnId: column.columnId || `column-${Date.now()}`,
      name: column.name || 'New Column',
      type: column.type || 'text',
      position: columns.length,
      width: column.width || 150,
      ...column
    };

    // Optimistic update - add the column immediately
    setColumns(prev => [...prev, newColumn]);

    fetcher.submit(
      {
        action: 'addColumn',
        databaseBlockId,
        column: JSON.stringify(column)
      },
      { method: 'post', action: `/api/database-block` }
    );
  }, [databaseBlockId, columns.length, fetcher]);

  const updateColumn = useCallback(async (
    columnId: string,
    updates: Partial<DatabaseColumn>
  ) => {
    // Optimistic update
    setColumns(prev => 
      prev.map(col => 
        col.id === columnId ? { ...col, ...updates } : col
      )
    );

    fetcher.submit(
      {
        action: 'updateColumn',
        columnId,
        updates: JSON.stringify(updates)
      },
      { method: 'post', action: `/api/database-block` }
    );
  }, [fetcher]);

  const deleteColumn = useCallback(async (columnId: string) => {
    if (!databaseBlock) {
      console.error('[useDatabaseBlock] Cannot delete column: database block not loaded');
      return;
    }

    // Optimistic delete
    setColumns(prev => prev.filter(col => col.id !== columnId));

    fetcher.submit(
      {
        action: 'deleteColumn',
        databaseBlockId: databaseBlock.blockId,
        columnId
      },
      { method: 'post', action: `/api/database-block` }
    );
  }, [fetcher, databaseBlock]);

  const reorderColumns = useCallback(async (columnOrder: string[]) => {
    // Optimistic reorder
    setColumns(prev => {
      const columnMap = new Map(prev.map(col => [col.columnId, col]));
      return columnOrder.map(id => columnMap.get(id)!).filter(Boolean);
    });

    fetcher.submit(
      {
        action: 'reorderColumns',
        databaseBlockId,
        columnOrder: JSON.stringify(columnOrder)
      },
      { method: 'post', action: `/api/database-block` }
    );
  }, [databaseBlockId, fetcher]);

  // ==================== View Operations ====================

  const applyView = useCallback((view: DatabaseView) => {
    setCurrentView(view);
    setFilters(view.filters);
    setSorts(view.sorts);
    
    // Clear loaded data to force reload with new view
    setDataState(prev => ({
      ...prev,
      rows: new Map(),
      loadedRanges: [],
      isLoading: false
    }));
  }, []);

  const saveView = useCallback(async (
    name: string,
    makeDefault: boolean = false
  ) => {
    fetcher.submit(
      {
        action: 'saveView',
        databaseBlockId,
        view: JSON.stringify({
          name,
          filters,
          sorts,
          visibleColumns: columns.filter(c => !c.isHidden).map(c => c.columnId),
          isDefault: makeDefault
        })
      },
      { method: 'post', action: `/api/database-block` }
    );
  }, [databaseBlockId, columns, filters, sorts, fetcher]);

  // ==================== Filter & Sort ====================

  const applyFilters = useCallback((newFilters: Filter[]) => {
    setFilters(newFilters);
    
    // Clear loaded data to force reload with new filters
    setDataState(prev => ({
      ...prev,
      rows: new Map(),
      loadedRanges: [],
      isLoading: false
    }));
  }, []);

  const applySorts = useCallback((newSorts: Sort[]) => {
    setSorts(newSorts);
    
    // Clear loaded data to force reload with new sorts
    setDataState(prev => ({
      ...prev,
      rows: new Map(),
      loadedRanges: [],
      isLoading: false
    }));
  }, []);

  // ==================== Export Functions ====================

  return {
    // Data
    databaseBlock,
    columns,
    rows: Array.from(dataState.rows.values()),
    totalCount: dataState.totalCount,
    isLoading: dataState.isLoading,
    error: dataState.error,
    
    // View & Filters
    currentView,
    filters,
    sorts,
    
    // Collaboration
    onlineUsers,
    editingCells,
    
    // Virtualization
    getVisibleRange,
    ensureRowsLoaded,
    
    // Cell Operations
    updateCell,
    startEditingCell,
    
    // Row Operations
    addRow,
    deleteRow,
    duplicateRow,
    
    // Column Operations
    addColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    
    // View Operations
    applyView,
    saveView,
    
    // Filter & Sort
    applyFilters,
    applySorts
  };
}

// ==================== Helper Functions ====================

function mergeRanges(ranges: Array<{ start: number; end: number }>) {
  if (ranges.length === 0) return [];
  
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];
    
    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }
  
  return merged;
}

function findUnloadedRanges(
  start: number,
  end: number,
  loadedRanges: Array<{ start: number; end: number }>
) {
  const unloaded: Array<{ start: number; end: number }> = [];
  let currentStart = start;
  
  for (const range of loadedRanges) {
    if (range.start > currentStart) {
      unloaded.push({
        start: currentStart,
        end: Math.min(range.start - 1, end)
      });
    }
    currentStart = Math.max(currentStart, range.end + 1);
    if (currentStart > end) break;
  }
  
  if (currentStart <= end) {
    unloaded.push({ start: currentStart, end });
  }
  
  return unloaded;
}