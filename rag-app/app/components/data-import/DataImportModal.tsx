import { useState, useCallback } from 'react';
import { X, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { FileUploadDropzone } from './FileUploadDropzone';
import { CSVParserService } from '~/services/data-import/csv-parser.service';
import { ExcelParserService, type ExcelSheet } from '~/services/data-import/excel-parser.service';
import type { DatabaseColumn, DatabaseRow } from '~/types/database-block';
import type { ParseProgress } from '~/services/data-import/csv-parser.service';
import { cn } from '~/utils/cn';

interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: { columns: DatabaseColumn[]; rows: DatabaseRow[] }) => Promise<void>;
  workspaceId: string;
  pageId?: string;
}

type ImportStep = 'upload' | 'sheet-select' | 'preview' | 'importing' | 'complete' | 'error';

export function DataImportModal({
  isOpen,
  onClose,
  onImport,
  workspaceId,
  pageId
}: DataImportModalProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<ExcelSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<{
    columns: DatabaseColumn[];
    rows: any[];
  } | null>(null);
  const [progress, setProgress] = useState<ParseProgress>({ loaded: 0, total: 0, percent: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    setError(null);
    
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (isExcel) {
      // For Excel files, first get the list of sheets
      try {
        const excelSheets = await ExcelParserService.getSheets(file);
        setSheets(excelSheets);
        
        if (excelSheets.length === 1) {
          // If only one sheet, auto-select it
          handleSheetSelect(excelSheets[0].name);
        } else {
          // Show sheet selection
          setStep('sheet-select');
        }
      } catch (err) {
        setError((err as Error).message);
        setStep('error');
      }
    } else {
      // For CSV, proceed directly to parsing
      handleParseFile(file);
    }
  }, []);

  const handleSheetSelect = useCallback((sheetName: string) => {
    setSelectedSheet(sheetName);
    if (selectedFile) {
      handleParseFile(selectedFile, sheetName);
    }
  }, [selectedFile]);

  const handleParseFile = useCallback(async (file: File, sheetName?: string) => {
    setIsProcessing(true);
    setStep('preview');
    setError(null);

    try {
      const isCSV = file.name.endsWith('.csv');
      let result;

      if (isCSV) {
        result = await CSVParserService.parseCSV(file, setProgress);
      } else {
        result = await ExcelParserService.parseExcel(file, sheetName, setProgress);
      }

      // Validate the parsed data
      const validationErrors = isCSV 
        ? CSVParserService.validateData(result.columns, result.rows)
        : ExcelParserService.validateData(result.columns, result.rows);

      if (validationErrors.length > 0) {
        setError(validationErrors.join(', '));
        setStep('error');
        return;
      }

      setParsedData(result);
    } catch (err) {
      setError((err as Error).message);
      setStep('error');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!parsedData) return;

    setStep('importing');
    setIsProcessing(true);
    setError(null);

    try {
      // Transform data to match database block format
      const databaseRows: DatabaseRow[] = parsedData.rows.map((row, index) => ({
        id: `imported_${Date.now()}_${index}`,
        blockId: '', // Will be set by the API
        cells: row.cells,
        position: index,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      // Call the API to create the database block
      const response = await fetch('/api/database-blocks/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId,
          pageId: pageId || `page_${Date.now()}`,
          name: selectedFile?.name.replace(/\.(csv|xlsx?)$/i, '') || 'Imported Data',
          columns: parsedData.columns,
          rows: databaseRows,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to import data');
      }

      // Call the parent's onImport callback with the created block info
      await onImport({
        columns: parsedData.columns,
        rows: databaseRows,
        blockId: result.block.id,
        ...result.block
      });

      setStep('complete');
    } catch (err) {
      setError((err as Error).message);
      setStep('error');
    } finally {
      setIsProcessing(false);
    }
  }, [parsedData, onImport, workspaceId, pageId, selectedFile]);

  const reset = useCallback(() => {
    setStep('upload');
    setSelectedFile(null);
    setSheets([]);
    setSelectedSheet(null);
    setParsedData(null);
    setProgress({ loaded: 0, total: 0, percent: 0 });
    setError(null);
    setIsProcessing(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Import Data</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {step === 'upload' && (
            <div className="space-y-4">
              <FileUploadDropzone
                onFileSelect={handleFileSelect}
                isProcessing={isProcessing}
                maxFileSize={10}
              />
              <div className="text-sm text-gray-500 space-y-1">
                <p>• CSV files will be imported directly</p>
                <p>• Excel files with multiple sheets will show a sheet selector</p>
                <p>• Column types will be automatically detected</p>
                <p>• Maximum file size: 10MB</p>
                <p>• Maximum rows: 50,000</p>
              </div>
            </div>
          )}

          {step === 'sheet-select' && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-blue-500 mb-2" />
                <p className="text-lg font-medium">Select Sheet to Import</p>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedFile?.name} contains {sheets.length} sheets
                </p>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sheets.map((sheet) => (
                  <button
                    key={sheet.name}
                    onClick={() => handleSheetSelect(sheet.name)}
                    className="w-full text-left p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="font-medium">{sheet.name}</div>
                    <div className="text-sm text-gray-500">
                      {sheet.rowCount} rows × {sheet.columnCount} columns
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'preview' && parsedData && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-medium text-blue-900">Data Preview</p>
                <p className="text-sm text-blue-700 mt-1">
                  {parsedData.columns.length} columns, {parsedData.rows.length} rows detected
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">Detected Columns</h3>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {parsedData.columns.map((col) => (
                      <div key={col.id} className="flex items-center space-x-2">
                        <div className={cn(
                          "px-2 py-1 rounded text-xs font-medium",
                          col.type === 'text' && "bg-gray-200 text-gray-700",
                          col.type === 'number' && "bg-blue-200 text-blue-700",
                          col.type === 'date' && "bg-green-200 text-green-700",
                          col.type === 'checkbox' && "bg-purple-200 text-purple-700",
                          col.type === 'email' && "bg-yellow-200 text-yellow-700",
                          col.type === 'url' && "bg-indigo-200 text-indigo-700",
                          col.type === 'currency' && "bg-emerald-200 text-emerald-700",
                          col.type === 'percent' && "bg-rose-200 text-rose-700"
                        )}>
                          {col.type}
                        </div>
                        <span className="text-sm">{col.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">Sample Data (First 5 rows)</h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {parsedData.columns.slice(0, 5).map((col) => (
                          <th
                            key={col.id}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {col.name}
                          </th>
                        ))}
                        {parsedData.columns.length > 5 && (
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                            +{parsedData.columns.length - 5} more
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 dark:bg-dark-primary">
                      {parsedData.rows.slice(0, 5).map((row, idx) => (
                        <tr key={idx}>
                          {parsedData.columns.slice(0, 5).map((col) => (
                            <td key={col.id} className="px-4 py-2 text-sm text-gray-900">
                              {String(row.cells[col.id] ?? '')}
                            </td>
                          ))}
                          {parsedData.columns.length > 5 && (
                            <td className="px-4 py-2 text-sm text-gray-500">...</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-4 text-lg font-medium">Importing Data...</p>
              <p className="mt-2 text-sm text-gray-500">
                Creating database block with {parsedData?.rows.length} rows
              </p>
            </div>
          )}

          {step === 'complete' && (
            <div className="py-12 text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <p className="mt-4 text-lg font-medium">Import Complete!</p>
              <p className="mt-2 text-sm text-gray-500">
                Successfully imported {parsedData?.rows.length} rows with {parsedData?.columns.length} columns
              </p>
            </div>
          )}

          {step === 'error' && (
            <div className="py-12 text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
              <p className="mt-4 text-lg font-medium">Import Failed</p>
              <p className="mt-2 text-sm text-red-600">{error}</p>
              <button
                onClick={reset}
                className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-between">
          {step === 'preview' && parsedData && (
            <>
              <button
                onClick={reset}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Start Over
              </button>
              <button
                onClick={handleImport}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Import {parsedData.rows.length} Rows
              </button>
            </>
          )}
          {(step === 'complete' || step === 'error') && (
            <button
              onClick={handleClose}
              className="ml-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}