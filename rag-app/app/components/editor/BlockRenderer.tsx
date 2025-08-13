import { memo, useState, useRef, useEffect, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";
import {
  Bars3Icon,
  TrashIcon,
  DocumentDuplicateIcon,
  PencilIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { TextBlock } from "./blocks/TextBlock";
import { HeadingBlock } from "./blocks/HeadingBlock";
import { ListBlock } from "./blocks/ListBlock";
import { CodeBlock } from "./blocks/CodeBlock";
import { ImageBlock } from "./blocks/ImageBlock";
import { VideoBlock } from "./blocks/VideoBlock";
import { TableBlock } from "./blocks/TableBlock";
import { KanbanBlock } from "./blocks/KanbanBlock";
import { CalloutBlock } from "./blocks/CalloutBlock";
import { ToggleBlock } from "./blocks/ToggleBlock";
import { DividerBlock } from "./blocks/DividerBlock";
import { QuoteBlock } from "./blocks/QuoteBlock";
import { FileBlock } from "./blocks/FileBlock";
import { EmbedBlock } from "./blocks/EmbedBlock";

interface BlockRendererProps {
  block: Block;
  isEditable: boolean;
  isSelected: boolean;
  isDragging: boolean;
  showHandles: boolean;
  gridSettings: {
    cellWidth: number;
    rowHeight: number;
    gap: number;
  };
  onUpdate: (updates: Partial<Block>) => void;
  onDelete: () => void;
  onSelect: (multiSelect?: boolean) => void;
  depth?: number;
}

const BLOCK_COMPONENTS: Record<string, React.ComponentType<any>> = {
  text: TextBlock,
  heading: HeadingBlock,
  bullet_list: ListBlock,
  numbered_list: ListBlock,
  checkbox: ListBlock,
  code: CodeBlock,
  image: ImageBlock,
  video: VideoBlock,
  table: TableBlock,
  kanban: KanbanBlock,
  callout: CalloutBlock,
  toggle: ToggleBlock,
  divider: DividerBlock,
  quote: QuoteBlock,
  file: FileBlock,
  embed: EmbedBlock,
};

export const BlockRenderer = memo(function BlockRenderer({
  block,
  isEditable,
  isSelected,
  isDragging,
  showHandles,
  gridSettings,
  onUpdate,
  onDelete,
  onSelect,
  depth = 0,
}: BlockRendererProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const blockRef = useRef<HTMLDivElement>(null);

  const { cellWidth, rowHeight, gap } = gridSettings;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: block.id,
    disabled: !isEditable || isEditing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    left: block.position.x * cellWidth,
    top: block.position.y * (rowHeight + gap),
    width: block.position.width * cellWidth - gap,
    minHeight: block.position.height * (rowHeight + gap) - gap,
    opacity: isDragging || isSortableDragging ? 0.5 : 1,
    zIndex: isDragging || isSortableDragging ? 1000 : isSelected ? 10 : 1,
  };

  // Get the appropriate component for this block type
  const BlockComponent = BLOCK_COMPONENTS[block.type];

  if (!BlockComponent) {
    console.warn(`Unknown block type: ${block.type}`);
    return null;
  }

  // Handle click events
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!isEditable) return;
    
    // Check if ctrl/cmd is held for multi-select
    const multiSelect = e.ctrlKey || e.metaKey;
    onSelect(multiSelect);
  }, [isEditable, onSelect]);

  // Handle double-click to edit
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!isEditable) return;
    e.stopPropagation();
    setIsEditing(true);
  }, [isEditable]);

  // Handle content changes
  const handleContentChange = useCallback((content: any) => {
    onUpdate({ content });
  }, [onUpdate]);

  // Handle properties changes
  const handlePropertiesChange = useCallback((properties: any) => {
    onUpdate({ properties });
  }, [onUpdate]);

  // Handle metadata changes
  const handleMetadataChange = useCallback((metadata: any) => {
    onUpdate({ metadata });
  }, [onUpdate]);

  // Exit editing mode
  const handleEditComplete = useCallback(() => {
    setIsEditing(false);
  }, []);

  // Handle delete with confirmation for non-empty blocks
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    const hasContent = block.content && 
      (typeof block.content === 'string' ? block.content.trim() : 
       Object.values(block.content).some(v => v));

    if (hasContent) {
      if (confirm("Delete this block? This action cannot be undone.")) {
        onDelete();
      }
    } else {
      onDelete();
    }
  }, [block.content, onDelete]);

  // Handle duplicate
  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // This would trigger a duplicate action in the parent
    // Implementation depends on parent component
  }, []);

  // Keyboard shortcuts for block
  useEffect(() => {
    if (!isSelected || !isEditable) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter to edit
      if (e.key === "Enter" && !isEditing) {
        e.preventDefault();
        setIsEditing(true);
      }

      // Escape to exit editing
      if (e.key === "Escape" && isEditing) {
        e.preventDefault();
        setIsEditing(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelected, isEditable, isEditing]);

  // Toggle blocks (for toggle type)
  const canToggle = block.type === "toggle" || 
                   (block.metadata?.collapsible && block.children?.length > 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute group transition-all duration-200",
        "border rounded-lg bg-white",
        isSelected ? "border-blue-500 shadow-lg" : "border-transparent",
        isHovered && !isSelected && "border-gray-300 shadow-sm",
        isDragging && "cursor-grabbing",
        !isEditable && "cursor-default"
      )}
      style={style}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-block-id={block.id}
      data-block-type={block.type}
    >
      {/* Block handles and controls */}
      {isEditable && showHandles && (isHovered || isSelected) && !isEditing && (
        <div className="absolute -left-12 top-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Drag handle */}
          <button
            className="p-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 cursor-grab"
            {...attributes}
            {...listeners}
            title="Drag to move"
          >
            <Bars3Icon className="h-4 w-4 text-gray-600" />
          </button>

          {/* Toggle expand/collapse */}
          {canToggle && (
            <button
              className="p-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4 text-gray-600" />
              ) : (
                <ChevronRightIcon className="h-4 w-4 text-gray-600" />
              )}
            </button>
          )}
        </div>
      )}

      {/* Block actions */}
      {isEditable && (isHovered || isSelected) && !isEditing && (
        <div className="absolute -right-1 -top-8 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50"
            onClick={handleDuplicate}
            title="Duplicate"
          >
            <DocumentDuplicateIcon className="h-4 w-4 text-gray-600" />
          </button>
          <button
            className="p-1.5 bg-white border border-gray-300 rounded hover:bg-red-50 hover:border-red-300"
            onClick={handleDelete}
            title="Delete"
          >
            <TrashIcon className="h-4 w-4 text-gray-600 hover:text-red-600" />
          </button>
        </div>
      )}

      {/* Block content */}
      <div className={cn(
        "p-3",
        !isExpanded && "opacity-50"
      )}>
        <BlockComponent
          block={block}
          onChange={onUpdate}
          isSelected={isSelected}
          isEditing={isEditing}
        />
      </div>

      {/* Nested children (if any) */}
      {isExpanded && block.children && block.children.length > 0 && (
        <div className="pl-6 border-l-2 border-gray-200 ml-3">
          {block.children.map(childBlock => (
            <BlockRenderer
              key={childBlock.id}
              block={childBlock}
              isEditable={isEditable}
              isSelected={false} // Child selection handled separately
              isDragging={false}
              showHandles={showHandles}
              gridSettings={gridSettings}
              onUpdate={(updates) => {
                // Update child block through parent
                const updatedChildren = block.children!.map(child =>
                  child.id === childBlock.id ? { ...child, ...updates } : child
                );
                onUpdate({ children: updatedChildren });
              }}
              onDelete={() => {
                // Remove child from parent
                const updatedChildren = block.children!.filter(
                  child => child.id !== childBlock.id
                );
                onUpdate({ children: updatedChildren });
              }}
              onSelect={() => {
                // Handle child selection
              }}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {/* Resize handles */}
      {isEditable && isSelected && !isEditing && (
        <>
          {/* Right resize handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-200 opacity-0 group-hover:opacity-50"
            onMouseDown={(e) => {
              e.preventDefault();
              // Handle resize logic
            }}
          />
          {/* Bottom resize handle */}
          <div
            className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize hover:bg-blue-200 opacity-0 group-hover:opacity-50"
            onMouseDown={(e) => {
              e.preventDefault();
              // Handle resize logic
            }}
          />
          {/* Corner resize handle */}
          <div
            className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize hover:bg-blue-200 opacity-0 group-hover:opacity-50"
            onMouseDown={(e) => {
              e.preventDefault();
              // Handle resize logic
            }}
          />
        </>
      )}
    </div>
  );
});