import { useState } from 'react';
import { Upload, Table, FileSpreadsheet } from 'lucide-react';
import { DataImportModal } from '~/components/data-import/DataImportModal';
import { DatabaseTable } from '~/components/database-block/DatabaseTable';
import type { DatabaseColumn, DatabaseRow, DatabaseBlock } from '~/types/database-block';

export default function DataImportDemo() {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedData, setImportedData] = useState<{
    columns: DatabaseColumn[];
    rows: DatabaseRow[];
  } | null>(null);

  const handleImport = async (data: { columns: DatabaseColumn[]; rows: DatabaseRow[] }) => {
    // In a real application, this would save to the database
    console.log('Importing data:', data);
    
    // For demo, just store in state
    setImportedData(data);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  // Create a mock database block from imported data
  const mockDatabaseBlock: DatabaseBlock | null = importedData ? {
    id: `imported_${Date.now()}`,
    workspaceId: 'demo-workspace',
    pageId: 'demo-page',
    name: 'Imported Data',
    columns: importedData.columns,
    rows: importedData.rows,
    filters: [],
    sorts: [],
    views: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">CSV/Excel Import Demo</h1>
          <p className="mt-2 text-gray-600">
            Import CSV or Excel files to create editable database blocks
          </p>
        </div>

        {!importedData ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
            <div className="text-center">
              <FileSpreadsheet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                No Data Imported Yet
              </h2>
              <p className="text-gray-600 mb-8">
                Import a CSV or Excel file to create an editable database
              </p>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                <Upload className="w-5 h-5 mr-2" />
                Import Data
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Table className="w-6 h-6 text-gray-400 mr-2" />
                  <h2 className="text-xl font-semibold text-gray-900">
                    Imported Database
                  </h2>
                  <span className="ml-3 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                    {importedData.rows.length} rows × {importedData.columns.length} columns
                  </span>
                </div>
                <button
                  onClick={() => {
                    setImportedData(null);
                    setIsImportModalOpen(true);
                  }}
                  className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Import New
                </button>
              </div>
              
              <div className="border rounded-lg overflow-hidden" style={{ height: '600px' }}>
                {mockDatabaseBlock && (
                  <DatabaseTable
                    columns={mockDatabaseBlock.columns}
                    rows={mockDatabaseBlock.rows}
                    onUpdateRow={(rowId, updates) => {
                      // Handle row updates
                      console.log('Update row:', rowId, updates);
                      setImportedData(prev => {
                        if (!prev) return null;
                        return {
                          ...prev,
                          rows: prev.rows.map(row => 
                            row.id === rowId 
                              ? { ...row, cells: { ...row.cells, ...updates } }
                              : row
                          )
                        };
                      });
                    }}
                    onAddRow={() => {
                      // Handle adding new row
                      console.log('Add new row');
                      setImportedData(prev => {
                        if (!prev) return null;
                        const newRow: DatabaseRow = {
                          id: `row_${Date.now()}`,
                          blockId: mockDatabaseBlock.id,
                          cells: Object.fromEntries(
                            prev.columns.map(col => [col.id, ''])
                          ),
                          position: prev.rows.length,
                          createdAt: new Date().toISOString(),
                          updatedAt: new Date().toISOString()
                        };
                        return {
                          ...prev,
                          rows: [...prev.rows, newRow]
                        };
                      });
                    }}
                    onDeleteRow={(rowId) => {
                      // Handle row deletion
                      console.log('Delete row:', rowId);
                      setImportedData(prev => {
                        if (!prev) return null;
                        return {
                          ...prev,
                          rows: prev.rows.filter(row => row.id !== rowId)
                        };
                      });
                    }}
                  />
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">Features Demonstrated:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>✓ Automatic column type detection (text, number, date, email, etc.)</li>
                <li>✓ Support for both CSV and Excel files</li>
                <li>✓ Multi-sheet selection for Excel files</li>
                <li>✓ Data validation and error handling</li>
                <li>✓ Progress tracking for large files</li>
                <li>✓ Fully editable database after import</li>
                <li>✓ Compatible with all database block features (sorting, filtering, formulas)</li>
              </ul>
            </div>
          </div>
        )}

        <DataImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImport={handleImport}
          workspaceId="demo-workspace"
          pageId="demo-page"
        />
      </div>
    </div>
  );
}