import { useState, useEffect, useCallback } from 'react';
import { cn } from '~/utils/cn';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export function ResizeHandle({ 
  onResize, 
  orientation = 'vertical',
  className 
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartX(e.clientX);
    setStartY(e.clientY);
    document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [orientation]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (orientation === 'vertical') {
        const delta = e.clientX - startX;
        if (Math.abs(delta) > 0) {
          onResize(delta);
          setStartX(e.clientX);
        }
      } else {
        const delta = e.clientY - startY;
        if (Math.abs(delta) > 0) {
          onResize(delta);
          setStartY(e.clientY);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startX, startY, onResize, orientation]);

  return (
    <div
      className={cn(
        "group relative",
        orientation === 'vertical' 
          ? "w-1 h-full cursor-col-resize" 
          : "h-1 w-full cursor-row-resize",
        "hover:bg-blue-500 hover:opacity-50 transition-all",
        isDragging && "bg-blue-500 opacity-50",
        className
      )}
      onMouseDown={handleMouseDown}
    >
      {/* Visual indicator */}
      <div className={cn(
        "absolute",
        orientation === 'vertical' 
          ? "inset-y-0 left-1/2 -translate-x-1/2 w-1" 
          : "inset-x-0 top-1/2 -translate-y-1/2 h-1",
        "bg-gray-300 dark:bg-gray-600",
        "group-hover:bg-blue-500 transition-colors",
        isDragging && "bg-blue-500"
      )} />
      
      {/* Larger hit area for easier grabbing */}
      <div className={cn(
        "absolute",
        orientation === 'vertical' 
          ? "inset-y-0 -left-1 -right-1" 
          : "inset-x-0 -top-1 -bottom-1"
      )} />
    </div>
  );
}