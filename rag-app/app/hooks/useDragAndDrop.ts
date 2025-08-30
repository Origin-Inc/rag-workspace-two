import { useRef, useState, useCallback, useEffect } from 'react';
import { useDrag, useDrop, DragSourceMonitor, DropTargetMonitor } from 'react-dnd';

export interface DragItem {
  id: string;
  type: string;
  index?: number;
  data?: any;
}

export interface DropResult {
  targetId: string;
  targetIndex?: number;
  targetType?: string;
}

interface UseDragAndDropOptions {
  type: string;
  onDrop?: (item: DragItem, result: DropResult) => void;
  onHover?: (item: DragItem, monitor: DragSourceMonitor) => void;
  canDrag?: (item: DragItem) => boolean;
  canDrop?: (item: DragItem, monitor: DropTargetMonitor) => boolean;
  collect?: (monitor: DragSourceMonitor | DropTargetMonitor) => any;
}

export function useDraggable(
  item: DragItem,
  options: UseDragAndDropOptions = { type: 'DEFAULT' }
) {
  const { type, onDrop, canDrag, collect } = options;
  
  const [{ isDragging, ...collected }, drag, preview] = useDrag({
    type,
    item,
    canDrag: canDrag ? () => canDrag(item) : undefined,
    end: (draggedItem, monitor) => {
      const dropResult = monitor.getDropResult() as DropResult | null;
      if (dropResult && onDrop) {
        onDrop(draggedItem, dropResult);
      }
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
      ...(collect ? collect(monitor) : {})
    })
  });

  return {
    drag,
    preview,
    isDragging,
    ...collected
  };
}

export function useDroppable(
  targetId: string,
  options: UseDragAndDropOptions = { type: 'DEFAULT' }
) {
  const { type, onDrop, canDrop, collect } = options;
  
  const [{ isOver, canDropHere, ...collected }, drop] = useDrop({
    accept: type,
    canDrop: canDrop ? (item, monitor) => canDrop(item as DragItem, monitor) : undefined,
    drop: (item: DragItem, monitor) => {
      if (monitor.didDrop()) {
        return;
      }
      
      const result: DropResult = {
        targetId,
        targetType: type
      };
      
      if (onDrop) {
        onDrop(item, result);
      }
      
      return result;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDropHere: monitor.canDrop(),
      ...(collect ? collect(monitor) : {})
    })
  });

  return {
    drop,
    isOver,
    canDropHere,
    ...collected
  };
}

// Hook for sortable lists (drag to reorder)
export function useSortable(
  items: any[],
  onReorder: (dragIndex: number, hoverIndex: number) => void,
  itemType = 'SORTABLE_ITEM'
) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const moveItem = useCallback((dragIndex: number, hoverIndex: number) => {
    if (dragIndex === hoverIndex) return;
    onReorder(dragIndex, hoverIndex);
  }, [onReorder]);

  const createDraggableItem = useCallback((item: any, index: number) => {
    return {
      id: item.id || index.toString(),
      type: itemType,
      index,
      data: item
    };
  }, [itemType]);

  const useSortableItem = (item: any, index: number) => {
    const ref = useRef<HTMLDivElement>(null);
    const dragItem = createDraggableItem(item, index);

    const [{ isDragging }, drag] = useDrag({
      type: itemType,
      item: dragItem,
      collect: (monitor) => ({
        isDragging: monitor.isDragging()
      }),
      begin: () => {
        setDraggedIndex(index);
      },
      end: () => {
        setDraggedIndex(null);
      }
    });

    const [{ isOver }, drop] = useDrop({
      accept: itemType,
      hover: (draggedItem: DragItem, monitor) => {
        if (!ref.current || draggedItem.index === undefined) {
          return;
        }

        const dragIndex = draggedItem.index;
        const hoverIndex = index;

        if (dragIndex === hoverIndex) {
          return;
        }

        const hoverBoundingRect = ref.current.getBoundingClientRect();
        const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
        const clientOffset = monitor.getClientOffset();
        
        if (!clientOffset) return;
        
        const hoverClientY = clientOffset.y - hoverBoundingRect.top;

        // Only perform the move when the mouse has crossed half of the item's height
        if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
          return;
        }
        if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
          return;
        }

        moveItem(dragIndex, hoverIndex);
        draggedItem.index = hoverIndex;
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true })
      })
    });

    drag(drop(ref));

    return {
      ref,
      isDragging,
      isOver
    };
  };

  return {
    draggedIndex,
    useSortableItem
  };
}

// Hook for drag selection (multiple items)
export function useDragSelection<T extends { id: string }>(
  items: T[],
  initialSelection: Set<string> = new Set()
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(initialSelection);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);

  const selectItem = useCallback((id: string, multiSelect = false, shiftSelect = false) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      
      if (shiftSelect && lastSelectedId) {
        // Select range between last selected and current
        const startIndex = items.findIndex(item => item.id === lastSelectedId);
        const endIndex = items.findIndex(item => item.id === id);
        
        if (startIndex !== -1 && endIndex !== -1) {
          const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          for (let i = start; i <= end; i++) {
            next.add(items[i].id);
          }
        }
      } else if (multiSelect) {
        // Toggle selection
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      } else {
        // Single selection
        next.clear();
        next.add(id);
      }
      
      return next;
    });
    
    setLastSelectedId(id);
  }, [items, lastSelectedId]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map(item => item.id)));
  }, [items]);

  const isSelected = useCallback((id: string) => {
    return selectedIds.has(id);
  }, [selectedIds]);

  // Drag selection handlers
  const startDragSelection = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    
    setIsDragSelecting(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragEnd({ x: e.clientX, y: e.clientY });
    
    // Clear selection if not holding modifier key
    if (!e.ctrlKey && !e.metaKey) {
      clearSelection();
    }
  }, [clearSelection]);

  const updateDragSelection = useCallback((e: React.MouseEvent) => {
    if (!isDragSelecting || !dragStart) return;
    
    setDragEnd({ x: e.clientX, y: e.clientY });
  }, [isDragSelecting, dragStart]);

  const endDragSelection = useCallback(() => {
    setIsDragSelecting(false);
    setDragStart(null);
    setDragEnd(null);
  }, []);

  // Calculate selection box
  const selectionBox = dragStart && dragEnd ? {
    left: Math.min(dragStart.x, dragEnd.x),
    top: Math.min(dragStart.y, dragEnd.y),
    width: Math.abs(dragEnd.x - dragStart.x),
    height: Math.abs(dragEnd.y - dragStart.y)
  } : null;

  return {
    selectedIds,
    isSelected,
    selectItem,
    clearSelection,
    selectAll,
    isDragSelecting,
    selectionBox,
    startDragSelection,
    updateDragSelection,
    endDragSelection
  };
}

// Hook for auto-scrolling during drag
export function useAutoScroll(
  containerRef: React.RefObject<HTMLElement>,
  options: {
    scrollSpeed?: number;
    scrollZone?: number;
    enabled?: boolean;
  } = {}
) {
  const { scrollSpeed = 10, scrollZone = 50, enabled = true } = options;
  const scrollInterval = useRef<NodeJS.Timeout | null>(null);

  const startAutoScroll = useCallback((clientY: number) => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    // Clear existing interval
    if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
      scrollInterval.current = null;
    }

    // Check if near edges
    const nearTop = clientY - rect.top < scrollZone;
    const nearBottom = rect.bottom - clientY < scrollZone;

    if (nearTop || nearBottom) {
      scrollInterval.current = setInterval(() => {
        if (nearTop) {
          container.scrollTop -= scrollSpeed;
        } else {
          container.scrollTop += scrollSpeed;
        }
      }, 16); // ~60fps
    }
  }, [containerRef, enabled, scrollSpeed, scrollZone]);

  const stopAutoScroll = useCallback(() => {
    if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
      scrollInterval.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopAutoScroll();
  }, [stopAutoScroll]);

  return {
    startAutoScroll,
    stopAutoScroll
  };
}