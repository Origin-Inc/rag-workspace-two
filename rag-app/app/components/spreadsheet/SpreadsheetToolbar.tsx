/**
 * SpreadsheetToolbar Component
 *
 * Toolbar for spreadsheet operations: add row/column, delete, import, AI analysis.
 */

import { useState, memo } from 'react';
import { SpreadsheetColumn } from './SpreadsheetGrid';
import { DataImportModal } from './DataImportModal';
import { cn } from '~/utils/cn';

export interface SpreadsheetToolbarProps {
  tableName: string;
  columnCount: number;
  rowCount: number;
  selectedRowCount: number;
  onAddRow: () => void;
  onAddColumn: (column: SpreadsheetColumn) => void;
  onDeleteSelected: () => void;
  onImportData?: (data: { columns: SpreadsheetColumn[]; rows: any[] }) => void;
  onAnalyzeWithAI?: () => void;
  disabled?: boolean;
}

export const SpreadsheetToolbar = memo(function SpreadsheetToolbar({
  tableName,
  columnCount,
  rowCount,
  selectedRowCount,
  onAddRow,
  onAddColumn,
  onDeleteSelected,
  onImportData,
  onAnalyzeWithAI,
  disabled = false,
}: SpreadsheetToolbarProps) {
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<'text' | 'number' | 'boolean' | 'date'>('text');

  const handleAddColumn = () => {
    if (!newColumnName.trim()) return;

    const columnId = newColumnName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    onAddColumn({
      id: columnId,
      name: newColumnName,
      type: newColumnType,
      width: 150,
    });

    setNewColumnName('');
    setNewColumnType('text');
    setShowAddColumn(false);
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgba(33,33,33,1)]">
      {/* Main toolbar */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center space-x-3">
          {/* Table name */}
          <h2 className="text-lg font-semibold">{tableName}</h2>

          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

          {/* Stats */}
          <span className="text-sm text-gray-500">{rowCount.toLocaleString()} rows</span>
          <span className="text-sm text-gray-500">{columnCount} columns</span>

          {/* Selected count */}
          {selectedRowCount > 0 && (
            <span className="text-sm text-blue-600 font-medium">
              {selectedRowCount} selected
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Delete selected */}
          {selectedRowCount > 0 && (
            <button
              onClick={onDeleteSelected}
              disabled={disabled}
              className={cn(
                'px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              Delete Selected
            </button>
          )}

          {/* Import data button */}
          {onImportData && (
            <button
              onClick={() => setShowImportModal(true)}
              disabled={disabled}
              className={cn(
                'px-3 py-1 text-sm bg-green-600 text-white hover:bg-green-700 rounded flex items-center space-x-1 transition-colors',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span>📁</span>
              <span>Import</span>
            </button>
          )}

          {/* Add column button */}
          <button
            onClick={() => setShowAddColumn(!showAddColumn)}
            disabled={disabled}
            className={cn(
              'px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            + Column
          </button>

          {/* Add row button */}
          <button
            onClick={onAddRow}
            disabled={disabled}
            className={cn(
              'px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded transition-colors',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            + New Row
          </button>

          {/* Analyze with AI button */}
          {onAnalyzeWithAI && (
            <button
              onClick={onAnalyzeWithAI}
              disabled={disabled}
              className={cn(
                'px-3 py-1 text-sm bg-purple-600 text-white hover:bg-purple-700 rounded flex items-center space-x-1 transition-colors',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span>✨</span>
              <span>Analyze with AI</span>
            </button>
          )}
        </div>
      </div>

      {/* Add column form */}
      {showAddColumn && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-end space-x-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                autoFocus
                disabled={disabled}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type
              </label>
              <select
                value={newColumnType}
                onChange={(e) => setNewColumnType(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                disabled={disabled}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
              </select>
            </div>

            <button
              onClick={handleAddColumn}
              disabled={!newColumnName || disabled}
              className={cn(
                'px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors',
                (!newColumnName || disabled) && 'opacity-50 cursor-not-allowed'
              )}
            >
              Add Column
            </button>

            <button
              onClick={() => {
                setShowAddColumn(false);
                setNewColumnName('');
                setNewColumnType('text');
              }}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {onImportData && (
        <DataImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={onImportData}
        />
      )}
    </div>
  );
});
