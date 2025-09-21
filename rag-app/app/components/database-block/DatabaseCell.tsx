import { useState, useEffect, useRef, memo } from 'react';
import type { DatabaseColumn } from '~/types/database-block';
import { ColumnValidator } from '~/types/database-block';
import { cn } from '~/utils/cn';

interface DatabaseCellProps {
  column: DatabaseColumn;
  value: any;
  isEditing?: boolean;
  editingUser?: string;
  onStartEdit: () => void;
  onUpdate: (value: any) => void;
}

export const DatabaseCell = memo(function DatabaseCell({
  column,
  value,
  isEditing,
  editingUser,
  onStartEdit,
  onUpdate
}: DatabaseCellProps) {
  const [localValue, setLocalValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  const handleSave = () => {
    const validation = ColumnValidator.validateValue(column, localValue);
    if (!validation.valid) {
      setError(validation.error || 'Invalid value');
      return;
    }
    setError(null);
    onUpdate(localValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setLocalValue(value);
      setError(null);
      onUpdate(value); // This will end editing mode
    }
  };

  const renderEditor = () => {
    switch (column.type) {
      case 'text':
      case 'url':
      case 'email':
      case 'phone':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={column.type === 'email' ? 'email' : column.type === 'url' ? 'url' : 'text'}
            value={localValue || ''}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className={cn(
              'w-full h-full px-2 py-1 border-2 border-blue-500 outline-none',
              error && 'border-red-500'
            )}
          />
        );

      case 'number':
      case 'currency':
      case 'percent':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="number"
            value={localValue || ''}
            onChange={(e) => setLocalValue(e.target.valueAsNumber)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            step={column.options?.precision ? Math.pow(10, -column.options.precision) : 1}
            className={cn(
              'w-full h-full px-2 py-1 border-2 border-blue-500 outline-none',
              error && 'border-red-500'
            )}
          />
        );

      case 'date':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="date"
            value={localValue ? new Date(localValue).toISOString().split('T')[0] : ''}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className={cn(
              'w-full h-full px-2 py-1 border-2 border-blue-500 outline-none',
              error && 'border-red-500'
            )}
          />
        );

      case 'datetime':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="datetime-local"
            value={localValue ? new Date(localValue).toISOString().slice(0, -1) : ''}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className={cn(
              'w-full h-full px-2 py-1 border-2 border-blue-500 outline-none',
              error && 'border-red-500'
            )}
          />
        );

      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={!!localValue}
            onChange={(e) => {
              setLocalValue(e.target.checked);
              onUpdate(e.target.checked);
            }}
            className="w-4 h-4"
          />
        );

      case 'select':
        return (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={localValue || ''}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className={cn(
              'w-full h-full px-2 py-1 border-2 border-blue-500 outline-none',
              error && 'border-red-500'
            )}
          >
            <option value="">--</option>
            {column.options?.choices?.map((choice) => (
              <option key={choice.id} value={choice.value}>
                {choice.value}
              </option>
            ))}
          </select>
        );

      case 'multi_select':
        return (
          <div className="flex flex-wrap gap-1 p-1">
            {column.options?.choices?.map((choice) => {
              const isSelected = Array.isArray(localValue) && localValue.includes(choice.value);
              return (
                <button
                  key={choice.id}
                  onClick={() => {
                    const current = Array.isArray(localValue) ? localValue : [];
                    const next = isSelected
                      ? current.filter(v => v !== choice.value)
                      : [...current, choice.value];
                    setLocalValue(next);
                  }}
                  className={cn(
                    'px-2 py-0.5 text-xs rounded',
                    isSelected
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  )}
                >
                  {choice.value}
                </button>
              );
            })}
          </div>
        );

      case 'rating':
        const maxRating = column.options?.maxRating || 5;
        return (
          <div className="flex items-center space-x-1 px-2">
            {Array.from({ length: maxRating }, (_, i) => i + 1).map((rating) => (
              <button
                key={rating}
                onClick={() => {
                  setLocalValue(rating === localValue ? 0 : rating);
                  onUpdate(rating === localValue ? 0 : rating);
                }}
                className="text-lg"
              >
                {rating <= (localValue || 0) ? '⭐' : '☆'}
              </button>
            ))}
          </div>
        );

      default:
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={localValue || ''}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className={cn(
              'w-full h-full px-2 py-1 border-2 border-blue-500 outline-none',
              error && 'border-red-500'
            )}
          />
        );
    }
  };

  const renderDisplay = () => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-gray-400">--</span>;
    }

    switch (column.type) {
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => {
              onStartEdit();
              onUpdate(e.target.checked);
            }}
            className="w-4 h-4"
          />
        );

      case 'select':
        const selectedOption = column.options?.choices?.find(c => c.value === value);
        if (selectedOption?.color) {
          return (
            <span
              className="px-2 py-0.5 text-xs rounded"
              style={{
                backgroundColor: `${selectedOption.color}20`,
                color: selectedOption.color
              }}
            >
              {selectedOption.value}
            </span>
          );
        }
        return <span>{value}</span>;

      case 'multi_select':
        if (!Array.isArray(value)) return <span>{value}</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {value.map((v) => {
              const option = column.options?.choices?.find(c => c.value === v);
              if (option?.color) {
                return (
                  <span
                    key={v}
                    className="px-2 py-0.5 text-xs rounded"
                    style={{
                      backgroundColor: `${option.color}20`,
                      color: option.color
                    }}
                  >
                    {v}
                  </span>
                );
              }
              return (
                <span key={v} className="px-2 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  {v}
                </span>
              );
            })}
          </div>
        );

      case 'currency':
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: column.options?.precision || 2,
          maximumFractionDigits: column.options?.precision || 2
        }).format(value);
        return <span>{column.options?.prefix}{formatted}{column.options?.suffix}</span>;

      case 'percent':
        return <span>{value}%</span>;

      case 'rating':
        const maxRating = column.options?.maxRating || 5;
        return (
          <div className="flex items-center">
            {Array.from({ length: maxRating }, (_, i) => i + 1).map((rating) => (
              <span key={rating} className="text-sm">
                {rating <= value ? '⭐' : '☆'}
              </span>
            ))}
          </div>
        );

      case 'date':
        return <span>{new Date(value).toLocaleDateString()}</span>;

      case 'datetime':
        return <span>{new Date(value).toLocaleString()}</span>;

      case 'url':
        return (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {value}
          </a>
        );

      case 'email':
        return (
          <a
            href={`mailto:${value}`}
            className="text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {value}
          </a>
        );

      case 'created_time':
      case 'updated_time':
        return <span className="text-xs text-gray-500">{new Date(value).toLocaleString()}</span>;

      case 'created_by':
      case 'updated_by':
      case 'user':
        return (
          <div className="flex items-center space-x-1">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">
              {value.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm">{value}</span>
          </div>
        );

      default:
        return <span>{String(value)}</span>;
    }
  };

  return (
    <div
      className={cn(
        'h-full flex items-center px-2 py-1 cursor-pointer relative',
        isEditing && 'ring-2 ring-blue-500',
        editingUser && !isEditing && 'ring-1 ring-yellow-400'
      )}
      onClick={() => {
        if (!isEditing && !column.isLocked && column.type !== 'checkbox') {
          onStartEdit();
        }
      }}
    >
      {isEditing ? renderEditor() : renderDisplay()}
      {error && (
        <div className="absolute top-full left-0 mt-1 bg-red-500 text-white text-xs px-2 py-1 rounded z-50">
          {error}
        </div>
      )}
      {editingUser && !isEditing && (
        <div className="absolute -top-6 left-0 bg-yellow-400 dark:bg-yellow-600 text-black dark:text-white text-xs px-2 py-1 rounded">
          {editingUser} is editing
        </div>
      )}
    </div>
  );
});