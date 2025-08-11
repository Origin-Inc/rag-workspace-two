import { useState, memo } from 'react';
import type { DatabaseColumn, Sort } from '~/types/database-block';

interface SortBuilderProps {
  columns: DatabaseColumn[];
  sorts: Sort[];
  onApply: (sorts: Sort[]) => void;
  onCancel: () => void;
}

export const SortBuilder = memo(function SortBuilder({
  columns,
  sorts: initialSorts,
  onApply,
  onCancel
}: SortBuilderProps) {
  const [sorts, setSorts] = useState<Sort[]>(
    initialSorts.length > 0 ? initialSorts : [{
      columnId: columns[0]?.columnId || '',
      direction: 'asc',
      priority: 0
    }]
  );

  const addSort = () => {
    setSorts([...sorts, {
      columnId: columns[0]?.columnId || '',
      direction: 'asc',
      priority: sorts.length
    }]);
  };

  const updateSort = (index: number, updates: Partial<Sort>) => {
    const newSorts = [...sorts];
    newSorts[index] = { ...newSorts[index], ...updates };
    setSorts(newSorts);
  };

  const removeSort = (index: number) => {
    const newSorts = sorts.filter((_, i) => i !== index);
    // Update priorities
    newSorts.forEach((sort, i) => {
      sort.priority = i;
    });
    setSorts(newSorts);
  };

  const moveSort = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sorts.length - 1) return;

    const newSorts = [...sorts];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap sorts
    [newSorts[index], newSorts[targetIndex]] = [newSorts[targetIndex], newSorts[index]];
    
    // Update priorities
    newSorts.forEach((sort, i) => {
      sort.priority = i;
    });
    
    setSorts(newSorts);
  };

  const handleApply = () => {
    const validSorts = sorts.filter(s => s.columnId);
    onApply(validSorts);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700">Sort</h3>
        <button
          onClick={addSort}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          + Add Sort
        </button>
      </div>

      <div className="space-y-2">
        {sorts.map((sort, index) => (
          <div key={index} className="flex items-center space-x-2">
            <div className="flex flex-col">
              <button
                onClick={() => moveSort(index, 'up')}
                disabled={index === 0}
                className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ▲
              </button>
              <button
                onClick={() => moveSort(index, 'down')}
                disabled={index === sorts.length - 1}
                className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ▼
              </button>
            </div>

            <span className="text-sm text-gray-500 w-8">
              {index + 1}.
            </span>
            
            <select
              value={sort.columnId}
              onChange={(e) => updateSort(index, { columnId: e.target.value })}
              className="px-3 py-1 text-sm border border-gray-300 rounded flex-1"
            >
              {columns.map(col => (
                <option key={col.columnId} value={col.columnId}>
                  {col.name}
                </option>
              ))}
            </select>

            <select
              value={sort.direction}
              onChange={(e) => updateSort(index, { direction: e.target.value as 'asc' | 'desc' })}
              className="px-3 py-1 text-sm border border-gray-300 rounded"
            >
              <option value="asc">Ascending (↑)</option>
              <option value="desc">Descending (↓)</option>
            </select>

            <button
              onClick={() => removeSort(index)}
              className="p-1 text-red-600 hover:bg-red-50 rounded"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end space-x-2 pt-3 border-t">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Apply Sort
        </button>
      </div>
    </div>
  );
});