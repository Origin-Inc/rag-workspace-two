import { memo } from 'react';
import type {
  DatabaseBlock,
  DatabaseColumn,
  DatabaseRow
} from '~/types/database-block';

interface DatabaseGalleryProps {
  databaseBlock: DatabaseBlock | null;
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
  selectedRows: Set<string>;
  viewSettings: any;
  onUpdateRow: (rowId: string, updates: Partial<DatabaseRow['cells']>) => void;
  onDeleteRows: (rowIds: string[]) => void;
  onUpdateColumn: (columnId: string, updates: Partial<DatabaseColumn>) => void;
  onDeleteColumn: (columnId: string) => void;
  onSelectRow: (rowId: string, isSelected: boolean) => void;
  onSelectAllRows: (isSelected: boolean) => void;
  onClearSelection: () => void;
  onUpdateViewSettings: (settings: any) => void;
}

export const DatabaseGallery = memo(function DatabaseGallery({
  databaseBlock,
  columns,
  rows,
  selectedRows,
  viewSettings,
  onUpdateRow,
  onDeleteRows,
  onSelectRow,
  onUpdateViewSettings
}: DatabaseGalleryProps) {
  // Get card size from view settings
  const cardSize = viewSettings?.cardSize || 'medium';
  const coverField = viewSettings?.coverField;
  
  const getCardClass = () => {
    switch (cardSize) {
      case 'small': return 'w-48 h-56';
      case 'large': return 'w-80 h-96';
      default: return 'w-64 h-72';
    }
  };

  return (
    <div className="p-4">
      {/* Gallery settings bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 text-sm">
            <span>Card Size:</span>
            <select
              value={cardSize}
              onChange={(e) => onUpdateViewSettings({ cardSize: e.target.value })}
              className="px-2 py-1 border rounded"
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
          
          <label className="flex items-center space-x-2 text-sm">
            <span>Cover Field:</span>
            <select
              value={coverField || ''}
              onChange={(e) => onUpdateViewSettings({ coverField: e.target.value || undefined })}
              className="px-2 py-1 border rounded"
            >
              <option value="">None</option>
              {columns.map(col => (
                <option key={col.id} value={col.id}>{col.name}</option>
              ))}
            </select>
          </label>
        </div>
        
        <div className="text-sm text-gray-500">
          {rows.length} items
        </div>
      </div>

      {/* Gallery grid */}
      <div className="grid gap-4" style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize === 'small' ? '12rem' : cardSize === 'large' ? '20rem' : '16rem'}, 1fr))`
      }}>
        {rows.map(row => {
          const isSelected = selectedRows.has(row.id);
          const coverValue = coverField ? row.cells[coverField] : null;
          
          return (
            <div
              key={row.id}
              className={`
                ${getCardClass()}
                bg-white rounded-lg shadow-sm border-2 transition-all cursor-pointer
                ${isSelected ? 'border-blue-500 shadow-md' : 'border-gray-200 hover:shadow-md hover:border-gray-300'}
              `}
              onClick={() => onSelectRow(row.id, !isSelected)}
            >
              {/* Cover image placeholder */}
              {coverField && (
                <div className="h-32 bg-gradient-to-br from-gray-100 to-gray-200 rounded-t-lg flex items-center justify-center">
                  <span className="text-4xl opacity-50">🖼️</span>
                </div>
              )}
              
              {/* Card content */}
              <div className="p-4 space-y-2">
                {columns.slice(0, 3).map(col => {
                  const value = row.cells[col.id];
                  if (!value) return null;
                  
                  return (
                    <div key={col.id} className="text-sm">
                      <span className="font-medium text-gray-600">{col.name}:</span>
                      <span className="ml-2 text-gray-900">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
              
              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {rows.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No items to display
        </div>
      )}
    </div>
  );
});