import React, { useCallback, useMemo, useRef, useState, memo } from 'react';
import { VariableSizeGrid as Grid, GridChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { DatabaseRow, DatabaseColumn } from '~/types/database-block';
import { cn } from '~/utils/cn';
import { ChevronDown, ChevronUp, Filter, MoreVertical } from 'lucide-react';

interface ReactWindowTableProps {
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
  onCellEdit?: (rowId: string, columnId: string, value: any) => void;
  onSort?: (columnId: string, direction: 'asc' | 'desc') => void;
  onFilter?: (columnId: string, value: string) => void;
  selectedRows?: Set<string>;
  onRowSelect?: (rowId: string, selected: boolean) => void;
  onRowsSelect?: (rowIds: string[], selected: boolean) => void;
  loading?: boolean;
}

// Cell component with memoization for performance
const Cell = memo(({ 
  columnIndex, 
  rowIndex, 
  style,
  data 
}: GridChildComponentProps<{
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
  onCellEdit?: (rowId: string, columnId: string, value: any) => void;
  selectedRows?: Set<string>;
  onRowSelect?: (rowId: string, selected: boolean) => void;
}>) => {
  const { columns, rows, onCellEdit, selectedRows, onRowSelect } = data;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  
  // Header row
  if (rowIndex === 0) {
    const column = columns[columnIndex];
    
    // Checkbox column
    if (columnIndex === 0) {
      return (
        <div 
          style={style} 
          className="flex items-center justify-center border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-medium"
        >
          <input
            type="checkbox"
            className="rounded border-gray-300 dark:border-gray-600"
            onChange={(e) => {
              if (data.onRowSelect) {
                rows.forEach(row => {
                  data.onRowSelect(row.id, e.target.checked);
                });
              }
            }}
          />
        </div>
      );
    }
    
    const actualColumn = columns[columnIndex - 1];
    if (!actualColumn) return null;
    
    return (
      <div 
        style={style} 
        className="flex items-center px-3 py-2 border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-medium text-sm"
      >
        <span className="truncate flex-1">{actualColumn.name}</span>
        <button className="ml-2 text-gray-400 hover:text-gray-600">
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    );
  }
  
  // Data rows
  const row = rows[rowIndex - 1];
  if (!row) return null;
  
  // Checkbox column
  if (columnIndex === 0) {
    return (
      <div 
        style={style} 
        className="flex items-center justify-center border-b border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
      >
        <input
          type="checkbox"
          className="rounded border-gray-300 dark:border-gray-600"
          checked={selectedRows?.has(row.id) || false}
          onChange={(e) => onRowSelect?.(row.id, e.target.checked)}
        />
      </div>
    );
  }
  
  const column = columns[columnIndex - 1];
  if (!column) return null;
  
  const cellValue = row.data[column.id];
  
  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditValue(cellValue?.toString() || '');
  };
  
  const handleSave = () => {
    onCellEdit?.(row.id, column.id, editValue);
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
        "border-b border-r border-gray-200 dark:border-gray-700",
        "bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800",
        "transition-colors duration-75"
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
          className="w-full h-full px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 bg-transparent"
          autoFocus
        />
      ) : (
        <div className="px-3 py-2 text-sm truncate">
          {renderCellValue(cellValue, column.type)}
        </div>
      )}
    </div>
  );
}, areEqual);

Cell.displayName = 'Cell';

// Custom comparison function for React.memo
function areEqual(prevProps: any, nextProps: any) {
  // Only re-render if specific props change
  return (
    prevProps.columnIndex === nextProps.columnIndex &&
    prevProps.rowIndex === nextProps.rowIndex &&
    prevProps.style === nextProps.style &&
    prevProps.data === nextProps.data
  );
}

// Render cell value based on type
function renderCellValue(value: any, type: string) {
  if (value === null || value === undefined) {
    return <span className="text-gray-400">Empty</span>;
  }
  
  switch (type) {
    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          className="rounded border-gray-300"
          readOnly
        />
      );
    case 'date':
      return new Date(value).toLocaleDateString();
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : value;
    case 'url':
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
          {value}
        </a>
      );
    case 'email':
      return (
        <a href={`mailto:${value}`} className="text-blue-600 hover:underline">
          {value}
        </a>
      );
    case 'select':
    case 'multi-select':
      return Array.isArray(value) ? value.join(', ') : value;
    default:
      return String(value);
  }
}

export function ReactWindowTable({
  columns,
  rows,
  onCellEdit,
  onSort,
  onFilter,
  selectedRows,
  onRowSelect,
  onRowsSelect,
  loading
}: ReactWindowTableProps) {
  const gridRef = useRef<Grid>(null);
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const [rowHeights, setRowHeights] = useState<number[]>([]);
  
  // Calculate column widths (with checkbox column)
  const getColumnWidth = useCallback((index: number) => {
    if (index === 0) return 50; // Checkbox column
    return columnWidths[index] || 150; // Default width
  }, [columnWidths]);
  
  // Calculate row heights
  const getRowHeight = useCallback((index: number) => {
    if (index === 0) return 40; // Header row
    return rowHeights[index] || 36; // Default row height
  }, [rowHeights]);
  
  // Memoize grid data
  const itemData = useMemo(() => ({
    columns,
    rows,
    onCellEdit,
    selectedRows,
    onRowSelect
  }), [columns, rows, onCellEdit, selectedRows, onRowSelect]);
  
  // Reset scroll position when data changes significantly
  const resetScrollPosition = useCallback(() => {
    if (gridRef.current) {
      gridRef.current.scrollTo({ scrollLeft: 0, scrollTop: 0 });
    }
  }, []);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }
  
  return (
    <div className="w-full h-full min-h-[600px] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <AutoSizer>
        {({ height, width }) => (
          <Grid
            ref={gridRef}
            columnCount={columns.length + 1} // +1 for checkbox column
            columnWidth={getColumnWidth}
            height={height}
            rowCount={rows.length + 1} // +1 for header row
            rowHeight={getRowHeight}
            width={width}
            itemData={itemData}
            overscanRowCount={5}
            overscanColumnCount={2}
            className="scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600"
          >
            {Cell}
          </Grid>
        )}
      </AutoSizer>
    </div>
  );
}

// Export optimized version for large datasets
export function OptimizedReactWindowTable(props: ReactWindowTableProps) {
  // Add performance monitoring
  const renderCount = useRef(0);
  
  React.useEffect(() => {
    renderCount.current++;
    if (renderCount.current % 100 === 0) {
      console.log(`[ReactWindowTable] Rendered ${renderCount.current} times`);
    }
  });
  
  return <ReactWindowTable {...props} />;
}