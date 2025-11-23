/**
 * SpreadsheetBlock Component
 *
 * Block wrapper for the native spreadsheet editor.
 * Integrates SpreadsheetView into the block-based editor.
 */

import { memo, useCallback, useState, useEffect } from 'react';
import { SimplifiedSpreadsheetView } from '~/components/spreadsheet';
import type { SpreadsheetColumn } from '~/components/spreadsheet';
import type { Block } from '~/types/blocks';
import { Plus, Loader2 } from 'lucide-react';
import { getColumnLetter } from '~/utils/spreadsheet-notation';
import { getDuckDB } from '~/services/duckdb/duckdb-service.client';
import { duckDBService } from '~/services/duckdb/duckdb-service.client';

export interface SpreadsheetBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing?: boolean; // Optional, not used internally
}

interface SpreadsheetBlockContent {
  tableName?: string;
  columns?: SpreadsheetColumn[];
  rows?: any[];
  title?: string;
}

/**
 * Migrate legacy column names to A1 notation
 * Converts "Column 1" -> "A", "Column 2" -> "B", etc.
 */
function migrateColumnsToA1Notation(columns: SpreadsheetColumn[]): SpreadsheetColumn[] {
  return columns.map((col, index) => {
    // Check if column name matches legacy format "Column N" or "Column N (type)"
    const legacyPattern = /^Column\s+\d+/i;

    if (legacyPattern.test(col.name)) {
      return {
        ...col,
        name: getColumnLetter(index), // Convert to A1 notation based on position
      };
    }

    // If column name is already A1 notation or custom, keep it
    return col;
  });
}

export const SpreadsheetBlock = memo(function SpreadsheetBlock({
  block,
  onChange,
  isSelected,
}: SpreadsheetBlockProps) {
  // Parse content
  const content: SpreadsheetBlockContent =
    typeof block.content === 'string'
      ? (block.content ? JSON.parse(block.content) : {})
      : (block.content || {});

  // Generate table name from block ID
  const tableName = content.tableName || `spreadsheet_${block.id.replace(/-/g, '_')}`;

  // Migrate legacy column names to A1 notation
  const initialColumns = content.columns
    ? migrateColumnsToA1Notation(content.columns)
    : [];

  const initialRows = content.rows || [];
  const title = content.title || 'Spreadsheet';

  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<'text' | 'number' | 'boolean' | 'date'>('text');

  // TASK 87: DuckDB loading state for large spreadsheets
  const [isLoadingDuckDB, setIsLoadingDuckDB] = useState(false);
  const [duckDBLoaded, setDuckDBLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Detect if this is a large spreadsheet requiring DuckDB loading
  const isLargeSpreadsheet = (content as any).hasFullData === true && initialRows.length === 0;

  // TASK 87: Load data into DuckDB WASM for large spreadsheets
  useEffect(() => {
    if (!isLargeSpreadsheet || duckDBLoaded) return;

    async function loadIntoDuckDB() {
      setIsLoadingDuckDB(true);
      setLoadError(null);

      try {
        console.log(`[SpreadsheetBlock] Loading large spreadsheet (${(content as any).rowCount?.toLocaleString()} rows) into DuckDB...`);

        // Fetch full data from API route
        const response = await fetch(`/api/blocks/${block.id}/data`);

        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.statusText}`);
        }

        const fullData = await response.json();

        console.log(`[SpreadsheetBlock] Fetched ${fullData.rowCount?.toLocaleString()} rows, loading into DuckDB...`);

        // Initialize DuckDB service
        const db = await getDuckDB();

        // Create table from data using DuckDB service
        await duckDBService.createTableFromData(
          tableName,
          fullData.rows,
          fullData.columns || initialColumns,
          block.pageId || 'unknown'
        );

        console.log(`[SpreadsheetBlock] Successfully loaded data into DuckDB table: ${tableName}`);

        setDuckDBLoaded(true);
      } catch (error) {
        console.error('[SpreadsheetBlock] Failed to load data into DuckDB:', error);
        setLoadError(error instanceof Error ? error.message : 'Failed to load spreadsheet data');
      } finally {
        setIsLoadingDuckDB(false);
      }
    }

    loadIntoDuckDB();
  }, [block.id, tableName, isLargeSpreadsheet, duckDBLoaded, initialColumns, block.pageId, content]);

  // Update content when data changes
  const handleDataChange = useCallback(
    (updates: Partial<SpreadsheetBlockContent>) => {
      const newContent = {
        ...content,
        ...updates,
      };

      onChange({
        content: JSON.stringify(newContent),
      });
    },
    [content, onChange]
  );

  // Handle title change
  const handleTitleChange = useCallback(() => {
    if (tempTitle !== title) {
      handleDataChange({ title: tempTitle });
    }
    setIsTitleEditing(false);
  }, [tempTitle, title, handleDataChange]);

  // Handle add row
  const handleAddRow = useCallback(() => {
    const currentColumns = content.columns || [];
    const currentRows = content.rows || [];

    const newRow: any = {};
    currentColumns.forEach((col) => {
      newRow[col.id] = '';
    });

    handleDataChange({
      rows: [...currentRows, newRow],
    });
  }, [content, handleDataChange]);

  // Handle add column
  const handleAddColumn = useCallback(() => {
    if (!newColumnName.trim()) return;

    const columnId = newColumnName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    const currentColumns = content.columns || [];
    const currentRows = content.rows || [];

    const newColumn: SpreadsheetColumn = {
      id: columnId,
      name: newColumnName,
      type: newColumnType,
      width: 150,
    };

    // Add empty values for new column in all existing rows
    const updatedRows = currentRows.map(row => ({
      ...row,
      [columnId]: ''
    }));

    handleDataChange({
      columns: [...currentColumns, newColumn],
      rows: updatedRows,
    });

    setNewColumnName('');
    setNewColumnType('text');
    setShowAddColumn(false);
  }, [newColumnName, newColumnType, content, handleDataChange]);

  return (
    <div
      className="w-full h-full min-h-[400px] flex flex-col"
      data-testid="spreadsheet-block-root"
      onClick={(e) => {
        // Prevent block selection when clicking inside spreadsheet
        e.stopPropagation();
      }}
    >
      {/* Title bar with action buttons */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-theme-bg-primary"
        data-testid="spreadsheet-block-header"
      >
        <div className="flex-1">
          {isTitleEditing ? (
            <input
              type="text"
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleChange();
                if (e.key === 'Escape') {
                  setTempTitle(title);
                  setIsTitleEditing(false);
                }
              }}
              onBlur={handleTitleChange}
              className="text-lg font-semibold bg-transparent border-b-2 border-blue-500 outline-none"
              autoFocus
            />
          ) : (
            <h3
              className="text-lg font-semibold cursor-pointer hover:text-blue-600"
              onClick={() => setIsTitleEditing(true)}
              title="Click to edit title"
            >
              {title}
            </h3>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddColumn(!showAddColumn)}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded transition-colors flex items-center gap-1"
            title="Add column"
          >
            <Plus className="w-4 h-4" />
            <span>Column</span>
          </button>

          <button
            onClick={handleAddRow}
            className="px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded transition-colors flex items-center gap-1"
            title="Add row"
          >
            <Plus className="w-4 h-4" />
            <span>Row</span>
          </button>
        </div>
      </div>

      {/* Add column form */}
      {showAddColumn && (
        <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 bg-theme-bg-primary">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Column Name
              </label>
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddColumn();
                  if (e.key === 'Escape') {
                    setShowAddColumn(false);
                    setNewColumnName('');
                  }
                }}
                placeholder="Enter column name"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Type
              </label>
              <select
                value={newColumnType}
                onChange={(e) => setNewColumnType(e.target.value as any)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
              </select>
            </div>

            <button
              onClick={handleAddColumn}
              disabled={!newColumnName}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>

            <button
              onClick={() => {
                setShowAddColumn(false);
                setNewColumnName('');
                setNewColumnType('text');
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Spreadsheet */}
      <div
        className="flex-1 relative"
        data-testid="spreadsheet-container"
      >
        {/* TASK 87: Loading overlay for DuckDB data loading */}
        {isLoadingDuckDB && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Loading {(content as any).rowCount?.toLocaleString()} rows...
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This may take a moment for large datasets
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TASK 87: Error state for DuckDB loading failure */}
        {loadError && !isLoadingDuckDB && (
          <div className="absolute inset-0 bg-white/90 dark:bg-gray-900/90 z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-red-200 dark:border-red-800 max-w-md">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                  Failed to load spreadsheet data
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {loadError}
                </p>
              </div>
              <button
                onClick={() => {
                  setDuckDBLoaded(false);
                  setLoadError(null);
                }}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <SimplifiedSpreadsheetView
          initialColumns={initialColumns}
          initialRows={initialRows}
          onDataChange={(data) => {
            handleDataChange({
              columns: data.columns,
              rows: data.rows,
            });
          }}
          onAddRow={handleAddRow}
          onAddColumn={handleAddColumn}
          height={block.position?.height ? block.position.height * 100 : 600}
          // TASK 87: Pass DuckDB info to SimplifiedSpreadsheetView
          useDuckDB={isLargeSpreadsheet && duckDBLoaded}
          tableName={tableName}
        />
      </div>
    </div>
  );
});
