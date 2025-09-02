import { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseColumn, DatabaseRow } from '~/types/database-block';
import { cn } from '~/utils/cn';

interface DatabaseTableWrapperProps {
  initialData?: any;
  onDataChange?: (data: any) => void;
  className?: string;
}

/**
 * Wrapper component for DatabaseTable that works with simple data structures
 * Used in the block editor where we don't have a full database block ID
 */
export function DatabaseTableWrapper({
  initialData,
  onDataChange,
  className
}: DatabaseTableWrapperProps) {
  // Initialize columns and rows from initial data or create defaults
  const [columns, setColumns] = useState<DatabaseColumn[]>(() => {
    if (initialData?.columns) {
      return initialData.columns;
    }
    // Default columns for a new database
    return [
      { id: 'col1', name: 'Name', type: 'text', position: 0, width: 200 },
      { id: 'col2', name: 'Status', type: 'select', position: 1, width: 150, options: [
        { id: 'todo', label: 'To Do', color: 'gray' },
        { id: 'in_progress', label: 'In Progress', color: 'blue' },
        { id: 'done', label: 'Done', color: 'green' }
      ]},
      { id: 'col3', name: 'Priority', type: 'select', position: 2, width: 120, options: [
        { id: 'low', label: 'Low', color: 'gray' },
        { id: 'medium', label: 'Medium', color: 'yellow' },
        { id: 'high', label: 'High', color: 'red' }
      ]},
      { id: 'col4', name: 'Notes', type: 'text', position: 3, width: 300 },
    ];
  });

  const [rows, setRows] = useState<DatabaseRow[]>(() => {
    if (initialData?.rows && Array.isArray(initialData.rows)) {
      // Ensure all rows have proper structure with cells property
      return initialData.rows.map((row: any, index: number) => {
        // If row doesn't have cells property, create it
        if (!row.cells) {
          console.warn('[DatabaseTableWrapper] Row missing cells property:', row);
          row.cells = {};
          // Try to extract cell data from row properties
          columns.forEach(col => {
            if (row[col.id] !== undefined) {
              row.cells[col.id] = row[col.id];
            } else {
              row.cells[col.id] = col.type === 'select' ? col.options?.[0]?.id || '' : '';
            }
          });
        }
        // Ensure all required properties exist
        return {
          id: row.id || `row_${uuidv4()}`,
          blockId: row.blockId || '',
          cells: row.cells || {},
          position: row.position !== undefined ? row.position : index,
          createdAt: row.createdAt || new Date().toISOString(),
          updatedAt: row.updatedAt || new Date().toISOString()
        };
      });
    }
    // Start with one empty row
    const rowId = `row_${uuidv4()}`;
    return [{
      id: rowId,
      blockId: '',
      cells: columns.reduce((acc, col) => ({
        ...acc,
        [col.id]: col.type === 'select' ? col.options?.[0]?.id || '' : ''
      }), {}),
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }];
  });

  // Update parent when data changes
  const handleDataUpdate = useCallback(() => {
    onDataChange?.({ columns, rows });
  }, [columns, rows, onDataChange]);

  // Column operations
  const handleAddColumn = useCallback(() => {
    const newColumn: DatabaseColumn = {
      id: `col_${uuidv4()}`,
      name: `Column ${columns.length + 1}`,
      type: 'text',
      position: columns.length,
      width: 150
    };
    
    setColumns(prev => {
      const updated = [...prev, newColumn];
      onDataChange?.({ columns: updated, rows });
      return updated;
    });

    // Add empty cells for the new column to all rows
    setRows(prev => prev.map(row => ({
      ...row,
      cells: {
        ...row.cells,
        [newColumn.id]: ''
      }
    })));
  }, [columns, rows, onDataChange]);

  const handleUpdateColumn = useCallback((columnId: string, updates: Partial<DatabaseColumn>) => {
    setColumns(prev => {
      const updated = prev.map(col => 
        col.id === columnId ? { ...col, ...updates } : col
      );
      onDataChange?.({ columns: updated, rows });
      return updated;
    });
  }, [rows, onDataChange]);

  const handleDeleteColumn = useCallback((columnId: string) => {
    if (columns.length <= 1) return; // Keep at least one column
    
    setColumns(prev => {
      const updated = prev.filter(col => col.id !== columnId);
      onDataChange?.({ columns: updated, rows });
      return updated;
    });

    // Remove cells for the deleted column from all rows
    setRows(prev => prev.map(row => {
      const { [columnId]: _, ...remainingCells } = row.cells;
      return { ...row, cells: remainingCells };
    }));
  }, [columns.length, rows, onDataChange]);

  // Row operations
  const handleAddRow = useCallback(() => {
    const newRow: DatabaseRow = {
      id: `row_${uuidv4()}`,
      blockId: '',
      cells: columns.reduce((acc, col) => ({
        ...acc,
        [col.id]: col.type === 'select' ? col.options?.[0]?.id || '' : ''
      }), {}),
      position: rows.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setRows(prev => {
      const updated = [...prev, newRow];
      onDataChange?.({ columns, rows: updated });
      return updated;
    });
  }, [columns, rows, onDataChange]);

  const handleUpdateRow = useCallback((rowId: string, updates: Record<string, any>) => {
    setRows(prev => {
      const updated = prev.map(row => 
        row.id === rowId 
          ? { 
              ...row, 
              cells: { ...row.cells, ...updates },
              updatedAt: new Date().toISOString()
            } 
          : row
      );
      onDataChange?.({ columns, rows: updated });
      return updated;
    });
  }, [columns, onDataChange]);

  const handleDeleteRow = useCallback((rowId: string) => {
    if (rows.length <= 1) return; // Keep at least one row
    
    setRows(prev => {
      const updated = prev.filter(row => row.id !== rowId);
      onDataChange?.({ columns, rows: updated });
      return updated;
    });
  }, [columns, rows.length, onDataChange]);

  return (
    <div className={cn("w-full border border-gray-200 rounded-lg overflow-hidden", className)}>
      {/* Simple header */}
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            Database ({rows.length} rows × {columns.length} columns)
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleAddColumn}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
            >
              + Column
            </button>
            <button
              onClick={handleAddRow}
              className="px-2 py-1 text-xs bg-blue-500 text-white hover:bg-blue-600 rounded"
            >
              + Row
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map(column => (
                <th
                  key={column.id}
                  className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"
                  style={{ width: column.width }}
                >
                  <div className="flex items-center justify-between group">
                    <span>{column.name}</span>
                    <button
                      onClick={() => handleDeleteColumn(column.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 ml-2"
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map(row => (
              <tr key={row.id} className="hover:bg-gray-50 group">
                {columns.map(column => (
                  <td key={column.id} className="px-4 py-2">
                    {column.type === 'select' ? (
                      <select
                        value={row.cells?.[column.id] || ''}
                        onChange={(e) => handleUpdateRow(row.id, { [column.id]: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {column.options?.map(option => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={row.cells?.[column.id] || ''}
                        onChange={(e) => handleUpdateRow(row.id, { [column.id]: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-transparent hover:border-gray-200 focus:border-blue-500 rounded focus:outline-none"
                        placeholder={`Enter ${column.name.toLowerCase()}...`}
                      />
                    )}
                  </td>
                ))}
                <td className="px-2">
                  <button
                    onClick={() => handleDeleteRow(row.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}