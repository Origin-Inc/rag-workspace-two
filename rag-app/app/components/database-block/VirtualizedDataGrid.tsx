import { memo, useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { VariableSizeGrid as Grid, GridChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { areEqual } from 'react-window';
import type { DatabaseColumn, DatabaseRow } from '~/types/database-block';
import { cn } from '~/utils/cn';

// Constants for optimization
const OVERSCAN_ROW_COUNT = 5;
const OVERSCAN_COLUMN_COUNT = 2;
const DEFAULT_ROW_HEIGHT = 40;
const DEFAULT_COLUMN_WIDTH = 150;
const HEADER_HEIGHT = 40;
const SELECTION_COLUMN_WIDTH = 50;

// Cache for row heights and column widths
class SizeCache {
  private rowHeights = new Map<number, number>();
  private columnWidths = new Map<number, number>();
  private defaultRowHeight: number;
  private defaultColumnWidth: number;

  constructor(defaultRowHeight = DEFAULT_ROW_HEIGHT, defaultColumnWidth = DEFAULT_COLUMN_WIDTH) {
    this.defaultRowHeight = defaultRowHeight;
    this.defaultColumnWidth = defaultColumnWidth;
  }

  getRowHeight(index: number): number {
    return this.rowHeights.get(index) ?? this.defaultRowHeight;
  }

  setRowHeight(index: number, height: number) {
    if (height !== this.defaultRowHeight) {
      this.rowHeights.set(index, height);
    }
  }

  getColumnWidth(index: number): number {
    return this.columnWidths.get(index) ?? this.defaultColumnWidth;
  }

  setColumnWidth(index: number, width: number) {
    if (width !== this.defaultColumnWidth) {
      this.columnWidths.set(index, width);
    }
  }

  clear() {
    this.rowHeights.clear();
    this.columnWidths.clear();
  }
}

// Memoized cell component
const Cell = memo<GridChildComponentProps>(({ 
  columnIndex, 
  rowIndex, 
  style,
  data 
}) => {
  const {
    columns,
    rows,
    selectedRows,
    editingCell,
    onCellEdit,
    onCellClick,
    onCellDoubleClick,
    onSelectRow,
    getCellValue,
    formatCellValue
  } = data;

  const [localValue, setLocalValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine if this is a header cell
  const isHeader = rowIndex === 0;
  const isSelectionColumn = columnIndex === 0;
  
  // Get actual data indices (accounting for header and selection column)
  const dataRowIndex = rowIndex - 1;
  const dataColumnIndex = columnIndex - 1;
  
  const row = !isHeader && dataRowIndex >= 0 ? rows[dataRowIndex] : null;
  const column = !isSelectionColumn && dataColumnIndex >= 0 ? columns[dataColumnIndex] : null;
  
  const isEditing = editingCell?.row === dataRowIndex && editingCell?.column === dataColumnIndex;
  const isSelected = row && selectedRows.has(row.id);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleEdit = useCallback(() => {
    if (!row || !column) return;
    const value = getCellValue(row, column);
    setLocalValue(String(value ?? ''));
    onCellDoubleClick(dataRowIndex, dataColumnIndex);
  }, [row, column, dataRowIndex, dataColumnIndex, getCellValue, onCellDoubleClick]);

  const handleSave = useCallback(() => {
    if (!row || !column) return;
    onCellEdit(row.id, column.id, localValue);
  }, [row, column, localValue, onCellEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onCellEdit(null, null, null);
    }
  }, [handleSave, onCellEdit]);

  // Render header cell
  if (isHeader) {
    if (isSelectionColumn) {
      return (
        <div 
          style={style} 
          className="flex items-center justify-center border-b border-r bg-gray-50 font-medium sticky top-0 z-10"
        >
          <input
            type="checkbox"
            checked={selectedRows.size === rows.length && rows.length > 0}
            onChange={(e) => data.onSelectAllRows(e.target.checked)}
            className="w-4 h-4"
          />
        </div>
      );
    }
    
    return (
      <div 
        style={style} 
        className="flex items-center px-3 border-b border-r bg-gray-50 font-medium sticky top-0 z-10"
      >
        {column?.name || ''}
      </div>
    );
  }

  // Render selection column
  if (isSelectionColumn) {
    return (
      <div 
        style={style} 
        className="flex items-center justify-center border-b border-r sticky left-0 z-5 bg-white"
      >
        {row && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelectRow(row.id, e.target.checked)}
            className="w-4 h-4"
          />
        )}
      </div>
    );
  }

  // Render data cell
  if (!row || !column) {
    return <div style={style} className="border-b border-r" />;
  }

  const value = getCellValue(row, column);
  const formattedValue = formatCellValue(value, column);

  return (
    <div 
      style={style}
      className={cn(
        "border-b border-r overflow-hidden",
        isSelected && "bg-blue-50",
        isEditing && "ring-2 ring-blue-500 ring-inset"
      )}
      onClick={() => onCellClick(dataRowIndex, dataColumnIndex)}
      onDoubleClick={handleEdit}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full h-full px-2 outline-none bg-white"
        />
      ) : (
        <div className="px-2 py-2 truncate">
          {formattedValue}
        </div>
      )}
    </div>
  );
}, areEqual);

Cell.displayName = 'Cell';

interface VirtualizedDataGridProps {
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
  selectedRows: Set<string>;
  onUpdateRow: (rowId: string, updates: Partial<DatabaseRow['cells']>) => void;
  onSelectRow: (rowId: string, isSelected: boolean) => void;
  onSelectAllRows: (isSelected: boolean) => void;
  className?: string;
}

export const VirtualizedDataGrid = memo(function VirtualizedDataGrid({
  columns,
  rows,
  selectedRows,
  onUpdateRow,
  onSelectRow,
  onSelectAllRows,
  className
}: VirtualizedDataGridProps) {
  const gridRef = useRef<Grid>(null);
  const sizeCache = useRef(new SizeCache());
  const [editingCell, setEditingCell] = useState<{ row: number; column: number } | null>(null);

  // Calculate column widths (including selection column)
  const columnWidths = useMemo(() => {
    const widths = [SELECTION_COLUMN_WIDTH];
    columns.forEach(col => {
      widths.push(col.width || DEFAULT_COLUMN_WIDTH);
    });
    return widths;
  }, [columns]);

  const getColumnWidth = useCallback((index: number) => {
    if (index === 0) return SELECTION_COLUMN_WIDTH;
    return columnWidths[index] || DEFAULT_COLUMN_WIDTH;
  }, [columnWidths]);

  const getRowHeight = useCallback((index: number) => {
    if (index === 0) return HEADER_HEIGHT;
    return sizeCache.current.getRowHeight(index);
  }, []);

  const getCellValue = useCallback((row: DatabaseRow, column: DatabaseColumn) => {
    return row.cells[column.id];
  }, []);

  const formatCellValue = useCallback((value: any, column: DatabaseColumn): string => {
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
  }, []);

  const handleCellEdit = useCallback((rowId: string | null, columnId: string | null, value: string | null) => {
    if (!rowId || !columnId || value === null) {
      setEditingCell(null);
      return;
    }
    
    onUpdateRow(rowId, { [columnId]: value });
    setEditingCell(null);
  }, [onUpdateRow]);

  const handleCellClick = useCallback((row: number, column: number) => {
    // Handle cell click for selection or other purposes
  }, []);

  const handleCellDoubleClick = useCallback((row: number, column: number) => {
    setEditingCell({ row, column });
  }, []);

  // Data passed to cells
  const itemData = useMemo(() => ({
    columns,
    rows,
    selectedRows,
    editingCell,
    onCellEdit: handleCellEdit,
    onCellClick: handleCellClick,
    onCellDoubleClick: handleCellDoubleClick,
    onSelectRow,
    onSelectAllRows,
    getCellValue,
    formatCellValue
  }), [
    columns,
    rows,
    selectedRows,
    editingCell,
    handleCellEdit,
    handleCellClick,
    handleCellDoubleClick,
    onSelectRow,
    onSelectAllRows,
    getCellValue,
    formatCellValue
  ]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!editingCell) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || 
            e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          // Implement keyboard navigation
        }
      }
      
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        onSelectAllRows(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingCell, onSelectAllRows]);

  // Reset grid cache when data changes significantly
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.resetAfterIndices({
        columnIndex: 0,
        rowIndex: 0
      });
    }
  }, [columns.length, rows.length]);

  return (
    <div className={cn("h-full w-full bg-white", className)}>
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
            overscanRowCount={OVERSCAN_ROW_COUNT}
            overscanColumnCount={OVERSCAN_COLUMN_COUNT}
            itemData={itemData}
            estimatedColumnWidth={DEFAULT_COLUMN_WIDTH}
            estimatedRowHeight={DEFAULT_ROW_HEIGHT}
          >
            {Cell}
          </Grid>
        )}
      </AutoSizer>
    </div>
  );
});