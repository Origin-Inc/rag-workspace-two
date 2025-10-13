/**
 * SpreadsheetView Component
 *
 * High-level spreadsheet editor with toolbar, data management, and formula support.
 * Integrates DuckDB Worker for data storage and HyperFormula Worker for calculations.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { SpreadsheetGrid, SpreadsheetColumn, SpreadsheetRow } from './SpreadsheetGrid';
import { SpreadsheetToolbar } from './SpreadsheetToolbar';
import { FormulaBar } from './FormulaBar';
import { useDuckDBDirect, useHyperFormulaWorker } from '~/hooks/workers';
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
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Workers
  const duckdb = useDuckDBDirect();
  const hyperFormula = useHyperFormulaWorker();

  // Log worker states on mount and changes
  useEffect(() => {
    console.log('[SpreadsheetView] Component mounted/updated', {
      tableName,
      duckdbReady: duckdb.isReady,
      duckdbInitializing: duckdb.isInitializing,
      duckdbError: duckdb.error,
      hyperFormulaReady: hyperFormula.isReady,
      hyperFormulaInitializing: hyperFormula.isInitializing,
      hyperFormulaError: hyperFormula.error,
      columnsLength: columns.length,
      initialColumnsLength: initialColumns.length
    });
  }, [
    tableName,
    duckdb.isReady,
    duckdb.isInitializing,
    duckdb.error,
    hyperFormula.isReady,
    hyperFormula.isInitializing,
    hyperFormula.error,
    columns.length,
    initialColumns.length
  ]);

  // Page cache for loaded data
  const loadedPagesRef = useState(new Set<number>())[0];
  const pageSize = 100;

  // Guard to prevent concurrent table initialization
  const initializingRef = useRef(false);
  const initializedTablesRef = useRef(new Set<string>());

  // Initialize table in DuckDB if not exists
  useEffect(() => {
    console.log('[SpreadsheetView] Table initialization effect triggered', {
      duckdbReady: duckdb.isReady,
      columnsLength: columns.length,
      shouldInitialize: duckdb.isReady && columns.length > 0,
      isInitializing: initializingRef.current,
      alreadyInitialized: initializedTablesRef.current.has(tableName)
    });

    if (!duckdb.isReady) {
      console.log('[SpreadsheetView] ⏸️ Waiting for DuckDB to be ready...');
      return;
    }

    if (columns.length === 0) {
      console.log('[SpreadsheetView] ⏸️ Waiting for columns to be set...');
      return;
    }

    // Prevent concurrent initialization
    if (initializingRef.current) {
      console.log('[SpreadsheetView] ⏸️ Initialization already in progress...');
      return;
    }

    // Don't re-initialize already initialized tables
    if (initializedTablesRef.current.has(tableName)) {
      console.log('[SpreadsheetView] ✅ Table already initialized:', tableName);
      return;
    }

    console.log('[SpreadsheetView] 🚀 Starting table initialization...');
    initializingRef.current = true;

    async function initializeTable() {
      try {
        console.log('[SpreadsheetView] Checking if table exists:', tableName);
        // Check if table exists
        const countResult = await duckdb.getRowCount(tableName).catch((err) => {
          console.log('[SpreadsheetView] Table does not exist or error getting row count:', err);
          return 0;
        });

        console.log('[SpreadsheetView] Row count result:', countResult);

        if (countResult === 0 && initialRows.length > 0) {
          console.log('[SpreadsheetView] Creating table with initial data...');
          // Create table and insert initial data
          // Include 'id' column first, then all data columns
          const columnDefs = [
            { name: 'id', type: 'VARCHAR' },
            ...columns.map((col) => ({
              name: col.id,
              type: col.type === 'number' ? 'DOUBLE' : col.type === 'boolean' ? 'BOOLEAN' : 'VARCHAR',
            })),
          ];

          console.log('[SpreadsheetView] Column definitions:', columnDefs);
          await duckdb.createTable(tableName, columnDefs);
          console.log('[SpreadsheetView] ✅ Table created successfully');

          await duckdb.insertRows(tableName, initialRows);
          console.log('[SpreadsheetView] ✅ Initial rows inserted');

          setTotalRows(initialRows.length);
        } else if (countResult === 0) {
          console.log('[SpreadsheetView] Creating empty table...');
          // Include 'id' column first, then all data columns
          const columnDefs = [
            { name: 'id', type: 'VARCHAR' },
            ...columns.map((col) => ({
              name: col.id,
              type: col.type === 'number' ? 'DOUBLE' : col.type === 'boolean' ? 'BOOLEAN' : 'VARCHAR',
            })),
          ];

          console.log('[SpreadsheetView] Column definitions:', columnDefs);
          await duckdb.createTable(tableName, columnDefs);
          console.log('[SpreadsheetView] ✅ Empty table created successfully');
          setTotalRows(0);
        } else {
          console.log('[SpreadsheetView] Table already exists with', countResult, 'rows');
          setTotalRows(countResult);
        }

        console.log('[SpreadsheetView] ✅ Table initialization complete!');
        // Mark table as initialized
        initializedTablesRef.current.add(tableName);
      } catch (err) {
        console.error('[SpreadsheetView] ❌ Failed to initialize table:', err);
        setError(err instanceof Error ? err.message : 'Table initialization failed');
      } finally {
        // Reset initialization guard
        initializingRef.current = false;
      }
    }

    initializeTable();
  }, [duckdb.isReady, duckdb.getRowCount, duckdb.createTable, duckdb.insertRows, tableName, columns]);

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

  // Get current cell value and formula
  const currentCellValue = useMemo(() => {
    if (!selectedCell) return null;
    const row = rows[selectedCell.row];
    const column = columns[selectedCell.col];
    if (!row || !column) return null;
    return row[column.id];
  }, [selectedCell, rows, columns]);

  const currentCellFormula = useMemo(() => {
    if (!selectedCell) return null;
    const row = rows[selectedCell.row];
    const column = columns[selectedCell.col];
    if (!row || !column) return null;

    const value = row[column.id];
    if (typeof value === 'string' && value.startsWith('=')) {
      return value;
    }
    return null;
  }, [selectedCell, rows, columns]);

  // Handle formula input
  const handleFormulaChange = useCallback((formula: string) => {
    // Live preview could be implemented here
  }, []);

  // Handle formula submit
  const handleFormulaSubmit = useCallback(
    async (formula: string) => {
      if (!selectedCell || !duckdb.isReady) return;

      const row = selectedCell.row;
      const col = selectedCell.col;

      try {
        const column = columns[col];
        if (!column) return;

        const rowData = rows[row];
        if (!rowData) return;

        let finalValue = formula;

        // If it's a formula, calculate with HyperFormula
        if (formula.startsWith('=') && hyperFormula.isReady) {
          try {
            // Set formula in HyperFormula
            await hyperFormula.setCellFormula(0, row, col, formula);

            // Get calculated value
            const calculatedValue = await hyperFormula.getCellValue(0, row, col);

            // Store both formula and calculated value
            // For now, we'll store the formula string
            finalValue = formula;
          } catch (formulaError) {
            console.error('Formula calculation error:', formulaError);
            // Store formula anyway, will show error in cell
            finalValue = formula;
          }
        }

        // Update DuckDB
        await duckdb.updateCell(tableName, rowData.id || String(row), column.id, finalValue);

        // Update local state
        setRows((prevRows) => {
          const newRows = [...prevRows];
          newRows[row] = {
            ...newRows[row],
            [column.id]: finalValue,
          };
          return newRows;
        });

        setError(null);
      } catch (err) {
        console.error('Failed to update formula:', err);
        setError(err instanceof Error ? err.message : 'Formula update failed');
      }
    },
    [selectedCell, duckdb.isReady, hyperFormula.isReady, tableName, columns, rows, duckdb, hyperFormula]
  );

  // Handle formula cancel
  const handleFormulaCancel = useCallback(() => {
    // Nothing to do, formula bar will reset itself
  }, []);

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

  // Handle data import
  const handleImportData = useCallback(
    async (data: { columns: SpreadsheetColumn[]; rows: any[] }) => {
      if (!duckdb.isReady) return;

      try {
        setIsLoading(true);

        // If table is empty, use imported columns
        if (columns.length === 0) {
          setColumns(data.columns);
        }

        // Create column definitions for DuckDB
        // Include 'id' column first, then all data columns
        const columnDefs = [
          { name: 'id', type: 'VARCHAR' },
          ...data.columns.map((col) => ({
            name: col.id,
            type: col.type === 'number' ? 'DOUBLE' : col.type === 'boolean' ? 'BOOLEAN' : 'VARCHAR',
          })),
        ];

        // Create table if not exists
        try {
          await duckdb.createTable(tableName, columnDefs);
        } catch (err) {
          // Table might already exist, that's okay
          console.log('Table already exists, inserting data...');
        }

        // Insert rows in batches
        const batchSize = 1000;
        for (let i = 0; i < data.rows.length; i += batchSize) {
          const batch = data.rows.slice(i, i + batchSize);
          await duckdb.insertRows(tableName, batch);
        }

        // Refresh row count and data
        const count = await duckdb.getRowCount(tableName);
        setTotalRows(count);

        // Clear loaded pages to force reload
        loadedPagesRef.clear();
        setRows([]);

        // Load first page
        await loadPage(0, pageSize);

        setError(null);
      } catch (err) {
        console.error('Failed to import data:', err);
        setError(err instanceof Error ? err.message : 'Data import failed');
      } finally {
        setIsLoading(false);
      }
    },
    [duckdb.isReady, tableName, columns.length, duckdb, loadedPagesRef, loadPage, pageSize]
  );

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
      onCellSelected: setSelectedCell,
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
        onImportData={handleImportData}
        onAnalyzeWithAI={onAnalyzeWithAI ? handleAnalyzeWithAI : undefined}
        disabled={!duckdb.isReady || isLoading}
      />

      {/* Formula Bar */}
      <FormulaBar
        selectedCell={selectedCell}
        cellValue={currentCellValue}
        cellFormula={currentCellFormula}
        onFormulaChange={handleFormulaChange}
        onFormulaSubmit={handleFormulaSubmit}
        onFormulaCancel={handleFormulaCancel}
        disabled={!duckdb.isReady || isLoading || !hyperFormula.isReady}
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
