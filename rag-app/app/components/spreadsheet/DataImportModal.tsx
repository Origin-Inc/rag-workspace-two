/**
 * DataImportModal Component
 *
 * Modal for importing CSV/Excel files into spreadsheet.
 * Uses Parser Worker for non-blocking file parsing.
 */

import { useState, useCallback, useRef } from 'react';
import { useParserWorker } from '~/hooks/workers';
import { SpreadsheetColumn } from './SpreadsheetGrid';
import { cn } from '~/utils/cn';

export interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: { columns: SpreadsheetColumn[]; rows: any[] }) => void;
}

export function DataImportModal({ isOpen, onClose, onImport }: DataImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, rows: 0 });
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parser = useParserWorker();

  // Handle file selection
  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setError(null);
      setProgress({ percent: 0, rows: 0 });

      // If Excel file, get sheet names
      if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        try {
          const names = await parser.getSheetNames(selectedFile);
          setSheetNames(names);
          if (names.length > 0) {
            setSelectedSheet(names[0]);
          }
        } catch (err) {
          console.error('Failed to get sheet names:', err);
          setError(err instanceof Error ? err.message : 'Failed to read Excel file');
        }
      }
    },
    [parser]
  );

  // Handle import
  const handleImport = useCallback(async () => {
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setProgress({ percent: 0, rows: 0 });

    try {
      let result;

      if (file.name.endsWith('.csv')) {
        // Parse CSV
        result = await parser.parseCSV(file, {}, (progressUpdate) => {
          setProgress({
            percent: progressUpdate.progress,
            rows: progressUpdate.rowsParsed,
          });
        });
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // Parse Excel
        result = await parser.parseExcel(file, selectedSheet || undefined);
      } else {
        throw new Error('Unsupported file format. Please use CSV or Excel files.');
      }

      if (result.error) {
        throw new Error(result.error);
      }

      // Convert to spreadsheet format
      if (result.data.length > 0) {
        // Extract columns from first row
        const firstRow = result.data[0];
        const columnNames = Object.keys(firstRow);

        const columns: SpreadsheetColumn[] = columnNames.map((name) => {
          // Infer type from first few rows
          let type: 'text' | 'number' | 'boolean' | 'date' = 'text';

          const samples = result.data.slice(0, 10).map((row) => row[name]);
          const nonNullSamples = samples.filter((v) => v !== null && v !== undefined);

          if (nonNullSamples.length > 0) {
            const allNumbers = nonNullSamples.every((v) => typeof v === 'number');
            const allBooleans = nonNullSamples.every((v) => typeof v === 'boolean');

            if (allNumbers) {
              type = 'number';
            } else if (allBooleans) {
              type = 'boolean';
            } else {
              // Check for dates
              const datePattern = /^\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/;
              const allDates = nonNullSamples.every((v) =>
                typeof v === 'string' && datePattern.test(v)
              );
              if (allDates) {
                type = 'date';
              }
            }
          }

          return {
            id: name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
            name,
            type,
            width: 150,
          };
        });

        onImport({ columns, rows: result.data });
        onClose();
      } else {
        throw new Error('No data found in file');
      }
    } catch (err) {
      console.error('Import failed:', err);
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsLoading(false);
    }
  }, [file, selectedSheet, parser, onImport, onClose]);

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Import Data
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            disabled={isLoading}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {/* File upload area */}
          {!file && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-gray-500 dark:text-gray-400">
                <p className="text-lg font-medium mb-2">Drop your file here or click to browse</p>
                <p className="text-sm">Supports CSV and Excel (.xlsx, .xls) files</p>
                <p className="text-sm mt-2">Maximum file size: 100MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) {
                    handleFileSelect(selectedFile);
                  }
                }}
                className="hidden"
              />
            </div>
          )}

          {/* File selected */}
          {file && !isLoading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">📄</span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setSelectedSheet(null);
                    setSheetNames([]);
                    setError(null);
                  }}
                  className="text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>

              {/* Sheet selection for Excel */}
              {sheetNames.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select Sheet
                  </label>
                  <select
                    value={selectedSheet || ''}
                    onChange={(e) => setSelectedSheet(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900"
                  >
                    {sheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
              <p className="mt-4 text-gray-600 dark:text-gray-400">Importing data...</p>
              {progress.rows > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-gray-500">
                    {progress.percent > 0 && `${progress.percent.toFixed(0)}% - `}
                    {progress.rows.toLocaleString()} rows processed
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isLoading}
            className={cn(
              'px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700',
              isLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!file || isLoading}
            className={cn(
              'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700',
              (!file || isLoading) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isLoading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
