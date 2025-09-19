import { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseColumn } from '~/types/database-block';
import { cn } from '~/utils/cn';

// Local type for simplified row structure used in this wrapper
interface SimpleRow {
  id: string;
  blockId: string;
  cells: Record<string, any>;
  position: number;
  createdAt: string;
  updatedAt: string;
}

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
  // Initialize database name
  const [databaseName, setDatabaseName] = useState<string>(
    initialData?.name || 'Untitled Database'
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  
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

  const [rows, setRows] = useState<SimpleRow[]>(() => {
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
    onDataChange?.({ name: databaseName, columns, rows });
  }, [databaseName, columns, rows, onDataChange]);

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
    const newRow: SimpleRow = {
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
    <div className={cn("w-full rounded-lg overflow-hidden", className)}>
      {/* Simple header */}
      <div className="bg-gray-50 px-2 py-2 dark:bg-dark-primary">
        <div className="flex items-center justify-between">
          {isEditingName ? (
            <input
              type="text"
              value={databaseName}
              onChange={(e) => setDatabaseName(e.target.value)}
              onBlur={() => {
                setIsEditingName(false);
                handleDataUpdate();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setIsEditingName(false);
                  handleDataUpdate();
                }
                if (e.key === 'Escape') {
                  setDatabaseName(initialData?.name || 'Untitled Database');
                  setIsEditingName(false);
                }
              }}
              className="text-xl font-bold bg-transparent border-b-2 border-blue-500 outline-none dark:text-white"
              autoFocus
            />
          ) : (
            <h2
              className="text-xl font-bold text-gray-700 dark:text-white cursor-pointer hover:text-gray-900 dark:hover:text-gray-100"
              onClick={() => setIsEditingName(true)}
              title="Click to edit database name"
            >
              {databaseName}
            </h2>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAddColumn}
              className="px-2 py-1 text-xs bg-blue-500 text-white hover:bg-blue-600 rounded"
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
          <thead className="bg-gray-50 border-b border-gray-200 dark:border-dark-primary dark:bg-dark-primary">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  className="px-2 py-2 text-left text-xs font-medium text-gray-700 dark:text-white tracking-wider"
                  style={{ width: column.width }}
                >
                  <div className="flex items-center justify-between group">
                    {editingColumnId === column.id ? (
                      <input
                        type="text"
                        value={column.name}
                        onChange={(e) => handleUpdateColumn(column.id, { name: e.target.value })}
                        onBlur={() => {
                          setEditingColumnId(null);
                          handleDataUpdate();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setEditingColumnId(null);
                            handleDataUpdate();
                          }
                          if (e.key === 'Escape') {
                            handleUpdateColumn(column.id, { name: column.name });
                            setEditingColumnId(null);
                          }
                        }}
                        className="bg-transparent border-b border-blue-500 outline-none uppercase text-xs"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span 
                        className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-300"
                        onClick={() => setEditingColumnId(column.id)}
                        title="Click to edit column name"
                      >
                        {column.name}
                      </span>
                    )}
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
          <tbody className="bg-white dark:bg-dark-primary">
            {rows.map(row => (
              <tr key={row.id} className="hover:bg-gray-50 group border-b border-gray-200 dark:border-dark-primary">
                {columns.map((column, index) => (
                  <td
                    key={column.id}
                    className={`px-2 py-2 dark:bg-dark-primary ${index !== columns.length - 1 ? 'border-r border-gray-200 dark:border-dark-primary' : ''}`}
                  >
                    {column.type === 'select' ? (
                      <select
                        value={row.cells?.[column.id] || ''}
                        onChange={(e) => handleUpdateRow(row.id, { [column.id]: e.target.value })}
                        className="w-full text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="w-full px-2 py-1 text-sm font-semibold rounded focus:outline-none dark:bg-dark-primary cursor-pointer"
                        /*placeholder={`Enter ${column.name.toLowerCase()}...`}*/
                      />
                    )}
                  </td>
                ))}
                <td className="px-2 dark:bg-dark-primary">
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