import { useState, memo } from 'react';
import type {
  DatabaseBlock,
  DatabaseColumn,
  Filter,
  Sort,
  DatabaseColumnType
} from '~/types/database-block';
import { FilterBuilder } from './FilterBuilder';
import { SortBuilder } from './SortBuilder';
import { cn } from '~/utils/cn';

interface DatabaseToolbarProps {
  databaseBlock: DatabaseBlock | null;
  columns: DatabaseColumn[];
  filters: Filter[];
  sorts: Sort[];
  selectedRows: Set<string>;
  onAddRow: () => void;
  onAddColumn: (column: Partial<DatabaseColumn>) => void;
  onApplyFilters: (filters: Filter[]) => void;
  onApplySorts: (sorts: Sort[]) => void;
  onDeleteSelected: () => void;
}

export const DatabaseToolbar = memo(function DatabaseToolbar({
  databaseBlock,
  columns,
  filters,
  sorts,
  selectedRows,
  onAddRow,
  onAddColumn,
  onApplyFilters,
  onApplySorts,
  onDeleteSelected
}: DatabaseToolbarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [showSorts, setShowSorts] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<DatabaseColumnType>('text');

  const handleAddColumn = () => {
    if (newColumnName) {
      onAddColumn({
        name: newColumnName,
        type: newColumnType,
        width: 150
      });
      setNewColumnName('');
      setNewColumnType('text');
      setShowAddColumn(false);
    }
  };

  const columnTypes: { value: DatabaseColumnType; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'datetime', label: 'Date & Time' },
    { value: 'select', label: 'Select' },
    { value: 'multi_select', label: 'Multi-select' },
    { value: 'checkbox', label: 'Checkbox' },
    { value: 'url', label: 'URL' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'currency', label: 'Currency' },
    { value: 'percent', label: 'Percent' },
    { value: 'rating', label: 'Rating' },
    { value: 'user', label: 'User' },
    { value: 'file', label: 'File' },
    { value: 'formula', label: 'Formula' },
    { value: 'created_time', label: 'Created Time' },
    { value: 'updated_time', label: 'Updated Time' },
    { value: 'created_by', label: 'Created By' },
    { value: 'updated_by', label: 'Updated By' }
  ];

  return (
    <div className="border-b border-gray-200 bg-white">
      {/* Main toolbar */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center space-x-2">
          {/* Database name */}
          <h2 className="text-lg font-semibold">
            {databaseBlock?.name || 'Database'}
          </h2>
          
          {/* Row count */}
          <span className="text-sm text-gray-500">
            {databaseBlock?.rowCount || 0} rows
          </span>
          
          {/* Column count */}
          <span className="text-sm text-gray-500">
            {columns.length} columns
          </span>

          {/* Selected count */}
          {selectedRows.size > 0 && (
            <span className="text-sm text-blue-600">
              {selectedRows.size} selected
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Delete selected */}
          {selectedRows.size > 0 && (
            <button
              onClick={onDeleteSelected}
              className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
            >
              Delete Selected
            </button>
          )}

          {/* Filter button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'px-3 py-1 text-sm rounded flex items-center space-x-1',
              filters.length > 0
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            <span>🎯</span>
            <span>Filter</span>
            {filters.length > 0 && (
              <span className="bg-blue-600 text-white text-xs px-1 rounded">
                {filters.length}
              </span>
            )}
          </button>

          {/* Sort button */}
          <button
            onClick={() => setShowSorts(!showSorts)}
            className={cn(
              'px-3 py-1 text-sm rounded flex items-center space-x-1',
              sorts.length > 0
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            <span>↕</span>
            <span>Sort</span>
            {sorts.length > 0 && (
              <span className="bg-blue-600 text-white text-xs px-1 rounded">
                {sorts.length}
              </span>
            )}
          </button>

          {/* Add column button */}
          <button
            onClick={() => setShowAddColumn(!showAddColumn)}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded"
          >
            + Column
          </button>

          {/* Add row button */}
          <button
            onClick={onAddRow}
            className="px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded"
          >
            + New Row
          </button>
        </div>
      </div>

      {/* Filter builder */}
      {showFilters && (
        <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
          <FilterBuilder
            columns={columns}
            filters={filters}
            onApply={(newFilters) => {
              onApplyFilters(newFilters);
              setShowFilters(false);
            }}
            onCancel={() => setShowFilters(false)}
          />
        </div>
      )}

      {/* Sort builder */}
      {showSorts && (
        <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
          <SortBuilder
            columns={columns}
            sorts={sorts}
            onApply={(newSorts) => {
              onApplySorts(newSorts);
              setShowSorts(false);
            }}
            onCancel={() => setShowSorts(false)}
          />
        </div>
      )}

      {/* Add column form */}
      {showAddColumn && (
        <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
          <div className="flex items-end space-x-2">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Column Name
              </label>
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Enter column name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={newColumnType}
                onChange={(e) => setNewColumnType(e.target.value as DatabaseColumnType)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {columnTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAddColumn}
              disabled={!newColumnName}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Column
            </button>

            <button
              onClick={() => {
                setShowAddColumn(false);
                setNewColumnName('');
                setNewColumnType('text');
              }}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
});