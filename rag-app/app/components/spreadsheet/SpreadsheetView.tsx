/**
 * SpreadsheetView Component
 *
 * High-level spreadsheet editor with toolbar, data management, and formula support.
 * Integrates DuckDB Worker for data storage and HyperFormula Worker for calculations.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { SpreadsheetGrid, SpreadsheetColumn, SpreadsheetRow } from './SpreadsheetGrid';
import { SpreadsheetToolbar } from './SpreadsheetToolbar';
import { useDuckDBWorker } from '~/hooks/workers';
import { cn } from '~/utils/cn';

export interface SpreadsheetViewProps {
  tableName: string;
  initialColumns?: SpreadsheetColumn[];
  initialRows?: SpreadsheetRow[];
  onAnalyzeWithAI?: (context: any) => void;
  className?: string;
  height?: number;
}

/**
 * SpreadsheetView Component
 */
export function SpreadsheetView({
  tableName,
  initialColumns = [],
  initialRows = [],
  onAnalyzeWithAI,
  className,
  height = 600,
}: SpreadsheetViewProps) {
  // State
  const [columns, setColumns] = useState<SpreadsheetColumn[]>(initialColumns);
  const [rows, setRows] = useState<SpreadsheetRow[]>(initialRows);
  const [totalRows, setTotalRows] = useState(initialRows.length);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Workers
  const duckdb = useDuckDBWorker();

  // Page cache for loaded data
  const loadedPagesRef = useState(new Set<number>())[0];
  const pageSize = 100;

  // Initialize table in DuckDB if not exists
  useEffect(() => {
    if (!duckdb.isReady || columns.length === 0) return;

    async function initializeTable() {
      try {
        // Check if table exists
        const countResult = await duckdb.getRowCount(tableName).catch(() => 0);

        if (countResult === 0 && initialRows.length > 0) {
          // Create table and insert initial data
          const columnDefs = columns.map((col) => ({
            name: col.id,
            type: col.type === 'number' ? 'DOUBLE' : col.type === 'boolean' ? 'BOOLEAN' : 'VARCHAR',
          }));

          await duckdb.createTable(tableName, columnDefs);
          await duckdb.insertRows(tableName, initialRows);

          setTotalRows(initialRows.length);
        } else {
          setTotalRows(countResult);
        }
      } catch (err) {
        console.error('Failed to initialize table:', err);
        setError(err instanceof Error ? err.message : 'Table initialization failed');
      }
    }

    initializeTable();
  }, [duckdb.isReady, tableName, columns, initialRows, duckdb]);

  // Load page from DuckDB
  const loadPage = useCallback(
    async (page: number, size: number): Promise<SpreadsheetRow[]> => {
      if (!duckdb.isReady || loadedPagesRef.has(page)) {
        return [];
      }

      try {
        setIsLoading(true);
        loadedPagesRef.add(page);

        const result = await duckdb.loadPage(tableName, page, size);

        // Update rows array
        setRows((prevRows) => {
          const newRows = [...prevRows];
          const startIndex = page * size;

          result.data.forEach((row, index) => {
            newRows[startIndex + index] = row;
          });

          return newRows;
        });

        setTotalRows(result.totalRows);
        setError(null);

        return result.data;
      } catch (err) {
        console.error('Failed to load page:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        loadedPagesRef.delete(page); // Allow retry
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [duckdb.isReady, tableName, loadedPagesRef, duckdb]
  );

  // Handle cell edits
  const handleCellEdit = useCallback(
    async (row: number, col: number, value: any) => {
      if (!duckdb.isReady) return;

      try {
        const column = columns[col];
        if (!column) return;

        const rowData = rows[row];
        if (!rowData) return;

        // Update DuckDB
        await duckdb.updateCell(tableName, rowData.id || String(row), column.id, value);

        // Update local state
        setRows((prevRows) => {
          const newRows = [...prevRows];
          newRows[row] = {
            ...newRows[row],
            [column.id]: value,
          };
          return newRows;
        });

        setError(null);
      } catch (err) {
        console.error('Failed to update cell:', err);
        setError(err instanceof Error ? err.message : 'Cell update failed');
      }
    },
    [duckdb.isReady, tableName, columns, rows, duckdb]
  );

  // Add row
  const handleAddRow = useCallback(async () => {
    if (!duckdb.isReady) return;

    try {
      // Create empty row
      const newRow: SpreadsheetRow = {
        id: `row-${Date.now()}`,
      };

      columns.forEach((col) => {
        newRow[col.id] = null;
      });

      // Insert into DuckDB
      await duckdb.insertRows(tableName, [newRow]);

      // Update local state
      setRows((prevRows) => [...prevRows, newRow]);
      setTotalRows((prev) => prev + 1);

      setError(null);
    } catch (err) {
      console.error('Failed to add row:', err);
      setError(err instanceof Error ? err.message : 'Add row failed');
    }
  }, [duckdb.isReady, tableName, columns, duckdb]);

  // Add column
  const handleAddColumn = useCallback(
    async (column: SpreadsheetColumn) => {
      if (!duckdb.isReady) return;

      try {
        // Add column to table (ALTER TABLE)
        await duckdb.query(`ALTER TABLE ${tableName} ADD COLUMN ${column.id} VARCHAR`);

        // Update local state
        setColumns((prevColumns) => [...prevColumns, column]);

        setError(null);
      } catch (err) {
        console.error('Failed to add column:', err);
        setError(err instanceof Error ? err.message : 'Add column failed');
      }
    },
    [duckdb.isReady, tableName, duckdb]
  );

  // Delete selected rows
  const handleDeleteSelected = useCallback(async () => {
    if (!duckdb.isReady || selectedRows.size === 0) return;

    try {
      // Get row IDs to delete
      const rowIds = Array.from(selectedRows).map((index) => {
        const row = rows[index];
        return row?.id || String(index);
      });

      // Delete from DuckDB
      await duckdb.deleteRows(tableName, rowIds);

      // Update local state
      setRows((prevRows) => prevRows.filter((_, index) => !selectedRows.has(index)));
      setTotalRows((prev) => prev - selectedRows.size);
      setSelectedRows(new Set());

      setError(null);
    } catch (err) {
      console.error('Failed to delete rows:', err);
      setError(err instanceof Error ? err.message : 'Delete rows failed');
    }
  }, [duckdb.isReady, selectedRows, rows, tableName, duckdb]);

  // Handle column resize
  const handleColumnResize = useCallback((columnId: string, newWidth: number) => {
    setColumns((prevColumns) =>
      prevColumns.map((col) => (col.id === columnId ? { ...col, width: newWidth } : col))
    );
  }, []);

  // Handle column move
  const handleColumnMove = useCallback((fromIndex: number, toIndex: number) => {
    setColumns((prevColumns) => {
      const newColumns = [...prevColumns];
      const [movedColumn] = newColumns.splice(fromIndex, 1);
      newColumns.splice(toIndex, 0, movedColumn);
      return newColumns;
    });
  }, []);

  // Handle AI analysis
  const handleAnalyzeWithAI = useCallback(() => {
    if (!onAnalyzeWithAI) return;

    const context = {
      tableName,
      columns: columns.map((col) => ({
        id: col.id,
        name: col.name,
        type: col.type,
      })),
      rows: rows.slice(0, 100), // Send first 100 rows for analysis
      totalRows,
    };

    onAnalyzeWithAI(context);
  }, [onAnalyzeWithAI, tableName, columns, rows, totalRows]);

  // Memoize grid props
  const gridProps = useMemo(
    () => ({
      columns,
      rows,
      totalRows,
      onCellEdit: handleCellEdit,
      onLoadPage: loadPage,
      onColumnResize: handleColumnResize,
      onColumnMove: handleColumnMove,
      onRowsSelected: setSelectedRows,
      height,
      pageSize,
    }),
    [columns, rows, totalRows, handleCellEdit, loadPage, handleColumnResize, handleColumnMove, height]
  );

  return (
    <div className={cn('flex flex-col h-full bg-white dark:bg-[rgba(33,33,33,1)]', className)}>
      {/* Toolbar */}
      <SpreadsheetToolbar
        tableName={tableName}
        columnCount={columns.length}
        rowCount={totalRows}
        selectedRowCount={selectedRows.size}
        onAddRow={handleAddRow}
        onAddColumn={handleAddColumn}
        onDeleteSelected={handleDeleteSelected}
        onAnalyzeWithAI={onAnalyzeWithAI ? handleAnalyzeWithAI : undefined}
        disabled={!duckdb.isReady || isLoading}
      />

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Loading indicator */}
      {duckdb.isInitializing && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-4 text-sm text-gray-500">Initializing spreadsheet engine...</p>
          </div>
        </div>
      )}

      {/* Worker error */}
      {duckdb.error && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-red-600">
            <p className="font-medium">Failed to initialize spreadsheet engine</p>
            <p className="text-sm mt-2">{duckdb.error}</p>
          </div>
        </div>
      )}

      {/* Grid */}
      {duckdb.isReady && !duckdb.isInitializing && (
        <div className="flex-1 overflow-hidden">
          <SpreadsheetGrid {...gridProps} />
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute bottom-4 right-4 bg-white dark:bg-[rgba(33,33,33,1)] rounded-lg shadow-lg px-4 py-2">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            <span className="text-sm text-gray-600">Loading data...</span>
          </div>
        </div>
      )}
    </div>
  );
}
