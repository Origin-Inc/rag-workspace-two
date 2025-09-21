import { useState, useRef, useEffect, memo } from 'react';
import type { DatabaseColumn, Sort } from '~/types/database-block';
import { cn } from '~/utils/cn';

interface ColumnHeaderProps {
  column: DatabaseColumn;
  sort?: Sort;
  onSort: (direction: 'asc' | 'desc' | null) => void;
  onUpdateColumn: (updates: Partial<DatabaseColumn>) => void;
  onDeleteColumn: () => void;
  onResize: (width: number) => void;
}

export const ColumnHeader = memo(function ColumnHeader({
  column,
  sort,
  onSort,
  onUpdateColumn,
  onDeleteColumn,
  onResize
}: ColumnHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localName, setLocalName] = useState(column.name);
  const [showMenu, setShowMenu] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleSort = () => {
    if (!sort) {
      onSort('asc');
    } else if (sort.direction === 'asc') {
      onSort('desc');
    } else {
      onSort(null);
    }
  };

  const handleRename = () => {
    if (localName !== column.name) {
      onUpdateColumn({ name: localName });
    }
    setIsEditing(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = column.width;
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(50, startWidth.current + diff);
      onResize(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onResize]);

  const getColumnIcon = () => {
    switch (column.type) {
      case 'text': return '📝';
      case 'number': return '🔢';
      case 'date': return '📅';
      case 'datetime': return '🕐';
      case 'select': return '📋';
      case 'multi_select': return '🏷️';
      case 'checkbox': return '☑️';
      case 'url': return '🔗';
      case 'email': return '✉️';
      case 'phone': return '📞';
      case 'currency': return '💰';
      case 'percent': return '%';
      case 'rating': return '⭐';
      case 'user': return '👤';
      case 'file': return '📎';
      case 'formula': return 'ƒ';
      case 'rollup': return '🔄';
      case 'lookup': return '🔍';
      default: return '📝';
    }
  };

  return (
    <div
      className={cn(
        'h-full flex items-center justify-between px-2 border-r border-gray-200 bg-gray-50 group relative',
        column.isPrimary && 'font-semibold'
      )}
    >
      <div className="flex items-center space-x-2 flex-1 min-w-0">
        <span className="text-xs">{getColumnIcon()}</span>
        
        {isEditing ? (
          <input
            type="text"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') {
                setLocalName(column.name);
                setIsEditing(false);
              }
            }}
            className="flex-1 px-1 py-0.5 text-sm border border-blue-500 rounded outline-none"
            autoFocus
          />
        ) : (
          <span
            className="flex-1 text-sm truncate cursor-pointer"
            onDoubleClick={() => !column.isLocked && setIsEditing(true)}
          >
            {column.name}
          </span>
        )}

        {column.isRequired && <span className="text-red-500 text-xs">*</span>}
        {column.isUnique && <span className="text-blue-500 text-xs">U</span>}
        {column.isLocked && <span className="text-gray-500 text-xs">🔒</span>}
      </div>

      <div className="flex items-center space-x-1">
        {/* Sort indicator */}
        <button
          onClick={handleSort}
          className={cn(
            'p-1 rounded hover:bg-gray-200',
            sort && 'text-blue-600'
          )}
          title="Sort"
        >
          {sort?.direction === 'asc' ? '↑' : sort?.direction === 'desc' ? '↓' : '↕'}
        </button>

        {/* Column menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-100"
          >
            ⋮
          </button>

          {showMenu && (
            <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 w-48">
              <button
                onClick={() => {
                  setIsEditing(true);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                disabled={column.isLocked}
              >
                Rename
              </button>
              
              <button
                onClick={() => {
                  onUpdateColumn({ isHidden: true });
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
              >
                Hide
              </button>

              <button
                onClick={() => {
                  onUpdateColumn({ isRequired: !column.isRequired });
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                disabled={column.isLocked}
              >
                {column.isRequired ? 'Make Optional' : 'Make Required'}
              </button>

              <button
                onClick={() => {
                  onUpdateColumn({ isUnique: !column.isUnique });
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                disabled={column.isLocked}
              >
                {column.isUnique ? 'Remove Unique' : 'Make Unique'}
              </button>

              <hr className="my-1" />

              <button
                onClick={() => {
                  if (confirm(`Delete column "${column.name}"?`)) {
                    onDeleteColumn();
                  }
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                disabled={column.isPrimary || column.isLocked}
              >
                Delete Column
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Resize handle */}
      <div
        ref={resizeRef}
        onMouseDown={handleMouseDown}
        className={cn(
          'absolute right-0 top-0 h-full cursor-col-resize hover:bg-blue-500',
          isResizing && 'bg-blue-500'
        )}
      />
    </div>
  );
});