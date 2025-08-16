import { useState, useCallback, useRef, useEffect, memo, useMemo } from 'react';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '~/utils/cn';
import { 
  Plus, 
  GripVertical, 
  ChevronRight, 
  ChevronDown,
  Copy,
  Trash2,
  MoreHorizontal,
  Undo,
  Redo
} from 'lucide-react';
import { CommandManager, EditorCommandFactory } from '~/services/editor/command-manager';
import { UncontrolledEditor } from './UncontrolledEditor';

// Block types
export type BlockType = 
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'numberedList'
  | 'todoList'
  | 'quote'
  | 'code'
  | 'divider'
  | 'callout'
  | 'toggle'
  | 'image'
  | 'video'
  | 'table'
  | 'embed';

export interface Block {
  id: string;
  type: BlockType;
  content: any;
  children?: string[];
  parent?: string;
  isExpanded?: boolean;
  metadata?: {
    createdAt: Date;
    updatedAt: Date;
    version: number;
    indent?: number;
  };
}

interface BlockEditorProps {
  initialBlocks?: Block[];
  onChange?: (blocks: Block[]) => void;
  onSave?: (blocks: Block[]) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
}

// Individual block component
const BlockComponent = memo(({ 
  block, 
  index,
  onUpdate,
  onDelete,
  onAddBelow,
  onIndent,
  onOutdent,
  isSelected,
  onSelect,
  style
}: {
  block: Block;
  index: number;
  onUpdate: (id: string, updates: Partial<Block>) => void;
  onDelete: (id: string) => void;
  onAddBelow: (afterId: string) => void;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
  isSelected: boolean;
  onSelect: (id: string, isMultiSelect?: boolean, isRangeSelect?: boolean) => void;
  style: React.CSSProperties;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const isMultiSelect = e.metaKey || e.ctrlKey;
    const isRangeSelect = e.shiftKey;
    onSelect(block.id, isMultiSelect, isRangeSelect);
  }, [block.id, onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onAddBelow(block.id);
    } else if (e.key === 'Backspace' && block.content === '') {
      e.preventDefault();
      onDelete(block.id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        onOutdent(block.id);
      } else {
        onIndent(block.id);
      }
    }
  }, [block.id, block.content, onAddBelow, onDelete, onIndent, onOutdent]);

  const renderContent = () => {
    switch (block.type) {
      case 'heading1':
        return (
          <h1 className="text-3xl font-bold">
            <UncontrolledEditor
              initialValue={block.content || ''}
              onChange={(value) => onUpdate(block.id, { content: value })}
              onKeyDown={handleKeyDown}
              placeholder="Heading 1"
              singleLine={true}
              data-testid={`block-${block.id}`}
            />
          </h1>
        );
      case 'heading2':
        return (
          <h2 className="text-2xl font-semibold">
            <UncontrolledEditor
              initialValue={block.content || ''}
              onChange={(value) => onUpdate(block.id, { content: value })}
              onKeyDown={handleKeyDown}
              placeholder="Heading 2"
              singleLine={true}
              data-testid={`block-${block.id}`}
            />
          </h2>
        );
      case 'heading3':
        return (
          <h3 className="text-xl font-medium">
            <UncontrolledEditor
              initialValue={block.content || ''}
              onChange={(value) => onUpdate(block.id, { content: value })}
              onKeyDown={handleKeyDown}
              placeholder="Heading 3"
              singleLine={true}
              data-testid={`block-${block.id}`}
            />
          </h3>
        );
      case 'bulletList':
        return (
          <div className="flex items-start gap-2">
            <span className="text-gray-400 mt-1">•</span>
            <div className="flex-1">
              <UncontrolledEditor
                initialValue={block.content || ''}
                onChange={(value) => onUpdate(block.id, { content: value })}
                onKeyDown={handleKeyDown}
                placeholder="List item"
                  data-testid={`block-${block.id}`}
              />
            </div>
          </div>
        );
      case 'numberedList':
        return (
          <div className="flex items-start gap-2">
            <span className="text-gray-400 mt-1">{index + 1}.</span>
            <div className="flex-1">
              <UncontrolledEditor
                initialValue={block.content || ''}
                onChange={(value) => onUpdate(block.id, { content: value })}
                onKeyDown={handleKeyDown}
                placeholder="List item"
                  data-testid={`block-${block.id}`}
              />
            </div>
          </div>
        );
      case 'todoList':
        return (
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={block.metadata?.completed || false}
              onChange={(e) => onUpdate(block.id, { 
                metadata: { ...block.metadata, completed: e.target.checked }
              })}
            />
            <div className={cn("flex-1", block.metadata?.completed && "line-through text-gray-400")}>
              <UncontrolledEditor
                initialValue={block.content || ''}
                onChange={(value) => onUpdate(block.id, { content: value })}
                onKeyDown={handleKeyDown}
                placeholder="Todo item"
                  data-testid={`block-${block.id}`}
              />
            </div>
          </div>
        );
      case 'quote':
        return (
          <blockquote className="border-l-4 border-gray-300 pl-4 italic">
            <UncontrolledEditor
              initialValue={block.content || ''}
              onChange={(value) => onUpdate(block.id, { content: value })}
              onKeyDown={handleKeyDown}
              placeholder="Quote"
              data-testid={`block-${block.id}`}
            />
          </blockquote>
        );
      case 'code':
        return (
          <pre className="bg-gray-100 rounded p-3 overflow-x-auto">
            <code className="font-mono text-sm">
              <UncontrolledEditor
                initialValue={block.content || ''}
                onChange={(value) => onUpdate(block.id, { content: value })}
                onKeyDown={handleKeyDown}
                placeholder="// Code block"
                  data-testid={`block-${block.id}`}
              />
            </code>
          </pre>
        );
      case 'divider':
        return <hr className="my-4 border-gray-300" />;
      case 'callout':
        return (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <UncontrolledEditor
              initialValue={block.content || ''}
              onChange={(value) => onUpdate(block.id, { content: value })}
              onKeyDown={handleKeyDown}
              placeholder="Callout"
              data-testid={`block-${block.id}`}
            />
          </div>
        );
      case 'toggle':
        return (
          <div>
            <button
              onClick={() => onUpdate(block.id, { isExpanded: !block.isExpanded })}
              className="flex items-center gap-1 w-full text-left hover:bg-gray-50 p-1 -ml-1 rounded"
            >
              {block.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <div 
                className="font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                <SimpleInlineEditor
                  value={block.content || ''}
                  onChange={(value) => onUpdate(block.id, { content: value })}
                  onKeyDown={handleKeyDown}
                  placeholder="Toggle heading"
                  singleLine={true}
                      data-testid={`block-${block.id}`}
                />
              </div>
            </button>
            {block.isExpanded && block.children && (
              <div className="ml-6 mt-2">
                {/* Render children blocks here */}
              </div>
            )}
          </div>
        );
      default:
        return (
          <UncontrolledEditor
            initialValue={block.content || ''}
            onChange={(value) => onUpdate(block.id, { content: value })}
            onKeyDown={handleKeyDown}
            placeholder="Type '/' for commands"
            allowFormatting={true}
            data-testid={`block-${block.id}`}
          />
        );
    }
  };

  return (
    <div
      style={style}
      className={cn(
        "group relative px-4 py-2 transition-colors",
        isSelected && "bg-blue-50 border-l-2 border-blue-400",
        isHovered && !isSelected && "bg-gray-50"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* Block handle */}
      <div className={cn(
        "absolute left-0 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1",
        isSelected && "opacity-100"
      )}>
        <button className="p-1 hover:bg-gray-200 rounded cursor-move">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </button>
        <button
          onClick={() => onAddBelow(block.id)}
          className="p-1 hover:bg-gray-200 rounded"
        >
          <Plus className="w-4 h-4 text-gray-400" />
        </button>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1 hover:bg-gray-200 rounded relative"
        >
          <MoreHorizontal className="w-4 h-4 text-gray-400" />
          {showMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white shadow-lg rounded-lg border border-gray-200 py-1 z-10">
              <button
                onClick={() => {
                  // Duplicate block
                  setShowMenu(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </button>
              <button
                onClick={() => {
                  onDelete(block.id);
                  setShowMenu(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left text-red-600"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </button>
      </div>

      {/* Block content */}
      <div className="ml-12" style={{ marginLeft: `${(block.metadata?.indent || 0) * 24 + 48}px` }}>
        {renderContent()}
      </div>
    </div>
  );
});

BlockComponent.displayName = 'BlockComponent';

export const BlockEditor = memo(function BlockEditor({
  initialBlocks = [],
  onChange,
  onSave,
  className,
  placeholder = "Start typing or press '/' for commands",
  readOnly = false,
}: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(() => 
    initialBlocks.length > 0 ? initialBlocks : [{
      id: uuidv4(),
      type: 'paragraph',
      content: '',
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        indent: 0,
      }
    }]
  );
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [commandState, setCommandState] = useState({
    canUndo: false,
    canRedo: false,
    isDirty: false,
  });
  const listRef = useRef<List>(null);
  const rowHeights = useRef<Map<number, number>>(new Map());
  const lastSelectedBlockId = useRef<string | null>(null);
  
  // Initialize command manager
  const commandManager = useMemo(() => new CommandManager({
    maxHistorySize: 50,
    coalescingWindow: 500,
    onStateChange: (state) => {
      setCommandState({
        canUndo: state.canUndo,
        canRedo: state.canRedo,
        isDirty: state.isDirty,
      });
    },
  }), []);

  // Virtual scrolling helpers
  const getItemSize = useCallback((index: number) => {
    return rowHeights.current.get(index) || 80;
  }, []);

  const setItemSize = useCallback((index: number, size: number) => {
    if (rowHeights.current.get(index) !== size) {
      rowHeights.current.set(index, size);
      listRef.current?.resetAfterIndex(index);
    }
  }, []);

  // Block operations with command pattern
  const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
    // For text content updates, just update directly without command manager for now
    // The command manager's coalescing is causing issues with real-time typing
    if (updates.content !== undefined) {
      setBlocks(prev => {
        const newBlocks = prev.map(block => 
          block.id === id ? { ...block, ...updates } : block
        );
        onChange?.(newBlocks);
        return newBlocks;
      });
    } else {
      // For non-text updates, use command manager
      setBlocks(prev => {
        const currentBlock = prev.find(b => b.id === id);
        if (!currentBlock) return prev;
        
        const newBlocks = prev.map(block => 
          block.id === id ? { ...block, ...updates } : block
        );
        onChange?.(newBlocks);
        return newBlocks;
      });
    }
  }, [onChange]);

  const deleteBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const blockIndex = prev.findIndex(b => b.id === id);
      if (blockIndex === -1 || prev.length === 1) return prev;
      
      const newBlocks = prev.filter(b => b.id !== id);
      onChange?.(newBlocks);
      return newBlocks;
    });
  }, [onChange]);

  const addBlockBelow = useCallback((afterId: string) => {
    setBlocks(prev => {
      const index = prev.findIndex(b => b.id === afterId);
      if (index === -1) return prev;
      
      const newBlock: Block = {
        id: uuidv4(),
        type: 'paragraph',
        content: '',
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
          indent: prev[index]?.metadata?.indent || 0,
        }
      };
      
      const newBlocks = [...prev];
      newBlocks.splice(index + 1, 0, newBlock);
      onChange?.(newBlocks);
      return newBlocks;
    });
  }, [onChange]);

  const indentBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const block = prev.find(b => b.id === id);
      if (!block) return prev;
      
      const newBlocks = prev.map(b => 
        b.id === id 
          ? { ...b, metadata: { ...b.metadata, indent: Math.min((b.metadata?.indent || 0) + 1, 5) }}
          : b
      );
      onChange?.(newBlocks);
      return newBlocks;
    });
  }, [onChange]);

  const outdentBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const block = prev.find(b => b.id === id);
      if (!block) return prev;
      
      const newBlocks = prev.map(b => 
        b.id === id 
          ? { ...b, metadata: { ...b.metadata, indent: Math.max((b.metadata?.indent || 0) - 1, 0) }}
          : b
      );
      onChange?.(newBlocks);
      return newBlocks;
    });
  }, [onChange]);

  // Multi-block selection handlers
  const selectBlock = useCallback((id: string, isMultiSelect = false, isRangeSelect = false) => {
    if (isRangeSelect && selectionAnchor) {
      // Range selection with Shift+Click
      const anchorIndex = blocks.findIndex(b => b.id === selectionAnchor);
      const targetIndex = blocks.findIndex(b => b.id === id);
      
      if (anchorIndex !== -1 && targetIndex !== -1) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        const newSelection = new Set<string>();
        
        for (let i = start; i <= end; i++) {
          newSelection.add(blocks[i].id);
        }
        
        setSelectedBlockIds(newSelection);
      }
    } else if (isMultiSelect) {
      // Toggle selection with Cmd/Ctrl+Click
      setSelectedBlockIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return newSet;
      });
      setSelectionAnchor(id);
    } else {
      // Single selection
      setSelectedBlockIds(new Set([id]));
      setSelectionAnchor(id);
    }
    
    lastSelectedBlockId.current = id;
  }, [blocks, selectionAnchor]);

  const selectAll = useCallback(() => {
    const allIds = new Set(blocks.map(b => b.id));
    setSelectedBlockIds(allIds);
    if (blocks.length > 0) {
      setSelectionAnchor(blocks[0].id);
      lastSelectedBlockId.current = blocks[blocks.length - 1].id;
    }
  }, [blocks]);

  const clearSelection = useCallback(() => {
    setSelectedBlockIds(new Set());
    setSelectionAnchor(null);
    lastSelectedBlockId.current = null;
  }, []);

  const deleteSelectedBlocks = useCallback(() => {
    if (selectedBlockIds.size === 0) return;
    
    // Don't delete if it would leave no blocks
    if (selectedBlockIds.size >= blocks.length) {
      if (blocks.length === 1) return;
      // Keep at least one block
      const firstUnselected = blocks.find(b => !selectedBlockIds.has(b.id));
      if (!firstUnselected) {
        // All blocks selected, keep the first one
        const newSelection = new Set(selectedBlockIds);
        newSelection.delete(blocks[0].id);
        setSelectedBlockIds(newSelection);
      }
    }
    
    // Create batch delete command
    const blocksToDelete = blocks.filter(b => selectedBlockIds.has(b.id));
    const deleteCommands = blocksToDelete.map(block => {
      const blockIndex = blocks.findIndex(b => b.id === block.id);
      return EditorCommandFactory.createDeleteCommand(
        block,
        (blockId) => {
          setBlocks(prev => prev.filter(b => b.id !== blockId));
        },
        (blockToAdd, index) => {
          setBlocks(prev => {
            const newBlocks = [...prev];
            newBlocks.splice(index || blockIndex, 0, blockToAdd);
            return newBlocks;
          });
        },
        blockIndex
      );
    });
    
    commandManager.executeGroup(deleteCommands, {
      type: 'batch-delete',
      description: `Delete ${blocksToDelete.length} blocks`
    });
    
    clearSelection();
    onChange?.(blocks.filter(b => !selectedBlockIds.has(b.id)));
  }, [selectedBlockIds, blocks, commandManager, onChange]);

  const moveSelectedBlocks = useCallback((direction: 'up' | 'down') => {
    if (selectedBlockIds.size === 0) return;
    
    const selectedIndices = blocks
      .map((b, i) => selectedBlockIds.has(b.id) ? i : -1)
      .filter(i => i !== -1)
      .sort((a, b) => direction === 'up' ? a - b : b - a);
    
    if (selectedIndices.length === 0) return;
    
    // Check if move is possible
    if (direction === 'up' && selectedIndices[0] === 0) return;
    if (direction === 'down' && selectedIndices[0] === blocks.length - 1) return;
    
    const moveCommands = selectedIndices.map(index => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      const blockId = blocks[index].id;
      
      return EditorCommandFactory.createMoveCommand(
        blockId,
        index,
        targetIndex,
        (id, from, to) => {
          setBlocks(prev => {
            const newBlocks = [...prev];
            const [block] = newBlocks.splice(from, 1);
            newBlocks.splice(to, 0, block);
            return newBlocks;
          });
        }
      );
    });
    
    commandManager.executeGroup(moveCommands, {
      type: 'batch-move',
      description: `Move ${selectedIndices.length} blocks ${direction}`
    });
    
    onChange?.(blocks);
  }, [selectedBlockIds, blocks, commandManager, onChange]);

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    commandManager.undo();
  }, [commandManager]);

  const handleRedo = useCallback(() => {
    commandManager.redo();
  }, [commandManager]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        onSave?.(blocks);
        commandManager.markSavePoint();
      }
      
      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      
      // Redo
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
      
      // Select All
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
      
      // Delete selected blocks
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBlockIds.size > 1) {
          e.preventDefault();
          deleteSelectedBlocks();
        }
      }
      
      // Move selected blocks
      if (e.altKey && e.shiftKey) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveSelectedBlocks('up');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveSelectedBlocks('down');
        }
      }
      
      // Escape to clear selection
      if (e.key === 'Escape') {
        if (selectedBlockIds.size > 0) {
          e.preventDefault();
          clearSelection();
        }
      }
      
      // Navigate selection with arrow keys
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          if (selectedBlockIds.size === 1 || lastSelectedBlockId.current) {
            const currentId = lastSelectedBlockId.current || Array.from(selectedBlockIds)[0];
            const currentIndex = blocks.findIndex(b => b.id === currentId);
            
            if (currentIndex !== -1) {
              const nextIndex = e.key === 'ArrowUp' 
                ? Math.max(0, currentIndex - 1)
                : Math.min(blocks.length - 1, currentIndex + 1);
              
              if (nextIndex !== currentIndex) {
                e.preventDefault();
                selectBlock(blocks[nextIndex].id);
                
                // Scroll to the selected block
                listRef.current?.scrollToItem(nextIndex, 'smart');
              }
            }
          }
        }
      }
      
      // Extend selection with Shift+Arrow keys
      if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        
        if (selectedBlockIds.size === 0 && blocks.length > 0) {
          // Start selection from first block
          selectBlock(blocks[0].id);
        } else if (selectionAnchor) {
          const anchorIndex = blocks.findIndex(b => b.id === selectionAnchor);
          const lastIndex = lastSelectedBlockId.current 
            ? blocks.findIndex(b => b.id === lastSelectedBlockId.current)
            : anchorIndex;
          
          if (lastIndex !== -1) {
            const nextIndex = e.key === 'ArrowUp'
              ? Math.max(0, lastIndex - 1)
              : Math.min(blocks.length - 1, lastIndex + 1);
            
            const start = Math.min(anchorIndex, nextIndex);
            const end = Math.max(anchorIndex, nextIndex);
            const newSelection = new Set<string>();
            
            for (let i = start; i <= end; i++) {
              newSelection.add(blocks[i].id);
            }
            
            setSelectedBlockIds(newSelection);
            lastSelectedBlockId.current = blocks[nextIndex].id;
            
            // Scroll to the edge of selection
            listRef.current?.scrollToItem(nextIndex, 'smart');
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [blocks, onSave, handleUndo, handleRedo, commandManager, selectAll, selectedBlockIds, 
      deleteSelectedBlocks, moveSelectedBlocks, clearSelection, selectBlock, selectionAnchor]);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const block = blocks[index];
    if (!block) return null;

    return (
      <div style={style}>
        <BlockComponent
          block={block}
          index={index}
          onUpdate={updateBlock}
          onDelete={deleteBlock}
          onAddBelow={addBlockBelow}
          onIndent={indentBlock}
          onOutdent={outdentBlock}
          isSelected={selectedBlockIds.has(block.id)}
          onSelect={selectBlock}
          style={{}}
        />
      </div>
    );
  }, [blocks, selectedBlockIds, updateBlock, deleteBlock, addBlockBelow, indentBlock, outdentBlock, selectBlock]);

  return (
    <div className={cn("h-full bg-white flex flex-col", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={!commandState.canUndo || readOnly}
            className={cn(
              "p-1.5 rounded hover:bg-gray-200 transition-colors",
              !commandState.canUndo && "opacity-50 cursor-not-allowed"
            )}
            title="Undo (⌘Z)"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={!commandState.canRedo || readOnly}
            className={cn(
              "p-1.5 rounded hover:bg-gray-200 transition-colors",
              !commandState.canRedo && "opacity-50 cursor-not-allowed"
            )}
            title="Redo (⌘Y)"
          >
            <Redo className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <span className="text-xs text-gray-500">
            {blocks.length} block{blocks.length !== 1 ? 's' : ''}
            {selectedBlockIds.size > 0 && ` • ${selectedBlockIds.size} selected`}
          </span>
          {selectedBlockIds.size > 1 && (
            <>
              <div className="w-px h-6 bg-gray-300 mx-2" />
              <button
                onClick={() => moveSelectedBlocks('up')}
                disabled={readOnly}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                title="Move selected blocks up (Alt+Shift+↑)"
              >
                <ChevronRight className="w-4 h-4 rotate-[-90deg]" />
              </button>
              <button
                onClick={() => moveSelectedBlocks('down')}
                disabled={readOnly}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                title="Move selected blocks down (Alt+Shift+↓)"
              >
                <ChevronRight className="w-4 h-4 rotate-90" />
              </button>
              <button
                onClick={deleteSelectedBlocks}
                disabled={readOnly}
                className="p-1.5 rounded hover:bg-red-100 text-red-600 transition-colors ml-2"
                title="Delete selected blocks"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
        {commandState.isDirty && (
          <span className="text-xs text-orange-600">Unsaved changes</span>
        )}
      </div>
      
      {/* Editor content */}
      <div className="flex-1">
        <AutoSizer>
          {({ height, width }) => (
            <List
              ref={listRef}
              height={height}
              itemCount={blocks.length}
              itemSize={getItemSize}
              width={width}
              overscanCount={5}
              className="scrollbar-thin"
            >
              {Row}
            </List>
          )}
        </AutoSizer>
      </div>
    </div>
  );
});