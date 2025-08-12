import { useEffect, useRef, memo } from 'react';

interface RowContextMenuProps {
  rowId: string;
  x: number;
  y: number;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const RowContextMenu = memo(function RowContextMenu({
  rowId,
  x,
  y,
  onDuplicate,
  onDelete,
  onClose
}: RowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 150);

  return (
    <div
      ref={menuRef}
      className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[150px]"
      style={{
        left: `${adjustedX}px`,
        top: `${adjustedY}px`
      }}
    >
      <button
        onClick={onDuplicate}
        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center space-x-2"
      >
        <span>📋</span>
        <span>Duplicate Row</span>
      </button>
      
      <hr className="my-1" />
      
      <button
        onClick={onDelete}
        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
      >
        <span>🗑️</span>
        <span>Delete Row</span>
      </button>
    </div>
  );
});