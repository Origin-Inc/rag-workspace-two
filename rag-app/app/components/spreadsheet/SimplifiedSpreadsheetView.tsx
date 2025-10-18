/**
 * Simplified SpreadsheetView Component
 *
 * Lightweight React state-based spreadsheet using Glide Data Grid.
 * NOW with HyperFormula integration for Excel-compatible formulas.
 *
 * Performance: <50ms initialization, <10ms cell edits
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { FormulaBar } from './FormulaBar';
import { useHyperFormulaWorker } from '~/hooks/workers';
import { getColumnLetter } from '~/utils/spreadsheet-notation';
import type { SpreadsheetColumn, SpreadsheetRow } from './SpreadsheetGrid';

export interface SimplifiedSpreadsheetViewProps {
  initialColumns?: SpreadsheetColumn[];
  initialRows?: SpreadsheetRow[];
  onDataChange?: (data: { columns: SpreadsheetColumn[]; rows: SpreadsheetRow[] }) => void;
  onAddRow?: () => void;
  onAddColumn?: (column: SpreadsheetColumn) => void;
  height?: number;
}

export function SimplifiedSpreadsheetView({
  initialColumns = [],
  initialRows = [],
  onDataChange,
  onAddRow: externalOnAddRow,
  onAddColumn: externalOnAddColumn,
  height = 500,
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

  // Selected cell for formula bar
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);

  // Initialize HyperFormula worker
  const hyperformula = useHyperFormulaWorker({
    licenseKey: 'gpl-v3',
    useArrayArithmetic: true,
    useColumnIndex: true,
  });

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
    async (rowIndex: number, colIndex: number, value: any) => {
      const column = columns[colIndex];
      if (!column) {
        console.warn('[SimplifiedSpreadsheetView] Column not found at index', colIndex);
        return;
      }

      const isFormula = typeof value === 'string' && value.startsWith('=');

      // Optimistic update: show raw value immediately
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

        // Update cell value
        newRows[rowIndex] = {
          ...newRows[rowIndex],
          [column.id]: value,
        };

        return newRows;
      });

      // If it's a formula, evaluate it with HyperFormula
      if (isFormula && hyperformula.isReady) {
        try {
          // Send formula to worker for evaluation
          await hyperformula.setCellFormula(0, rowIndex, colIndex, value);

          // Get computed value
          const computedValue = await hyperformula.getCellValue(0, rowIndex, colIndex);

          console.log(`[Formula] ${value} = ${computedValue}`);

          // Update with computed value (store both raw formula and computed value)
          setRows((prevRows) => {
            const newRows = [...prevRows];
            if (newRows[rowIndex]) {
              newRows[rowIndex] = {
                ...newRows[rowIndex],
                [column.id]: {
                  formula: value,
                  value: computedValue,
                  isFormula: true,
                },
              };
            }
            return newRows;
          });
        } catch (error) {
          console.error('[Formula Error]', error);

          // Store error state
          setRows((prevRows) => {
            const newRows = [...prevRows];
            if (newRows[rowIndex]) {
              newRows[rowIndex] = {
                ...newRows[rowIndex],
                [column.id]: {
                  formula: value,
                  value: '#ERROR',
                  isFormula: true,
                  error: error instanceof Error ? error.message : 'Formula error',
                },
              };
            }
            return newRows;
          });
        }
      } else if (hyperformula.isReady) {
        // Regular value - still send to HyperFormula for dependency tracking
        try {
          await hyperformula.setCellContents(0, rowIndex, colIndex, value);
        } catch (error) {
          console.error('[HyperFormula] Error setting cell contents:', error);
        }
      }

      // Notify parent (debounced)
      setRows((currentRows) => {
        notifyParent(columns, currentRows);
        return currentRows;
      });
    },
    [columns, notifyParent, hyperformula]
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

  // Total rows for virtual scrolling
  const totalRows = useMemo(() => {
    // Always allow at least 100 empty rows for data entry
    return Math.max(rows.length, 100);
  }, [rows.length]);

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

  // Initialize HyperFormula with existing data
  useEffect(() => {
    if (!hyperformula.isReady || rows.length === 0) return;

    const initializeData = async () => {
      try {
        console.log('[HyperFormula] Initializing with existing data...');

        // Convert rows to 2D array for HyperFormula
        const data = rows.map(row =>
          columns.map(col => {
            const cellData = row[col.id];
            // Extract raw value if it's enhanced cell state
            if (cellData && typeof cellData === 'object' && 'formula' in cellData) {
              return cellData.formula;
            }
            return cellData ?? '';
          })
        );

        // Set sheet content in bulk
        await hyperformula.setSheetContent(0, data);

        console.log('[HyperFormula] Initialization complete');
      } catch (error) {
        console.error('[HyperFormula] Initialization error:', error);
      }
    };

    initializeData();
  }, [hyperformula.isReady]); // Only run once when ready

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
        disabled={!hyperformula.isReady || hyperformula.isInitializing}
      />

      {/* Loading state */}
      {hyperformula.isInitializing && (
        <div className="text-sm text-gray-500 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          Initializing formula engine...
        </div>
      )}

      {/* Error state */}
      {hyperformula.error && (
        <div className="text-sm text-red-600 px-4 py-2 border-b border-red-200 bg-red-50 dark:bg-red-900/20">
          Formula engine error: {hyperformula.error}
        </div>
      )}

      {/* Spreadsheet Grid */}
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        totalRows={totalRows}
        onCellEdit={handleCellEdit}
        onCellSelected={setSelectedCell}
        onColumnResize={handleColumnResize}
        height={height}
        pageSize={100}
        className="flex-1"
      />
    </div>
  );
}
