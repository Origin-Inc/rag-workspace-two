import { useState, useCallback, useRef, useEffect, memo } from "react";
import { DndContext, DragOverlay, closestCorners, pointerWithin, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { v4 as uuidv4 } from "uuid";
import { CanvasGrid } from "./CanvasGrid";
import { BlockPalette } from "./BlockPalette";
import { SlashCommandMenu } from "./SlashCommandMenu";
import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  Cog6ToothIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

interface PageEditorProps {
  pageId: string;
  initialBlocks?: Block[];
  isReadOnly?: boolean;
  onSave?: (blocks: Block[]) => Promise<void>;
  onAutoSave?: (blocks: Block[]) => void;
  autoSaveInterval?: number;
  className?: string;
}

export const PageEditor = memo(function PageEditor({
  pageId,
  initialBlocks = [],
  isReadOnly = false,
  onSave,
  onAutoSave,
  autoSaveInterval = 5000,
  className,
}: PageEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  
  // Slash command state
  const [slashCommandOpen, setSlashCommandOpen] = useState(false);
  const [slashCommandPosition, setSlashCommandPosition] = useState({ x: 0, y: 0 });
  const [slashCommandQuery, setSlashCommandQuery] = useState("");
  const [slashCommandTargetId, setSlashCommandTargetId] = useState<string | null>(null);
  
  // History for undo/redo
  const [history, setHistory] = useState<Block[][]>([initialBlocks]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Auto-save effect
  useEffect(() => {
    if (!isDirty || !onAutoSave) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      onAutoSave(blocks);
      setLastSaved(new Date());
      setIsDirty(false);
    }, autoSaveInterval);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [blocks, isDirty, onAutoSave, autoSaveInterval]);

  // Update history when blocks change
  const updateHistory = useCallback((newBlocks: Block[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newBlocks);
    
    // Keep max 50 history states
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Handle block changes
  const handleBlocksChange = useCallback((newBlocks: Block[]) => {
    setBlocks(newBlocks);
    updateHistory(newBlocks);
    setIsDirty(true);
  }, [updateHistory]);

  // Handle block addition from palette
  const handleBlockAdd = useCallback((blockType: any) => {
    const newBlock: Block = {
      id: uuidv4(),
      type: blockType.type,
      content: blockType.defaultContent || {},
      properties: blockType.defaultProperties || {},
      position: {
        x: 0,
        y: blocks.length,
        width: 12,
        height: 1,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    handleBlocksChange([...blocks, newBlock]);
  }, [blocks, handleBlocksChange]);

  // Handle slash command selection
  const handleSlashCommand = useCallback((command: any) => {
    if (!slashCommandTargetId) return;

    const targetIndex = blocks.findIndex(b => b.id === slashCommandTargetId);
    if (targetIndex === -1) return;

    const newBlock: Block = {
      id: uuidv4(),
      type: command.action.data.type,
      content: {},
      properties: command.action.data.properties || {},
      position: {
        x: 0,
        y: targetIndex + 1,
        width: 12,
        height: 1,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const newBlocks = [...blocks];
    newBlocks.splice(targetIndex + 1, 0, newBlock);
    
    // Adjust positions
    newBlocks.forEach((block, idx) => {
      block.position.y = idx;
    });

    handleBlocksChange(newBlocks);
    setSlashCommandOpen(false);
    setSlashCommandQuery("");
    setSlashCommandTargetId(null);
  }, [blocks, slashCommandTargetId, handleBlocksChange]);

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setBlocks(history[historyIndex - 1]);
      setIsDirty(true);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setBlocks(history[historyIndex + 1]);
      setIsDirty(true);
    }
  }, [history, historyIndex]);

  // Delete selected blocks
  const handleDeleteSelected = useCallback(() => {
    const newBlocks = blocks.filter(b => !selectedBlocks.has(b.id));
    handleBlocksChange(newBlocks);
    setSelectedBlocks(new Set());
  }, [blocks, selectedBlocks, handleBlocksChange]);

  // Duplicate selected blocks
  const handleDuplicateSelected = useCallback(() => {
    const blocksToDuplicate = blocks.filter(b => selectedBlocks.has(b.id));
    const duplicatedBlocks = blocksToDuplicate.map(block => ({
      ...block,
      id: uuidv4(),
      position: {
        ...block.position,
        y: block.position.y + 1,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    handleBlocksChange([...blocks, ...duplicatedBlocks]);
    setSelectedBlocks(new Set(duplicatedBlocks.map(b => b.id)));
  }, [blocks, selectedBlocks, handleBlocksChange]);

  // Manual save
  const handleSave = useCallback(async () => {
    if (!onSave || isSaving) return;

    setIsSaving(true);
    try {
      await onSave(blocks);
      setLastSaved(new Date());
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSaving(false);
    }
  }, [blocks, onSave, isSaving]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isReadOnly) return;

      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      // Redo
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }

      // Save
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }

      // Delete
      if ((e.key === "Delete" || e.key === "Backspace") && selectedBlocks.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
      }

      // Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selectedBlocks.size > 0) {
        e.preventDefault();
        handleDuplicateSelected();
      }

      // Select all
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        setSelectedBlocks(new Set(blocks.map(b => b.id)));
      }

      // Escape - clear selection
      if (e.key === "Escape") {
        setSelectedBlocks(new Set());
        setActiveBlockId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isReadOnly, selectedBlocks, blocks, handleUndo, handleRedo, handleSave, handleDeleteSelected, handleDuplicateSelected]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
    >
      <div ref={containerRef} className={cn("flex h-full bg-gray-50", className)}>
        {/* Block Palette Sidebar */}
        {!isReadOnly && (
          <BlockPalette
            isCollapsed={isPaletteCollapsed}
            onToggleCollapse={() => setIsPaletteCollapsed(!isPaletteCollapsed)}
            onBlockSelect={handleBlockAdd}
          />
        )}

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="bg-white border-b border-gray-200 px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Undo/Redo */}
                <button
                  onClick={handleUndo}
                  disabled={historyIndex === 0 || isReadOnly}
                  className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Undo (⌘Z)"
                >
                  <ArrowUturnLeftIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={historyIndex === history.length - 1 || isReadOnly}
                  className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Redo (⌘Y)"
                >
                  <ArrowUturnRightIcon className="h-4 w-4" />
                </button>

                <div className="w-px h-6 bg-gray-300 mx-1" />

                {/* Selection actions */}
                {selectedBlocks.size > 0 && (
                  <>
                    <button
                      onClick={handleDuplicateSelected}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                      title="Duplicate (⌘D)"
                    >
                      <DocumentDuplicateIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleDeleteSelected}
                      className="p-2 hover:bg-gray-100 rounded-lg text-red-600"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                    <span className="text-sm text-gray-500 ml-2">
                      {selectedBlocks.size} selected
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Save status */}
                {isDirty && (
                  <span className="text-xs text-orange-600">Unsaved changes</span>
                )}
                {lastSaved && !isDirty && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircleIcon className="h-3 w-3" />
                    Saved {lastSaved.toLocaleTimeString()}
                  </span>
                )}

                {/* Save button */}
                {onSave && (
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !isDirty}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <CloudArrowUpIcon className="h-4 w-4 animate-pulse" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CloudArrowUpIcon className="h-4 w-4" />
                        Save
                      </>
                    )}
                  </button>
                )}

                {/* Settings */}
                <button
                  className="p-2 hover:bg-gray-100 rounded-lg"
                  title="Page settings"
                >
                  <Cog6ToothIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto p-8">
            <CanvasGrid
              blocks={blocks}
              onBlocksChange={handleBlocksChange}
              selectedBlocks={selectedBlocks}
              onSelectionChange={setSelectedBlocks}
              isReadOnly={isReadOnly}
              onSlashCommand={(position, targetId) => {
                setSlashCommandPosition(position);
                setSlashCommandTargetId(targetId);
                setSlashCommandOpen(true);
                setSlashCommandQuery("");
              }}
            />
          </div>
        </div>

        {/* Slash Command Menu */}
        <SlashCommandMenu
          isOpen={slashCommandOpen}
          position={slashCommandPosition}
          searchQuery={slashCommandQuery}
          onSelect={handleSlashCommand}
          onClose={() => {
            setSlashCommandOpen(false);
            setSlashCommandQuery("");
            setSlashCommandTargetId(null);
          }}
        />
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeBlockId && (
          <div className="opacity-50 bg-blue-100 border-2 border-blue-400 rounded-lg p-4">
            Dragging block
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
});