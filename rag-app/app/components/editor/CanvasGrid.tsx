import { useRef, useState, useCallback, useEffect, memo } from "react";
import { 
  DndContext, 
  DragEndEvent, 
  DragStartEvent,
  DragMoveEvent,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  rectIntersection,
  MeasuringStrategy,
  type CollisionDetection,
} from "@dnd-kit/core";
import { 
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToWindowEdges } from "@dnd-kit/modifiers";
import type { Block, BlockPosition } from "~/types/blocks";
import { BlockRenderer } from "./BlockRenderer";
import { GridOverlay } from "./GridOverlay";
import { SelectionOverlay } from "./SelectionOverlay";
import { cn } from "~/utils/cn";

interface CanvasGridProps {
  blocks: Block[];
  pageId: string;
  canvasSettings: {
    grid: {
      columns: number;
      rowHeight: number;
      gap: number;
      maxWidth: number;
    };
    snapToGrid: boolean;
    showGrid: boolean;
    autoArrange: boolean;
  };
  editorSettings: {
    showBlockHandles: boolean;
    enableSlashCommands: boolean;
    enableMarkdown: boolean;
  };
  isEditable?: boolean;
  onBlockUpdate: (blockId: string, updates: Partial<Block>) => void;
  onBlockCreate: (block: Partial<Block>) => void;
  onBlockDelete: (blockId: string) => void;
  onBlockMove: (blockId: string, position: BlockPosition) => void;
  onBlocksReorder: (blockIds: string[], positions: BlockPosition[]) => void;
  selectedBlocks?: string[];
  onBlockSelect: (blockId: string, multiSelect?: boolean) => void;
  onBlocksSelect: (blockIds: string[]) => void;
  onClearSelection: () => void;
}

interface DragData {
  blockId: string;
  startPosition: BlockPosition;
  currentPosition: BlockPosition;
  isNew?: boolean;
  blockType?: string;
}

const GRID_CELL_SIZE = 40; // Base cell size in pixels
const MIN_BLOCK_WIDTH = 2; // Minimum columns a block can span
const MIN_BLOCK_HEIGHT = 1; // Minimum rows a block can span

export const CanvasGrid = memo(function CanvasGrid({
  blocks,
  pageId,
  canvasSettings,
  editorSettings,
  isEditable = true,
  onBlockUpdate,
  onBlockCreate,
  onBlockDelete,
  onBlockMove,
  onBlocksReorder,
  selectedBlocks = [],
  onBlockSelect,
  onBlocksSelect,
  onClearSelection,
}: CanvasGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragData, setDragData] = useState<DragData | null>(null);
  const [ghostPosition, setGhostPosition] = useState<BlockPosition | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);

  const { grid, snapToGrid, showGrid, autoArrange } = canvasSettings;
  const { columns, rowHeight, gap, maxWidth } = grid;

  // Calculate grid dimensions
  const cellWidth = (maxWidth - gap * (columns - 1)) / columns;
  const gridHeight = Math.max(
    ...blocks.map(b => (b.position.y + b.position.height) * (rowHeight + gap)),
    600 // Minimum height
  );

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Snap position to grid
  const snapToGridPosition = useCallback((x: number, y: number): BlockPosition => {
    if (!snapToGrid) {
      return { x, y, width: MIN_BLOCK_WIDTH, height: MIN_BLOCK_HEIGHT };
    }

    const snappedX = Math.round(x / cellWidth) * cellWidth;
    const snappedY = Math.round(y / (rowHeight + gap)) * (rowHeight + gap);
    const gridX = Math.max(0, Math.min(columns - MIN_BLOCK_WIDTH, Math.floor(snappedX / cellWidth)));
    const gridY = Math.max(0, Math.floor(snappedY / (rowHeight + gap)));

    return {
      x: gridX,
      y: gridY,
      width: MIN_BLOCK_WIDTH,
      height: MIN_BLOCK_HEIGHT,
    };
  }, [snapToGrid, cellWidth, rowHeight, gap, columns]);

  // Check for collision with existing blocks
  const checkCollision = useCallback((position: BlockPosition, excludeId?: string): boolean => {
    return blocks.some(block => {
      if (block.id === excludeId) return false;
      
      const b1 = position;
      const b2 = block.position;
      
      return !(
        b1.x + b1.width <= b2.x ||
        b2.x + b2.width <= b1.x ||
        b1.y + b1.height <= b2.y ||
        b2.y + b2.height <= b1.y
      );
    });
  }, [blocks]);

  // Find free position for new block
  const findFreePosition = useCallback((width: number, height: number): BlockPosition => {
    let y = 0;
    let x = 0;
    
    while (true) {
      for (x = 0; x <= columns - width; x++) {
        const position = { x, y, width, height };
        if (!checkCollision(position)) {
          return position;
        }
      }
      y++;
      if (y > 100) break; // Safety limit
    }
    
    return { x: 0, y: 0, width, height };
  }, [columns, checkCollision]);

  // Auto-arrange blocks to remove gaps
  const autoArrangeBlocks = useCallback(() => {
    if (!autoArrange) return;

    const sortedBlocks = [...blocks].sort((a, b) => {
      if (a.position.y !== b.position.y) {
        return a.position.y - b.position.y;
      }
      return a.position.x - b.position.x;
    });

    const newPositions: BlockPosition[] = [];
    const occupiedCells = new Set<string>();

    sortedBlocks.forEach(block => {
      let bestY = 0;
      
      // Find the lowest available position
      for (let testY = 0; testY < 100; testY++) {
        let canPlace = true;
        
        for (let dx = 0; dx < block.position.width; dx++) {
          for (let dy = 0; dy < block.position.height; dy++) {
            const cellKey = `${block.position.x + dx},${testY + dy}`;
            if (occupiedCells.has(cellKey)) {
              canPlace = false;
              break;
            }
          }
          if (!canPlace) break;
        }
        
        if (canPlace) {
          bestY = testY;
          break;
        }
      }

      const newPosition = {
        ...block.position,
        y: bestY,
      };

      // Mark cells as occupied
      for (let dx = 0; dx < newPosition.width; dx++) {
        for (let dy = 0; dy < newPosition.height; dy++) {
          occupiedCells.add(`${newPosition.x + dx},${newPosition.y + dy}`);
        }
      }

      newPositions.push(newPosition);
    });

    // Apply new positions if changed
    const hasChanges = sortedBlocks.some((block, i) => 
      block.position.y !== newPositions[i].y
    );

    if (hasChanges) {
      onBlocksReorder(
        sortedBlocks.map(b => b.id),
        newPositions
      );
    }
  }, [blocks, autoArrange, onBlocksReorder]);

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const blockId = active.id as string;
    const block = blocks.find(b => b.id === blockId);
    
    if (block) {
      setIsDragging(true);
      setDragData({
        blockId,
        startPosition: block.position,
        currentPosition: block.position,
      });
    }
  }, [blocks]);

  // Handle drag move
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const { delta } = event;
    
    if (!dragData || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = delta.x / rect.width * columns;
    const y = delta.y / rect.height * (gridHeight / (rowHeight + gap));

    const newPosition = snapToGridPosition(
      dragData.startPosition.x + x,
      dragData.startPosition.y + y
    );

    setGhostPosition({
      ...newPosition,
      width: dragData.startPosition.width,
      height: dragData.startPosition.height,
    });

    setDragData({
      ...dragData,
      currentPosition: newPosition,
    });
  }, [dragData, columns, gridHeight, rowHeight, gap, snapToGridPosition]);

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!dragData) return;

    const finalPosition = ghostPosition || dragData.currentPosition;
    
    // Check for collisions
    if (!checkCollision(finalPosition, dragData.blockId)) {
      onBlockMove(dragData.blockId, finalPosition);
    }

    setIsDragging(false);
    setDragData(null);
    setGhostPosition(null);

    // Auto-arrange after move
    setTimeout(autoArrangeBlocks, 100);
  }, [dragData, ghostPosition, checkCollision, onBlockMove, autoArrangeBlocks]);

  // Handle selection box
  const handleSelectionStart = useCallback((e: React.MouseEvent) => {
    if (e.target !== containerRef.current) return;
    
    const rect = containerRef.current!.getBoundingClientRect();
    const start = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    setSelectionBox({ start, end: start });
    onClearSelection();
  }, [onClearSelection]);

  const handleSelectionMove = useCallback((e: React.MouseEvent) => {
    if (!selectionBox) return;

    const rect = containerRef.current!.getBoundingClientRect();
    setSelectionBox({
      ...selectionBox,
      end: {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      },
    });

    // Calculate selected blocks
    const minX = Math.min(selectionBox.start.x, e.clientX - rect.left);
    const maxX = Math.max(selectionBox.start.x, e.clientX - rect.left);
    const minY = Math.min(selectionBox.start.y, e.clientY - rect.top);
    const maxY = Math.max(selectionBox.start.y, e.clientY - rect.top);

    const selected = blocks.filter(block => {
      const blockX = block.position.x * cellWidth;
      const blockY = block.position.y * (rowHeight + gap);
      const blockRight = blockX + block.position.width * cellWidth;
      const blockBottom = blockY + block.position.height * (rowHeight + gap);

      return (
        blockX < maxX &&
        blockRight > minX &&
        blockY < maxY &&
        blockBottom > minY
      );
    });

    onBlocksSelect(selected.map(b => b.id));
  }, [selectionBox, blocks, cellWidth, rowHeight, gap, onBlocksSelect]);

  const handleSelectionEnd = useCallback(() => {
    setSelectionBox(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isEditable) return;

      // Delete selected blocks
      if ((e.key === "Delete" || e.key === "Backspace") && selectedBlocks.length > 0) {
        e.preventDefault();
        selectedBlocks.forEach(id => onBlockDelete(id));
        onClearSelection();
      }

      // Select all
      if (e.ctrlKey && e.key === "a") {
        e.preventDefault();
        onBlocksSelect(blocks.map(b => b.id));
      }

      // Clear selection
      if (e.key === "Escape") {
        e.preventDefault();
        onClearSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditable, selectedBlocks, blocks, onBlockDelete, onBlocksSelect, onClearSelection]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.Always,
        },
      }}
    >
      <div
        ref={containerRef}
        className={cn(
          "relative w-full overflow-auto bg-white",
          "transition-all duration-200",
          showGrid && "bg-grid-pattern",
          isDragging && "cursor-grabbing"
        )}
        style={{
          minHeight: gridHeight,
          maxWidth: maxWidth,
          margin: "0 auto",
        }}
        onMouseDown={isEditable ? handleSelectionStart : undefined}
        onMouseMove={selectionBox ? handleSelectionMove : undefined}
        onMouseUp={selectionBox ? handleSelectionEnd : undefined}
        onMouseLeave={selectionBox ? handleSelectionEnd : undefined}
      >
        {/* Grid overlay */}
        {showGrid && (
          <GridOverlay
            columns={columns}
            rowHeight={rowHeight}
            gap={gap}
            height={gridHeight}
            width={maxWidth}
          />
        )}

        {/* Blocks */}
        <div className="relative" style={{ height: gridHeight }}>
          {blocks.map(block => (
            <BlockRenderer
              key={block.id}
              block={block}
              isEditable={isEditable}
              isSelected={selectedBlocks.includes(block.id)}
              isDragging={dragData?.blockId === block.id}
              showHandles={editorSettings.showBlockHandles}
              gridSettings={{
                cellWidth,
                rowHeight,
                gap,
              }}
              onUpdate={(updates) => onBlockUpdate(block.id, updates)}
              onDelete={() => onBlockDelete(block.id)}
              onSelect={(multiSelect) => onBlockSelect(block.id, multiSelect)}
            />
          ))}
        </div>

        {/* Ghost position indicator */}
        {ghostPosition && isDragging && (
          <div
            className="absolute border-2 border-blue-400 bg-blue-50 bg-opacity-30 rounded pointer-events-none z-50"
            style={{
              left: ghostPosition.x * cellWidth,
              top: ghostPosition.y * (rowHeight + gap),
              width: ghostPosition.width * cellWidth - gap,
              height: ghostPosition.height * (rowHeight + gap) - gap,
            }}
          />
        )}

        {/* Selection box */}
        {selectionBox && (
          <SelectionOverlay
            start={selectionBox.start}
            end={selectionBox.end}
          />
        )}

        {/* Drag overlay */}
        <DragOverlay>
          {dragData && (
            <div className="opacity-50 pointer-events-none">
              {/* Render dragging block preview */}
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
});