import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFetcher } from '@remix-run/react';
import type { DatabaseRow, Filter, Sort } from '~/types/database-block';

interface ProgressiveLoadOptions {
  blockId: string;
  initialPageSize?: number;
  maxPageSize?: number;
  filters?: Filter[];
  sorts?: Sort[];
  searchQuery?: string;
  enabled?: boolean;
}

interface ProgressiveLoadState {
  rows: DatabaseRow[];
  totalRows: number;
  loadedRows: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
}

interface VirtualWindow {
  startIndex: number;
  endIndex: number;
  overscan?: number;
}

export function useProgressiveDataLoad({
  blockId,
  initialPageSize = 100,
  maxPageSize = 1000,
  filters = [],
  sorts = [],
  searchQuery = '',
  enabled = true
}: ProgressiveLoadOptions) {
  const [state, setState] = useState<ProgressiveLoadState>({
    rows: [],
    totalRows: 0,
    loadedRows: 0,
    isLoading: true,
    isLoadingMore: false,
    hasMore: true,
    error: null
  });

  const fetcher = useFetcher();
  const loadedPages = useRef(new Set<number>());
  const rowCache = useRef(new Map<string, DatabaseRow>());
  const virtualWindowRef = useRef<VirtualWindow>({ startIndex: 0, endIndex: 100 });
  const loadingPromise = useRef<Promise<void> | null>(null);

  // Create a stable cache key for the current query
  const cacheKey = useMemo(() => {
    return JSON.stringify({ blockId, filters, sorts, searchQuery });
  }, [blockId, filters, sorts, searchQuery]);

  // Reset when query changes
  useEffect(() => {
    loadedPages.current.clear();
    rowCache.current.clear();
    setState(prev => ({
      ...prev,
      rows: [],
      loadedRows: 0,
      isLoading: true,
      hasMore: true,
      error: null
    }));
  }, [cacheKey]);

  // Load initial data
  useEffect(() => {
    if (!enabled) return;

    const loadInitialData = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        const response = await fetch(
          `/api/database-block/${blockId}/rows?` + new URLSearchParams({
            page: '1',
            pageSize: String(initialPageSize),
            filters: JSON.stringify(filters),
            sorts: JSON.stringify(sorts),
            searchQuery
          })
        );

        if (!response.ok) {
          throw new Error(`Failed to load data: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Cache the rows
        data.data.forEach((row: DatabaseRow) => {
          rowCache.current.set(row.id, row);
        });

        setState({
          rows: data.data,
          totalRows: data.total,
          loadedRows: data.data.length,
          isLoading: false,
          isLoadingMore: false,
          hasMore: data.hasMore,
          error: null
        });

        loadedPages.current.add(1);
      } catch (error) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error : new Error('Unknown error')
        }));
      }
    };

    loadInitialData();
  }, [blockId, initialPageSize, filters, sorts, searchQuery, enabled]);

  // Load more data progressively
  const loadMore = useCallback(async (pageSize?: number) => {
    if (state.isLoadingMore || !state.hasMore) return;

    const nextPage = loadedPages.current.size + 1;
    const size = Math.min(pageSize || initialPageSize, maxPageSize);

    setState(prev => ({ ...prev, isLoadingMore: true }));

    try {
      const response = await fetch(
        `/api/database-block/${blockId}/rows?` + new URLSearchParams({
          page: String(nextPage),
          pageSize: String(size),
          filters: JSON.stringify(filters),
          sorts: JSON.stringify(sorts),
          searchQuery
        })
      );

      if (!response.ok) {
        throw new Error(`Failed to load more data: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache the new rows
      data.data.forEach((row: DatabaseRow) => {
        rowCache.current.set(row.id, row);
      });

      setState(prev => ({
        ...prev,
        rows: [...prev.rows, ...data.data],
        loadedRows: prev.loadedRows + data.data.length,
        isLoadingMore: false,
        hasMore: data.hasMore
      }));

      loadedPages.current.add(nextPage);
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoadingMore: false,
        error: error instanceof Error ? error : new Error('Unknown error')
      }));
    }
  }, [state.isLoadingMore, state.hasMore, blockId, initialPageSize, maxPageSize, filters, sorts, searchQuery]);

  // Load data for a specific virtual window
  const loadVirtualWindow = useCallback(async (window: VirtualWindow) => {
    virtualWindowRef.current = window;
    
    const startPage = Math.floor(window.startIndex / initialPageSize) + 1;
    const endPage = Math.ceil(window.endIndex / initialPageSize);
    
    const pagesToLoad: number[] = [];
    for (let page = startPage; page <= endPage; page++) {
      if (!loadedPages.current.has(page)) {
        pagesToLoad.push(page);
      }
    }

    if (pagesToLoad.length === 0) return;

    // Prevent concurrent loads
    if (loadingPromise.current) {
      await loadingPromise.current;
    }

    loadingPromise.current = (async () => {
      try {
        const loadPromises = pagesToLoad.map(async (page) => {
          const response = await fetch(
            `/api/database-block/${blockId}/rows?` + new URLSearchParams({
              page: String(page),
              pageSize: String(initialPageSize),
              filters: JSON.stringify(filters),
              sorts: JSON.stringify(sorts),
              searchQuery
            })
          );

          if (!response.ok) {
            throw new Error(`Failed to load page ${page}`);
          }

          const data = await response.json();
          
          // Cache the rows
          data.data.forEach((row: DatabaseRow) => {
            rowCache.current.set(row.id, row);
          });

          loadedPages.current.add(page);
          return data.data;
        });

        const results = await Promise.all(loadPromises);
        const allRows = results.flat();

        setState(prev => {
          const existingIds = new Set(prev.rows.map(r => r.id));
          const newRows = allRows.filter(r => !existingIds.has(r.id));
          
          return {
            ...prev,
            rows: [...prev.rows, ...newRows].sort((a, b) => {
              // Sort by position or ID
              if (a.position !== undefined && b.position !== undefined) {
                return a.position - b.position;
              }
              return a.id.localeCompare(b.id);
            }),
            loadedRows: prev.loadedRows + newRows.length
          };
        });
      } finally {
        loadingPromise.current = null;
      }
    })();

    await loadingPromise.current;
  }, [blockId, initialPageSize, filters, sorts, searchQuery]);

  // Prefetch adjacent data for smooth scrolling
  const prefetchAdjacent = useCallback(async (currentIndex: number) => {
    const prefetchRange = initialPageSize * 2;
    const startIndex = Math.max(0, currentIndex - prefetchRange);
    const endIndex = Math.min(state.totalRows - 1, currentIndex + prefetchRange);
    
    await loadVirtualWindow({
      startIndex,
      endIndex,
      overscan: 50
    });
  }, [initialPageSize, state.totalRows, loadVirtualWindow]);

  // Get a specific row by ID from cache
  const getRow = useCallback((rowId: string): DatabaseRow | undefined => {
    return rowCache.current.get(rowId);
  }, []);

  // Get rows for a specific range
  const getRowsInRange = useCallback((startIndex: number, endIndex: number): DatabaseRow[] => {
    return state.rows.slice(startIndex, endIndex + 1);
  }, [state.rows]);

  // Update a row in the cache
  const updateCachedRow = useCallback((rowId: string, updates: Partial<DatabaseRow>) => {
    const existingRow = rowCache.current.get(rowId);
    if (existingRow) {
      const updatedRow = { ...existingRow, ...updates };
      rowCache.current.set(rowId, updatedRow);
      
      setState(prev => ({
        ...prev,
        rows: prev.rows.map(row => 
          row.id === rowId ? updatedRow : row
        )
      }));
    }
  }, []);

  // Invalidate cache and reload
  const invalidateAndReload = useCallback(async () => {
    loadedPages.current.clear();
    rowCache.current.clear();
    
    setState(prev => ({
      ...prev,
      rows: [],
      loadedRows: 0,
      isLoading: true,
      hasMore: true,
      error: null
    }));

    // Reload will be triggered by the effect
  }, []);

  // Get loading progress
  const progress = useMemo(() => {
    if (state.totalRows === 0) return 0;
    return (state.loadedRows / state.totalRows) * 100;
  }, [state.loadedRows, state.totalRows]);

  return {
    // State
    rows: state.rows,
    totalRows: state.totalRows,
    loadedRows: state.loadedRows,
    isLoading: state.isLoading,
    isLoadingMore: state.isLoadingMore,
    hasMore: state.hasMore,
    error: state.error,
    progress,
    
    // Methods
    loadMore,
    loadVirtualWindow,
    prefetchAdjacent,
    getRow,
    getRowsInRange,
    updateCachedRow,
    invalidateAndReload,
    
    // Cache info
    cachedRowCount: rowCache.current.size,
    loadedPageCount: loadedPages.current.size
  };
}