import { memo, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import * as React from 'react';
import { VariableSizeGrid as Grid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import type {
  DatabaseBlock,
  DatabaseColumn,
  DatabaseRow
} from '~/types/database-block';
import { cn } from '~/utils/cn';

interface VirtualDatabaseTableProps {
  databaseBlock: DatabaseBlock | null;
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
  selectedRows: Set<string>;
  viewSettings: any;
  onUpdateRow: (rowId: string, updates: Partial<DatabaseRow['cells']>) => void;
  onDeleteRows: (rowIds: string[]) => void;
  onUpdateColumn: (columnId: string, updates: Partial<DatabaseColumn>) => void;
  onDeleteColumn: (columnId: string) => void;
  onSelectRow: (rowId: string, isSelected: boolean) => void;
  onSelectAllRows: (isSelected: boolean) => void;
  onClearSelection: () => void;
  onUpdateViewSettings: (settings: any) => void;
}

// Cell renderer component
const Cell = memo(({ 
  columnIndex, 
  rowIndex, 
  style,
  data 
}: {
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
  data: any;
}) => {
  const { columns, rows, selectedRows, onSelectRow, onUpdateRow } = data;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  
  // Header row
  if (rowIndex === 0) {
    if (columnIndex === 0) {
      // Select all checkbox
      return (
        <div style={style} className="flex items-center justify-center border-b border-r bg-gray-50 font-medium">
          <input
            type="checkbox"
            checked={selectedRows.size === rows.length && rows.length > 0}
            onChange={(e) => data.onSelectAllRows(e.target.checked)}
            className="w-4 h-4"
          />
        </div>
      );
    }
    
    const column = columns[columnIndex - 1];
    return (
      <div style={style} className="flex items-center px-2 border-b border-r bg-gray-50 font-medium">
        {column?.name || ''}
      </div>
    );
  }
  
  const row = rows[rowIndex - 1];
  if (!row) return <div style={style} />;
  
  // Selection column
  if (columnIndex === 0) {
    return (
      <div style={style} className="flex items-center justify-center border-b border-r">
        <input
          type="checkbox"
          checked={selectedRows.has(row.id)}
          onChange={(e) => onSelectRow(row.id, e.target.checked)}
          className="w-4 h-4"
        />
      </div>
    );
  }
  
  const column = columns[columnIndex - 1];
  const value = row.cells[column.id];
  
  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditValue(String(value || ''));
  };
  
  const handleSave = () => {
    onUpdateRow(row.id, { [column.id]: editValue });
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };
  
  return (
    <div 
      style={style} 
      className={cn(
        "flex items-center px-2 border-b border-r",
        isEditing && "p-0"
      )}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full h-full px-2 outline-none"
          autoFocus
        />
      ) : (
        <span className="truncate">
          {formatCellValue(value, column)}
        </span>
      )}
    </div>
  );
});

Cell.displayName = 'Cell';

export const VirtualDatabaseTable = memo(function VirtualDatabaseTable({
  databaseBlock,
  columns,
  rows,
  selectedRows,
  viewSettings,
  onUpdateRow,
  onDeleteRows,
  onUpdateColumn,
  onDeleteColumn,
  onSelectRow,
  onSelectAllRows,
  onClearSelection,
  onUpdateViewSettings
}: VirtualDatabaseTableProps) {
  const gridRef = useRef<Grid>(null);
  
  // Column widths (including selection column)
  const columnWidths = useMemo(() => {
    const widths = [50]; // Selection column
    columns.forEach(col => {
      widths.push(col.width || 150);
    });
    return widths;
  }, [columns]);
  
  // Row height based on settings
  const rowHeight = useMemo(() => {
    switch (viewSettings?.rowHeight) {
      case 'compact': return 32;
      case 'comfortable': return 48;
      default: return 40; // normal
    }
  }, [viewSettings?.rowHeight]);
  
  const getColumnWidth = useCallback((index: number) => {
    return columnWidths[index] || 150;
  }, [columnWidths]);
  
  const getRowHeight = useCallback((index: number) => {
    return index === 0 ? 40 : rowHeight; // Header is always 40px
  }, [rowHeight]);
  
  // Data passed to cells
  const itemData = useMemo(() => ({
    columns,
    rows,
    selectedRows,
    onSelectRow,
    onSelectAllRows,
    onUpdateRow
  }), [columns, rows, selectedRows, onSelectRow, onSelectAllRows, onUpdateRow]);
  
  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault();
      onSelectAllRows(true);
    } else if (e.key === 'Escape') {
      onClearSelection();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedRows.size > 0) {
        onDeleteRows(Array.from(selectedRows));
      }
    }
  }, [selectedRows, onSelectAllRows, onClearSelection, onDeleteRows]);
  
  // Attach keyboard listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  
  return (
    <div className="h-full w-full">
      <AutoSizer>
        {({ height, width }) => (
          <Grid
            ref={gridRef}
            className="scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100"
            columnCount={columns.length + 1} // +1 for selection column
            columnWidth={getColumnWidth}
            height={height}
            rowCount={rows.length + 1} // +1 for header
            rowHeight={getRowHeight}
            width={width}
            itemData={itemData}
            overscanRowCount={10}
            overscanColumnCount={3}
          >
            {Cell}
          </Grid>
        )}
      </AutoSizer>
    </div>
  );
});

// Helper function to format cell values
function formatCellValue(value: any, column: DatabaseColumn): string {
  if (value === null || value === undefined) return '';
  
  switch (column.type) {
    case 'checkbox':
      return value ? '✓' : '';
    
    case 'date':
      return new Date(value).toLocaleDateString();
    
    case 'datetime':
      return new Date(value).toLocaleString();
    
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value);
    
    case 'percent':
      return `${value}%`;
    
    case 'rating':
      return '★'.repeat(Math.floor(value)) + '☆'.repeat(5 - Math.floor(value));
    
    case 'select':
      if (column.options) {
        const option = column.options.find(opt => opt.id === value);
        return option?.label || String(value);
      }
      return String(value);
    
    case 'multi_select':
      if (column.options && Array.isArray(value)) {
        return value
          .map(v => {
            const option = column.options!.find(opt => opt.id === v);
            return option?.label || v;
          })
          .join(', ');
      }
      return String(value);
    
    default:
      return String(value);
  }
}