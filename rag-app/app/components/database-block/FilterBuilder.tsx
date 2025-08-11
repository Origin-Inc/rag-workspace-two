import { useState, memo } from 'react';
import type { DatabaseColumn, Filter, FilterOperator } from '~/types/database-block';
import { cn } from '~/utils/cn';

interface FilterBuilderProps {
  columns: DatabaseColumn[];
  filters: Filter[];
  onApply: (filters: Filter[]) => void;
  onCancel: () => void;
}

export const FilterBuilder = memo(function FilterBuilder({
  columns,
  filters: initialFilters,
  onApply,
  onCancel
}: FilterBuilderProps) {
  const [filters, setFilters] = useState<Filter[]>(
    initialFilters.length > 0 ? initialFilters : [{
      id: crypto.randomUUID(),
      columnId: columns[0]?.columnId || '',
      operator: 'contains',
      value: ''
    }]
  );

  const operators: { value: FilterOperator; label: string }[] = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Does not contain' },
    { value: 'starts_with', label: 'Starts with' },
    { value: 'ends_with', label: 'Ends with' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'is_not_empty', label: 'Is not empty' },
    { value: 'greater_than', label: 'Greater than' },
    { value: 'greater_than_or_equal', label: 'Greater than or equal' },
    { value: 'less_than', label: 'Less than' },
    { value: 'less_than_or_equal', label: 'Less than or equal' }
  ];

  const getOperatorsForColumn = (column: DatabaseColumn): FilterOperator[] => {
    switch (column.type) {
      case 'number':
      case 'currency':
      case 'percent':
      case 'rating':
        return ['equals', 'not_equals', 'greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal', 'is_empty', 'is_not_empty'];
      
      case 'date':
      case 'datetime':
      case 'created_time':
      case 'updated_time':
        return ['equals', 'not_equals', 'is_before', 'is_after', 'is_empty', 'is_not_empty'];
      
      case 'checkbox':
        return ['equals', 'not_equals'];
      
      case 'select':
      case 'multi_select':
        return ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty'];
      
      default:
        return ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'];
    }
  };

  const addFilter = () => {
    setFilters([...filters, {
      id: crypto.randomUUID(),
      columnId: columns[0]?.columnId || '',
      operator: 'contains',
      value: '',
      conjunction: 'and'
    }]);
  };

  const updateFilter = (index: number, updates: Partial<Filter>) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], ...updates };
    setFilters(newFilters);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const handleApply = () => {
    const validFilters = filters.filter(f => 
      f.columnId && 
      f.operator && 
      (f.operator === 'is_empty' || f.operator === 'is_not_empty' || f.value !== '')
    );
    onApply(validFilters);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700">Filters</h3>
        <button
          onClick={addFilter}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          + Add Filter
        </button>
      </div>

      <div className="space-y-2">
        {filters.map((filter, index) => {
          const column = columns.find(c => c.columnId === filter.columnId);
          const availableOperators = column ? getOperatorsForColumn(column) : [];

          return (
            <div key={filter.id} className="flex items-center space-x-2">
              {index > 0 && (
                <select
                  value={filter.conjunction || 'and'}
                  onChange={(e) => updateFilter(index, { conjunction: e.target.value as 'and' | 'or' })}
                  className="px-2 py-1 text-sm border border-gray-300 rounded"
                >
                  <option value="and">AND</option>
                  <option value="or">OR</option>
                </select>
              )}
              
              <select
                value={filter.columnId}
                onChange={(e) => updateFilter(index, { columnId: e.target.value })}
                className="px-3 py-1 text-sm border border-gray-300 rounded flex-1"
              >
                {columns.map(col => (
                  <option key={col.columnId} value={col.columnId}>
                    {col.name}
                  </option>
                ))}
              </select>

              <select
                value={filter.operator}
                onChange={(e) => updateFilter(index, { operator: e.target.value as FilterOperator })}
                className="px-3 py-1 text-sm border border-gray-300 rounded"
              >
                {operators
                  .filter(op => availableOperators.includes(op.value))
                  .map(op => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
              </select>

              {filter.operator !== 'is_empty' && filter.operator !== 'is_not_empty' && (
                <input
                  type="text"
                  value={filter.value || ''}
                  onChange={(e) => updateFilter(index, { value: e.target.value })}
                  placeholder="Value"
                  className="px-3 py-1 text-sm border border-gray-300 rounded flex-1"
                />
              )}

              <button
                onClick={() => removeFilter(index)}
                className="p-1 text-red-600 hover:bg-red-50 rounded"
              >
                ×
              </button>
            </div>
          );
        })}
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
          Apply Filters
        </button>
      </div>
    </div>
  );
});