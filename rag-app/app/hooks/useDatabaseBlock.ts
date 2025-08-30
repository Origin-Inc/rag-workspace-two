import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  DatabaseBlock,
  DatabaseColumn,
  DatabaseRow,
  Filter,
  Sort,
  DatabaseColumnType
} from '~/types/database-block';

// Mock data generator for demonstration
function generateMockData(blockId: string): {
  block: DatabaseBlock;
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
} {
  const columns: DatabaseColumn[] = [
    { id: 'col1', name: 'Name', type: 'text', width: 200 },
    { id: 'col2', name: 'Status', type: 'select', width: 150, options: [
      { id: 'todo', label: 'To Do', color: 'gray' },
      { id: 'in_progress', label: 'In Progress', color: 'blue' },
      { id: 'done', label: 'Done', color: 'green' }
    ]},
    { id: 'col3', name: 'Priority', type: 'select', width: 120, options: [
      { id: 'low', label: 'Low', color: 'gray' },
      { id: 'medium', label: 'Medium', color: 'yellow' },
      { id: 'high', label: 'High', color: 'red' }
    ]},
    { id: 'col4', name: 'Due Date', type: 'date', width: 150 },
    { id: 'col5', name: 'Assignee', type: 'user', width: 150 },
    { id: 'col6', name: 'Progress', type: 'percent', width: 100 },
  ];

  const rows: DatabaseRow[] = Array.from({ length: 50 }, (_, i) => ({
    id: `row${i + 1}`,
    cells: {
      col1: `Task ${i + 1}`,
      col2: ['todo', 'in_progress', 'done'][Math.floor(Math.random() * 3)],
      col3: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
      col4: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
      col5: `user${Math.floor(Math.random() * 5) + 1}`,
      col6: Math.floor(Math.random() * 101)
    }
  }));

  const block: DatabaseBlock = {
    id: blockId,
    name: 'Project Tasks',
    description: 'Track project tasks and their status',
    icon: '📋',
    rowCount: rows.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return { block, columns, rows };
}

export function useDatabaseBlock(blockId: string) {
  const [databaseBlock, setDatabaseBlock] = useState<DatabaseBlock | null>(null);
  const [columns, setColumns] = useState<DatabaseColumn[]>([]);
  const [rows, setRows] = useState<DatabaseRow[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sorts, setSorts] = useState<Sort[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load database data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // In a real app, this would fetch from API
        const mockData = generateMockData(blockId);
        setDatabaseBlock(mockData.block);
        setColumns(mockData.columns);
        setRows(mockData.rows);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load database'));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [blockId]);

  // Filter and sort rows
  const processedRows = useMemo(() => {
    let result = [...rows];

    // Apply filters
    filters.forEach(filter => {
      result = result.filter(row => {
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
          case 'is_empty':
            return !value || value === '';
          case 'is_not_empty':
            return value && value !== '';
          case 'greater_than':
            return Number(value) > Number(filter.value);
          case 'less_than':
            return Number(value) < Number(filter.value);
          default:
            return true;
        }
      });
    });

    // Apply sorts
    if (sorts.length > 0) {
      result.sort((a, b) => {
        for (const sort of sorts) {
          const aVal = a.cells[sort.columnId];
          const bVal = b.cells[sort.columnId];
          
          let comparison = 0;
          if (aVal < bVal) comparison = -1;
          else if (aVal > bVal) comparison = 1;
          
          if (comparison !== 0) {
            return sort.direction === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      });
    }

    return result;
  }, [rows, filters, sorts]);

  // Row operations
  const addRow = useCallback(() => {
    const newRow: DatabaseRow = {
      id: `row${Date.now()}`,
      cells: columns.reduce((acc, col) => {
        acc[col.id] = col.type === 'checkbox' ? false : '';
        return acc;
      }, {} as Record<string, any>)
    };
    setRows(prev => [...prev, newRow]);
  }, [columns]);

  const updateRow = useCallback((rowId: string, updates: Partial<DatabaseRow['cells']>) => {
    setRows(prev => prev.map(row => 
      row.id === rowId 
        ? { ...row, cells: { ...row.cells, ...updates } }
        : row
    ));
  }, []);

  const deleteRows = useCallback((rowIds: string[]) => {
    setRows(prev => prev.filter(row => !rowIds.includes(row.id)));
  }, []);

  // Column operations
  const addColumn = useCallback((column: Partial<DatabaseColumn>) => {
    const newColumn: DatabaseColumn = {
      id: `col${Date.now()}`,
      name: column.name || 'New Column',
      type: column.type || 'text',
      width: column.width || 150
    };
    setColumns(prev => [...prev, newColumn]);
    
    // Add empty cells for the new column to all rows
    setRows(prev => prev.map(row => ({
      ...row,
      cells: { ...row.cells, [newColumn.id]: '' }
    })));
  }, []);

  const updateColumn = useCallback((columnId: string, updates: Partial<DatabaseColumn>) => {
    setColumns(prev => prev.map(col =>
      col.id === columnId ? { ...col, ...updates } : col
    ));
  }, []);

  const deleteColumn = useCallback((columnId: string) => {
    setColumns(prev => prev.filter(col => col.id !== columnId));
    
    // Remove cells for the deleted column from all rows
    setRows(prev => prev.map(row => {
      const { [columnId]: deleted, ...rest } = row.cells;
      return { ...row, cells: rest };
    }));
  }, []);

  // Filter and sort operations
  const applyFilters = useCallback((newFilters: Filter[]) => {
    setFilters(newFilters);
  }, []);

  const applySorts = useCallback((newSorts: Sort[]) => {
    setSorts(newSorts);
  }, []);

  // Selection operations
  const selectRow = useCallback((rowId: string, isSelected: boolean) => {
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

  const selectAllRows = useCallback((isSelected: boolean) => {
    if (isSelected) {
      setSelectedRows(new Set(processedRows.map(row => row.id)));
    } else {
      setSelectedRows(new Set());
    }
  }, [processedRows]);

  const clearSelection = useCallback(() => {
    setSelectedRows(new Set());
  }, []);

  return {
    databaseBlock,
    columns,
    rows: processedRows,
    filters,
    sorts,
    selectedRows,
    isLoading,
    error,
    addRow,
    updateRow,
    deleteRows,
    addColumn,
    updateColumn,
    deleteColumn,
    applyFilters,
    applySorts,
    selectRow,
    selectAllRows,
    clearSelection
  };
}