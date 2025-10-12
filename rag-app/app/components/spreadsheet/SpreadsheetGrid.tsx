/**
 * SpreadsheetGrid Component
 *
 * High-performance spreadsheet grid using Glide Data Grid.
 * Supports 100M+ rows at 60fps with canvas-based rendering.
 */

import { useCallback, useMemo, useState } from 'react';
import DataEditor, {
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
  EditableGridCell,
  DataEditorProps,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

export interface SpreadsheetColumn {
  id: string;
  name: string;
  width?: number;
  type?: 'text' | 'number' | 'boolean' | 'date' | 'formula';
}

export interface SpreadsheetRow {
  [key: string]: any;
}

export interface SpreadsheetGridProps {
  columns: SpreadsheetColumn[];
  rows: SpreadsheetRow[];
  totalRows: number;
  onCellEdit?: (row: number, col: number, value: any) => void;
  onCellSelected?: (cell: { row: number; col: number } | null) => void;
  onLoadPage?: (page: number, pageSize: number) => Promise<SpreadsheetRow[]>;
  onColumnResize?: (columnId: string, newWidth: number) => void;
  onColumnMove?: (fromIndex: number, toIndex: number) => void;
  onRowsSelected?: (selectedRows: Set<number>) => void;
  className?: string;
  height?: number;
  pageSize?: number;
}

/**
 * Convert spreadsheet cell value to Glide Data Grid cell
 */
function getCellContent(
  row: SpreadsheetRow,
  column: SpreadsheetColumn
): GridCell {
  const value = row[column.id];

  if (value === null || value === undefined) {
    return {
      kind: GridCellKind.Text,
      data: '',
      displayData: '',
      allowOverlay: true,
    };
  }

  // Handle formulas
  if (typeof value === 'string' && value.startsWith('=')) {
    return {
      kind: GridCellKind.Text,
      data: value,
      displayData: value,
      allowOverlay: true,
      contentAlign: 'left',
    };
  }

  // Handle by column type
  switch (column.type) {
    case 'number':
      return {
        kind: GridCellKind.Number,
        data: typeof value === 'number' ? value : parseFloat(value) || 0,
        displayData: String(value),
        allowOverlay: true,
      };

    case 'boolean':
      return {
        kind: GridCellKind.Boolean,
        data: Boolean(value),
        allowOverlay: false,
      };

    case 'date':
      return {
        kind: GridCellKind.Text,
        data: value instanceof Date ? value.toISOString() : String(value),
        displayData: value instanceof Date ? value.toLocaleDateString() : String(value),
        allowOverlay: true,
      };

    case 'text':
    default:
      return {
        kind: GridCellKind.Text,
        data: String(value),
        displayData: String(value),
        allowOverlay: true,
      };
  }
}

/**
 * SpreadsheetGrid Component
 */
export function SpreadsheetGrid({
  columns,
  rows,
  totalRows,
  onCellEdit,
  onCellSelected,
  onLoadPage,
  onColumnResize,
  onColumnMove,
  onRowsSelected,
  className,
  height = 600,
  pageSize = 100,
}: SpreadsheetGridProps) {
  const [selection, setSelection] = useState<{
    rows: Set<number>;
    columns: Set<number>;
  }>({ rows: new Set(), columns: new Set() });

  // Convert columns to Glide Data Grid format
  const gridColumns: GridColumn[] = useMemo(() => {
    return columns.map((col) => ({
      id: col.id,
      title: col.name,
      width: col.width || 150,
    }));
  }, [columns]);

  // Get cell content callback
  const getCellContentCallback = useCallback(
    ([col, row]: Item): GridCell => {
      const column = columns[col];
      const rowData = rows[row];

      if (!column || !rowData) {
        return {
          kind: GridCellKind.Loading,
          allowOverlay: false,
        };
      }

      return getCellContent(rowData, column);
    },
    [columns, rows]
  );

  // Handle cell edits
  const onCellEdited = useCallback(
    ([col, row]: Item, newValue: EditableGridCell): void => {
      if (!onCellEdit) return;

      const column = columns[col];
      if (!column) return;

      let value: any;

      switch (newValue.kind) {
        case GridCellKind.Text:
          value = newValue.data;
          break;
        case GridCellKind.Number:
          value = newValue.data;
          break;
        case GridCellKind.Boolean:
          value = newValue.data;
          break;
        default:
          value = null;
      }

      onCellEdit(row, col, value);
    },
    [columns, onCellEdit]
  );

  // Handle column resize
  const onColumnResized = useCallback(
    (column: GridColumn, newWidth: number) => {
      if (!onColumnResize) return;
      onColumnResize(column.id, newWidth);
    },
    [onColumnResize]
  );

  // Handle row and cell selection
  const onSelectionChanged = useCallback(
    (gridSelection: DataEditorProps['gridSelection']) => {
      if (!gridSelection) return;

      const selectedRows = new Set<number>();

      // Handle row selection
      if (gridSelection.rows) {
        gridSelection.rows.forEach((rowIndex) => {
          selectedRows.add(rowIndex);
        });
      }

      // Handle single cell selection
      if (gridSelection.current && onCellSelected) {
        const cell = gridSelection.current.cell;
        if (cell) {
          onCellSelected({ row: cell[1], col: cell[0] });
        }
      }

      setSelection({
        rows: selectedRows,
        columns: new Set(gridSelection.columns || []),
      });

      if (onRowsSelected) {
        onRowsSelected(selectedRows);
      }
    },
    [onRowsSelected, onCellSelected]
  );

  // Handle infinite scrolling
  const onVisibleRegionChanged = useCallback(
    (range: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => {
      if (!onLoadPage) return;

      // Calculate which page we need based on visible region
      const startRow = range.y;
      const endRow = range.y + range.height;
      const startPage = Math.floor(startRow / pageSize);
      const endPage = Math.floor(endRow / pageSize);

      // Load pages that are visible or near visible area
      for (let page = startPage; page <= endPage; page++) {
        // Check if page is already loaded
        const pageStartRow = page * pageSize;
        const pageEndRow = pageStartRow + pageSize;
        const hasPageData = rows.slice(pageStartRow, pageEndRow).every((row) => row !== undefined);

        if (!hasPageData) {
          onLoadPage(page, pageSize);
        }
      }
    },
    [onLoadPage, pageSize, rows]
  );

  return (
    <div className={className}>
      <DataEditor
        // Core props
        columns={gridColumns}
        rows={totalRows}
        getCellContent={getCellContentCallback}
        onCellEdited={onCellEdited}

        // Layout
        width="100%"
        height={height}
        rowMarkers="both"

        // Features
        smoothScrollX={true}
        smoothScrollY={true}
        freezeColumns={0}

        // Selection
        gridSelection={selection.rows.size > 0 || selection.columns.size > 0 ? {
          rows: Array.from(selection.rows),
          columns: Array.from(selection.columns),
        } : undefined}
        onGridSelectionChange={onSelectionChanged}
        rangeSelect="rect"
        columnSelect="multi"
        rowSelect="multi"

        // Column operations
        onColumnResize={onColumnResized}
        onColumnMoved={onColumnMove}

        // Performance
        experimental={{
          scrollingDelay: 0,
          isSubstrateTransparent: false,
        }}

        // Infinite scrolling
        onVisibleRegionChanged={onVisibleRegionChanged}

        // Theme
        theme={{
          accentColor: '#3b82f6',
          accentLight: '#dbeafe',
          bgCell: '#ffffff',
          bgCellMedium: '#f9fafb',
          bgHeader: '#f3f4f6',
          bgHeaderHasFocus: '#e5e7eb',
          bgHeaderHovered: '#e5e7eb',
          borderColor: '#e5e7eb',
          fontFamily: 'Inter, system-ui, sans-serif',
          headerFontStyle: '600 13px',
          baseFontStyle: '13px',
          textDark: '#111827',
          textMedium: '#6b7280',
          textLight: '#9ca3af',
          textBubble: '#ffffff',
        }}
      />
    </div>
  );
}
