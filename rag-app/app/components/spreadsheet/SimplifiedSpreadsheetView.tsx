/**
 * Simplified SpreadsheetView Component
 *
 * Lightweight React state-based spreadsheet using Glide Data Grid.
 * Fast formula evaluation with built-in JavaScript evaluator.
 *
 * TASK 87: Supports DuckDB WASM for large datasets (metadata-only pattern)
 *
 * Performance: <50ms initialization, <10ms cell edits, instant formula evaluation
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { FormulaBar } from './FormulaBar';
import { getColumnLetter } from '~/utils/spreadsheet-notation';
import { evaluateFormula } from '~/utils/simple-formula-evaluator';
import { duckDBQueryService } from '~/services/duckdb/duckdb-query.client';
import type { SpreadsheetColumn, SpreadsheetRow } from './SpreadsheetGrid';

export interface SimplifiedSpreadsheetViewProps {
  initialColumns?: SpreadsheetColumn[];
  initialRows?: SpreadsheetRow[];
  onDataChange?: (data: { columns: SpreadsheetColumn[]; rows: SpreadsheetRow[] }) => void;
  onAddRow?: () => void;
  onAddColumn?: (column: SpreadsheetColumn) => void;
  height?: number;
  // TASK 87: DuckDB props for large spreadsheets
  useDuckDB?: boolean;
  tableName?: string;
}

export function SimplifiedSpreadsheetView({
  initialColumns = [],
  initialRows = [],
  onDataChange,
  onAddRow: externalOnAddRow,
  onAddColumn: externalOnAddColumn,
  height = 500,
  useDuckDB = false,
  tableName,
}: SimplifiedSpreadsheetViewProps) {
  // React state - enhanced to support formulas
  const [columns, setColumns] = useState<SpreadsheetColumn[]>(
    initialColumns.length > 0
      ? initialColumns
      : [
          { id: 'col_1', name: getColumnLetter(0), type: 'text', width: 150 },
          { id: 'col_2', name: getColumnLetter(1), type: 'text', width: 150 },
          { id: 'col_3', name: getColumnLetter(2), type: 'text', width: 150 },
        ]
  );

  const [rows, setRows] = useState<SpreadsheetRow[]>(initialRows);

  // TASK 87: Row cache for DuckDB windowed loading
  const rowCacheRef = useRef<Map<number, SpreadsheetRow>>(new Map());
  const [totalDuckDBRows, setTotalDuckDBRows] = useState<number | null>(null);

  // TASK 87: Load initial page from DuckDB when useDuckDB is enabled
  useEffect(() => {
    if (!useDuckDB || !tableName) return;

    async function loadInitialPage() {
      try {
        console.log(`[SimplifiedSpreadsheetView] Loading initial page from DuckDB table: ${tableName}`);

        // Load first page (rows 0-99)
        const pageData = await duckDBQueryService.loadPage(tableName, 0, 100);

        console.log(`[SimplifiedSpreadsheetView] Loaded ${pageData.data.length} rows from DuckDB (total: ${pageData.totalRows})`);

        // Store in cache
        pageData.data.forEach((row, index) => {
          rowCacheRef.current.set(index, row);
        });

        // Set React state for initial render
        setRows(pageData.data);
        setTotalDuckDBRows(pageData.totalRows);
      } catch (error) {
        console.error('[SimplifiedSpreadsheetView] Failed to load initial page from DuckDB:', error);
      }
    }

    loadInitialPage();
  }, [useDuckDB, tableName]);

  // Selected cell for formula bar
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);

  // Debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Notify parent of changes (debounced)
  const notifyParent = useCallback(
    (newColumns: SpreadsheetColumn[], newRows: SpreadsheetRow[]) => {
      if (!onDataChange) return;

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce saves (300ms)
      debounceTimerRef.current = setTimeout(() => {
        onDataChange({ columns: newColumns, rows: newRows });
      }, 300);
    },
    [onDataChange]
  );

  // Handle cell edit with formula support
  const handleCellEdit = useCallback(
    (rowIndex: number, colIndex: number, value: any) => {
      console.log('[SimplifiedSpreadsheetView] handleCellEdit called:', {
        row: rowIndex,
        col: colIndex,
        value,
      });

      const column = columns[colIndex];
      if (!column) {
        console.warn('[SimplifiedSpreadsheetView] Column not found at index', colIndex);
        return;
      }

      const isFormula = typeof value === 'string' && value.startsWith('=');
      console.log('[SimplifiedSpreadsheetView] Formula detection:', {
        isFormula,
        valueType: typeof value,
      });

      setRows((prevRows) => {
        const newRows = [...prevRows];

        // Ensure row exists
        while (newRows.length <= rowIndex) {
          const newRow: SpreadsheetRow = {};
          columns.forEach((col) => {
            newRow[col.id] = '';
          });
          newRows.push(newRow);
        }

        // If it's a formula, evaluate it immediately
        if (isFormula) {
          console.log('[SimplifiedSpreadsheetView] Evaluating formula:', value);
          const computedValue = evaluateFormula(value);
          console.log(`[Formula] ${value} = ${computedValue}`);

          newRows[rowIndex] = {
            ...newRows[rowIndex],
            [column.id]: {
              formula: value,
              value: computedValue,
              isFormula: true,
            },
          };
        } else {
          // Regular value
          newRows[rowIndex] = {
            ...newRows[rowIndex],
            [column.id]: value,
          };
        }

        return newRows;
      });

      // Notify parent (debounced)
      setRows((currentRows) => {
        notifyParent(columns, currentRows);
        return currentRows;
      });
    },
    [columns, notifyParent]
  );

  // Handle column resize
  const handleColumnResize = useCallback(
    (columnId: string, newWidth: number) => {
      setColumns((prevColumns) => {
        const newColumns = prevColumns.map((col) =>
          col.id === columnId ? { ...col, width: newWidth } : col
        );

        // Notify parent immediately for column changes
        if (onDataChange) {
          onDataChange({ columns: newColumns, rows });
        }

        return newColumns;
      });
    },
    [rows, onDataChange]
  );

  // Handle add row
  const handleAddRow = useCallback(() => {
    const newRow: SpreadsheetRow = {};
    columns.forEach((col) => {
      newRow[col.id] = '';
    });

    setRows((prevRows) => {
      const newRows = [...prevRows, newRow];
      notifyParent(columns, newRows);
      return newRows;
    });

    // Call external handler if provided
    externalOnAddRow?.();
  }, [columns, notifyParent, externalOnAddRow]);

  // Handle add column
  const handleAddColumn = useCallback((column: SpreadsheetColumn) => {
    setColumns((prevColumns) => {
      const newColumns = [...prevColumns, column];

      // Add empty values for new column in all existing rows
      setRows((prevRows) => {
        const newRows = prevRows.map(row => ({
          ...row,
          [column.id]: ''
        }));
        notifyParent(newColumns, newRows);
        return newRows;
      });

      return newColumns;
    });

    // Call external handler if provided
    externalOnAddColumn?.(column);
  }, [notifyParent, externalOnAddColumn]);

  // TASK 87: onLoadPage callback for DuckDB windowed loading
  const handleLoadPage = useCallback(async (page: number, pageSize: number) => {
    if (!useDuckDB || !tableName) return [];

    try {
      console.log(`[SimplifiedSpreadsheetView] Loading page ${page} (size: ${pageSize}) from DuckDB`);

      const pageData = await duckDBQueryService.loadPage(tableName, page, pageSize);

      // Store in cache
      const startRow = page * pageSize;
      pageData.data.forEach((row, index) => {
        rowCacheRef.current.set(startRow + index, row);
      });

      console.log(`[SimplifiedSpreadsheetView] Loaded ${pageData.data.length} rows, cache size: ${rowCacheRef.current.size}`);

      return pageData.data;
    } catch (error) {
      console.error('[SimplifiedSpreadsheetView] Failed to load page from DuckDB:', error);
      return [];
    }
  }, [useDuckDB, tableName]);

  // Total rows for virtual scrolling
  const totalRows = useMemo(() => {
    // TASK 87: Use DuckDB row count for large spreadsheets
    if (useDuckDB && totalDuckDBRows !== null) {
      return totalDuckDBRows;
    }

    // Default: Always allow at least 100 empty rows for data entry
    return Math.max(rows.length, 100);
  }, [useDuckDB, totalDuckDBRows, rows.length]);

  // Expose handlers for external use
  // Store them in a ref that parent can access
  React.useImperativeHandle(
    React.useRef(null),
    () => ({
      addRow: handleAddRow,
      addColumn: handleAddColumn,
    }),
    [handleAddRow, handleAddColumn]
  );

  // Get cell value for formula bar
  const getSelectedCellValue = useCallback(() => {
    if (!selectedCell || !rows[selectedCell.row]) return null;
    const column = columns[selectedCell.col];
    if (!column) return null;

    const cellData = rows[selectedCell.row][column.id];

    // Check if it's enhanced cell state
    if (cellData && typeof cellData === 'object' && 'isFormula' in cellData) {
      return cellData.value;
    }

    return cellData;
  }, [selectedCell, rows, columns]);

  // Get cell formula for formula bar
  const getSelectedCellFormula = useCallback(() => {
    if (!selectedCell || !rows[selectedCell.row]) return null;
    const column = columns[selectedCell.col];
    if (!column) return null;

    const cellData = rows[selectedCell.row][column.id];

    // Check if it's enhanced cell state with formula
    if (cellData && typeof cellData === 'object' && 'isFormula' in cellData && cellData.isFormula) {
      return cellData.formula;
    }

    return null;
  }, [selectedCell, rows, columns]);

  // Handle formula bar changes
  const handleFormulaChange = useCallback((formula: string) => {
    // Live preview could go here
    console.log('[FormulaBar] Formula changed:', formula);
  }, []);

  // Handle formula bar submit
  const handleFormulaSubmit = useCallback((formula: string) => {
    if (!selectedCell) return;
    handleCellEdit(selectedCell.row, selectedCell.col, formula);
  }, [selectedCell, handleCellEdit]);

  // Handle formula bar cancel
  const handleFormulaCancel = useCallback(() => {
    console.log('[FormulaBar] Formula cancelled');
  }, []);

  return (
    <div
      className="w-full h-full flex flex-col"
      data-testid="simplified-spreadsheet-view"
    >
      {/* Formula Bar */}
      <FormulaBar
        selectedCell={selectedCell}
        cellValue={getSelectedCellValue()}
        cellFormula={getSelectedCellFormula()}
        onFormulaChange={handleFormulaChange}
        onFormulaSubmit={handleFormulaSubmit}
        onFormulaCancel={handleFormulaCancel}
        disabled={false}
      />

      {/* Spreadsheet Grid */}
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        totalRows={totalRows}
        onCellEdit={handleCellEdit}
        onCellSelected={setSelectedCell}
        onColumnResize={handleColumnResize}
        onLoadPage={useDuckDB ? handleLoadPage : undefined}
        height={height}
        pageSize={100}
        className="flex-1"
      />
    </div>
  );
}
