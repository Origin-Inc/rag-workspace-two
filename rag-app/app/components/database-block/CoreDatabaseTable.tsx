// Core Database Table Component
// Basic table view with CRUD operations and 1000+ record support

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFetcher } from '@remix-run/react';
import { cn } from '~/utils/cn';
import type {
  DatabaseBlockCore,
  DatabaseColumnCore,
  DatabaseRowCore,
  FilterCondition,
  SortConfig
} from '~/types/database-block-core';
import { 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Filter,
  Download,
  Upload,
  Settings,
  Database,
  ArrowUpDown
} from 'lucide-react';

interface CoreDatabaseTableProps {
  blockId: string;
  className?: string;
  onError?: (error: Error) => void;
}

export function CoreDatabaseTable({ 
  blockId, 
  className,
  onError 
}: CoreDatabaseTableProps) {
  const fetcher = useFetcher();
  const tableRef = useRef<HTMLDivElement>(null);
  
  // State
  const [databaseBlock, setDatabaseBlock] = useState<DatabaseBlockCore | null>(null);
  const [rows, setRows] = useState<DatabaseRowCore[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [sorts, setSorts] = useState<SortConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 100;

  // Load database block on mount
  useEffect(() => {
    loadDatabaseBlock();
  }, [blockId]);

  // Load rows when database block is loaded or filters/sorts change
  useEffect(() => {
    if (databaseBlock) {
      loadRows();
    }
  }, [databaseBlock, filters, sorts, offset]);

  const loadDatabaseBlock = async () => {
    setIsLoading(true);
    fetcher.submit(
      {
        intent: 'get-database-block',
        blockId
      },
      { 
        method: 'POST',
        action: '/api/database-block-core',
        encType: 'application/json'
      }
    );
  };

  const loadRows = async () => {
    if (!databaseBlock) return;
    
    fetcher.submit(
      {
        intent: 'get-rows',
        blockId,
        offset,
        limit,
        filters,
        sorts
      },
      { 
        method: 'POST',
        action: '/api/database-block-core',
        encType: 'application/json'
      }
    );
  };

  // Handle fetcher responses
  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.error) {
        onError?.(new Error(fetcher.data.error));
        setIsLoading(false);
        return;
      }

      const intent = fetcher.formData?.get('intent');
      
      if (intent === 'get-database-block' && fetcher.data.data) {
        setDatabaseBlock(fetcher.data.data);
        setIsLoading(false);
      } else if (intent === 'get-rows' && fetcher.data.data) {
        setRows(fetcher.data.data.rows);
        setTotalCount(fetcher.data.data.totalCount);
        setIsLoading(false);
      } else if (intent === 'create-row' && fetcher.data.data) {
        loadRows(); // Reload to get updated list
      } else if (intent === 'update-row' && fetcher.data.data) {
        // Update local state optimistically
        setRows(prev => prev.map(row => 
          row.id === fetcher.data.data.id ? fetcher.data.data : row
        ));
      } else if (intent === 'delete-rows') {
        loadRows(); // Reload after deletion
        setSelectedRows(new Set());
      }
    }
  }, [fetcher.data]);

  // ============= Event Handlers =============

  const handleAddRow = () => {
    if (!databaseBlock) return;
    
    fetcher.submit(
      {
        intent: 'create-row',
        blockId,
        rowData: {}
      },
      { 
        method: 'POST',
        action: '/api/database-block-core',
        encType: 'application/json'
      }
    );
  };

  const handleDeleteRows = () => {
    if (selectedRows.size === 0) return;
    
    if (confirm(`Delete ${selectedRows.size} row(s)?`)) {
      fetcher.submit(
        {
          intent: 'delete-rows',
          rowIds: Array.from(selectedRows)
        },
        { 
          method: 'POST',
          action: '/api/database-block-core',
          encType: 'application/json'
        }
      );
    }
  };

  const handleCellEdit = (rowId: string, columnId: string, value: any) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    
    fetcher.submit(
      {
        intent: 'update-row',
        rowId,
        rowData: {
          ...row.data,
          [columnId]: value
        },
        version: row.version
      },
      { 
        method: 'POST',
        action: '/api/database-block-core',
        encType: 'application/json'
      }
    );
  };

  const handleSort = (columnId: string) => {
    setSorts(prev => {
      const existing = prev.find(s => s.columnId === columnId);
      if (existing) {
        // Toggle direction or remove
        if (existing.direction === 'asc') {
          return prev.map(s => 
            s.columnId === columnId 
              ? { ...s, direction: 'desc' }
              : s
          );
        } else {
          return prev.filter(s => s.columnId !== columnId);
        }
      } else {
        // Add new sort
        return [...prev, { 
          columnId, 
          direction: 'asc', 
          priority: prev.length 
        }];
      }
    });
  };

  const handleBulkCreate = async () => {
    const count = prompt('How many test rows to create?', '1000');
    if (!count || isNaN(Number(count))) return;
    
    setIsLoading(true);
    fetcher.submit(
      {
        intent: 'bulk-create-rows',
        blockId,
        count: Number(count)
      },
      { 
        method: 'POST',
        action: '/api/database-block-core',
        encType: 'application/json'
      }
    );
  };

  // ============= Rendering =============

  if (!databaseBlock) {
    return (
      <div className={cn('flex items-center justify-center h-64', className)}>
        {isLoading ? (
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span>Loading database...</span>
          </div>
        ) : (
          <div className="text-center">
            <Database className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No database block found</p>
            <button
              onClick={loadDatabaseBlock}
              className="mt-2 text-blue-600 hover:text-blue-700"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  const getSortIcon = (columnId: string) => {
    const sort = sorts.find(s => s.columnId === columnId);
    if (!sort) return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    return sort.direction === 'asc' 
      ? <ChevronUp className="h-4 w-4 text-blue-600" />
      : <ChevronDown className="h-4 w-4 text-blue-600" />;
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-[rgba(33,33,33,1)] border-b dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <h3 className="font-semibold text-lg">{databaseBlock.name}</h3>
          <span className="text-sm text-gray-500">
            {totalCount} rows
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleAddRow}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            <span>Add Row</span>
          </button>
          
          <button
            onClick={handleDeleteRows}
            disabled={selectedRows.size === 0}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete ({selectedRows.size})</span>
          </button>
          
          <button
            onClick={handleBulkCreate}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            <Database className="h-4 w-4" />
            <span>Bulk Create</span>
          </button>
          
          <button
            onClick={() => setOffset(0)}
            className="px-3 py-1 text-sm border dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <Filter className="h-4 w-4" />
          </button>
          
          <button className="px-3 py-1 text-sm border dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" ref={tableRef}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
            <tr>
              <th className="w-12 px-2 py-2 border-b border-r text-left">
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
                  className="rounded"
                />
              </th>
              {databaseBlock.schema.map(column => (
                <th
                  key={column.id}
                  className="px-4 py-2 border-b border-r text-left cursor-pointer hover:bg-gray-100"
                  style={{ width: column.width || 150 }}
                  onClick={() => handleSort(column.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{column.name}</span>
                    {getSortIcon(column.id)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr 
                key={row.id}
                className={cn(
                  'hover:bg-gray-50 dark:hover:bg-gray-800',
                  selectedRows.has(row.id) && 'bg-blue-50'
                )}
              >
                <td className="w-12 px-2 py-2 border-b border-r">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(row.id)}
                    onChange={(e) => {
                      const newSelected = new Set(selectedRows);
                      if (e.target.checked) {
                        newSelected.add(row.id);
                      } else {
                        newSelected.delete(row.id);
                      }
                      setSelectedRows(newSelected);
                    }}
                    className="rounded"
                  />
                </td>
                {databaseBlock.schema.map(column => {
                  const cellId = `${row.id}-${column.id}`;
                  const isEditing = editingCell === cellId;
                  const value = row.data[column.id];
                  
                  return (
                    <td
                      key={column.id}
                      className="px-4 py-2 border-b border-r"
                      onClick={() => setEditingCell(cellId)}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          defaultValue={value || ''}
                          autoFocus
                          onBlur={(e) => {
                            handleCellEdit(row.id, column.id, e.target.value);
                            setEditingCell(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleCellEdit(row.id, column.id, e.currentTarget.value);
                              setEditingCell(null);
                            } else if (e.key === 'Escape') {
                              setEditingCell(null);
                            }
                          }}
                          className="w-full px-1 py-0.5 border rounded"
                        />
                      ) : (
                        <div className="truncate">
                          {renderCellValue(value, column)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-[rgba(33,33,33,1)] border-t dark:border-gray-700">
        <div className="text-sm text-gray-600">
          Showing {offset + 1}-{Math.min(offset + limit, totalCount)} of {totalCount}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-3 py-1 text-sm border dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-gray-100"
          >
            Previous
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= totalCount}
            className="px-3 py-1 text-sm border dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-gray-100"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function renderCellValue(value: any, column: DatabaseColumnCore): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-gray-400">Empty</span>;
  }

  switch (column.type) {
    case 'checkbox':
      return <input type="checkbox" checked={value} disabled className="rounded" />;
    
    case 'select':
      const option = column.options?.find(o => o.id === value);
      if (option) {
        return (
          <span className={cn(
            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
            option.color === 'red' && 'bg-red-100 text-red-800',
            option.color === 'yellow' && 'bg-yellow-100 text-yellow-800',
            option.color === 'green' && 'bg-green-100 text-green-800',
            option.color === 'blue' && 'bg-blue-100 text-blue-800',
            option.color === 'gray' && 'bg-gray-100 text-gray-800'
          )}>
            {option.label}
          </span>
        );
      }
      return value;
    
    case 'date':
    case 'datetime':
    case 'created_time':
    case 'updated_time':
      return new Date(value).toLocaleDateString();
    
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value);
    
    case 'percent':
      return `${value}%`;
    
    case 'rating':
      return '⭐'.repeat(Math.min(5, Math.max(0, value)));
    
    default:
      return String(value);
  }
}