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
  onSelect: (id: string) => void;
  style: React.CSSProperties;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

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
          <h1
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            className="text-3xl font-bold outline-none"
            onBlur={(e) => onUpdate(block.id, { content: e.currentTarget.textContent })}
            onKeyDown={handleKeyDown}
          >
            {block.content || 'Heading 1'}
          </h1>
        );
      case 'heading2':
        return (
          <h2
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            className="text-2xl font-semibold outline-none"
            onBlur={(e) => onUpdate(block.id, { content: e.currentTarget.textContent })}
            onKeyDown={handleKeyDown}
          >
            {block.content || 'Heading 2'}
          </h2>
        );
      case 'heading3':
        return (
          <h3
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            className="text-xl font-medium outline-none"
            onBlur={(e) => onUpdate(block.id, { content: e.currentTarget.textContent })}
            onKeyDown={handleKeyDown}
          >
            {block.content || 'Heading 3'}
          </h3>
        );
      case 'bulletList':
        return (
          <div className="flex items-start gap-2">
            <span className="text-gray-400 mt-1">•</span>
            <div
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              className="flex-1 outline-none"
              onBlur={(e) => onUpdate(block.id, { content: e.currentTarget.textContent })}
              onKeyDown={handleKeyDown}
            >
              {block.content || 'List item'}
            </div>
          </div>
        );
      case 'numberedList':
        return (
          <div className="flex items-start gap-2">
            <span className="text-gray-400 mt-1">{index + 1}.</span>
            <div
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              className="flex-1 outline-none"
              onBlur={(e) => onUpdate(block.id, { content: e.currentTarget.textContent })}
              onKeyDown={handleKeyDown}
            >
              {block.content || 'List item'}
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
            <div
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              className={cn(
                "flex-1 outline-none",
                block.metadata?.completed && "line-through text-gray-400"
              )}
              onBlur={(e) => onUpdate(block.id, { content: e.currentTarget.textContent })}
              onKeyDown={handleKeyDown}
            >
              {block.content || 'Todo item'}
            </div>
          </div>
        );
      case 'quote':
        return (
          <blockquote className="border-l-4 border-gray-300 pl-4 italic">
            <div
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              className="outline-none"
              onBlur={(e) => onUpdate(block.id, { content: e.currentTarget.textContent })}
              onKeyDown={handleKeyDown}
            >
              {block.content || 'Quote'}
            </div>
          </blockquote>
        );
      case 'code':
        return (
          <pre className="bg-gray-100 rounded p-3 overflow-x-auto">
            <code
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              className="outline-none font-mono text-sm"
              onBlur={(e) => onUpdate(block.id, { content: e.currentTarget.textContent })}
              onKeyDown={handleKeyDown}
            >
              {block.content || '// Code block'}
            </code>
          </pre>
        );
      case 'divider':
        return <hr className="my-4 border-gray-300" />;
      case 'callout':
        return (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <div
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              className="outline-none"
              onBlur={(e) => onUpdate(block.id, { content: e.currentTarget.textContent })}
              onKeyDown={handleKeyDown}
            >
              {block.content || 'Callout'}
            </div>
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
                ref={contentRef}
                contentEditable
                suppressContentEditableWarning
                className="outline-none font-medium"
                onBlur={(e) => onUpdate(block.id, { content: e.currentTarget.textContent })}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleKeyDown}
              >
                {block.content || 'Toggle heading'}
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
          <div
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            className="outline-none"
            onBlur={(e) => onUpdate(block.id, { content: e.currentTarget.textContent })}
            onKeyDown={handleKeyDown}
            placeholder="Type '/' for commands"
          >
            {block.content || ''}
          </div>
        );
    }
  };

  return (
    <div
      style={style}
      className={cn(
        "group relative px-4 py-2 transition-colors",
        isSelected && "bg-blue-50",
        isHovered && "bg-gray-50"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(block.id)}
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
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [commandState, setCommandState] = useState({
    canUndo: false,
    canRedo: false,
    isDirty: false,
  });
  const listRef = useRef<List>(null);
  const rowHeights = useRef<Map<number, number>>(new Map());
  
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
    const currentBlock = blocks.find(b => b.id === id);
    if (!currentBlock) return;
    
    const oldBlock = { ...currentBlock };
    const newBlock = { ...currentBlock, ...updates };
    
    // Create command for text updates with coalescing
    if (updates.content !== undefined && typeof updates.content === 'string') {
      const command = EditorCommandFactory.createTextCommand(
        id,
        oldBlock.content || '',
        updates.content,
        (blockId, text) => {
          setBlocks(prev => {
            const newBlocks = prev.map(block => 
              block.id === blockId ? { ...block, content: text } : block
            );
            onChange?.(newBlocks);
            return newBlocks;
          });
        }
      );
      commandManager.execute(command);
    } else {
      // For non-text updates, create a generic command
      const command = {
        id: `update-${id}-${Date.now()}`,
        timestamp: Date.now(),
        metadata: { type: 'update-block', description: `Update block ${id}` },
        execute: () => {
          setBlocks(prev => {
            const newBlocks = prev.map(block => 
              block.id === id ? newBlock : block
            );
            onChange?.(newBlocks);
            return newBlocks;
          });
        },
        undo: () => {
          setBlocks(prev => {
            const newBlocks = prev.map(block => 
              block.id === id ? oldBlock : block
            );
            onChange?.(newBlocks);
            return newBlocks;
          });
        },
      };
      commandManager.execute(command);
    }
  }, [blocks, onChange, commandManager]);

  const deleteBlock = useCallback((id: string) => {
    const blockIndex = blocks.findIndex(b => b.id === id);
    if (blockIndex === -1 || blocks.length === 1) return;
    
    const block = blocks[blockIndex];
    const command = EditorCommandFactory.createDeleteCommand(
      block,
      (blockId) => {
        setBlocks(prev => {
          const newBlocks = prev.filter(b => b.id !== blockId);
          onChange?.(newBlocks);
          return newBlocks;
        });
      },
      (blockToAdd, index) => {
        setBlocks(prev => {
          const newBlocks = [...prev];
          newBlocks.splice(index || blockIndex, 0, blockToAdd);
          onChange?.(newBlocks);
          return newBlocks;
        });
      },
      blockIndex
    );
    
    commandManager.execute(command);
  }, [blocks, onChange, commandManager]);

  const addBlockBelow = useCallback((afterId: string) => {
    const index = blocks.findIndex(b => b.id === afterId);
    if (index === -1) return;
    
    const newBlock: Block = {
      id: uuidv4(),
      type: 'paragraph',
      content: '',
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        indent: blocks[index]?.metadata?.indent || 0,
      }
    };
    
    const command = EditorCommandFactory.createBlockCommand(
      newBlock,
      (block) => {
        setBlocks(prev => {
          const newBlocks = [...prev];
          newBlocks.splice(index + 1, 0, block);
          onChange?.(newBlocks);
          return newBlocks;
        });
      },
      (blockId) => {
        setBlocks(prev => {
          const newBlocks = prev.filter(b => b.id !== blockId);
          onChange?.(newBlocks);
          return newBlocks;
        });
      }
    );
    
    commandManager.execute(command);
  }, [blocks, onChange, commandManager]);

  const indentBlock = useCallback((id: string) => {
    updateBlock(id, {
      metadata: {
        ...blocks.find(b => b.id === id)?.metadata,
        indent: Math.min((blocks.find(b => b.id === id)?.metadata?.indent || 0) + 1, 5)
      }
    });
  }, [blocks, updateBlock]);

  const outdentBlock = useCallback((id: string) => {
    updateBlock(id, {
      metadata: {
        ...blocks.find(b => b.id === id)?.metadata,
        indent: Math.max((blocks.find(b => b.id === id)?.metadata?.indent || 0) - 1, 0)
      }
    });
  }, [blocks, updateBlock]);

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
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [blocks, onSave, handleUndo, handleRedo, commandManager]);

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
          isSelected={selectedBlockId === block.id}
          onSelect={setSelectedBlockId}
          style={{}}
        />
      </div>
    );
  }, [blocks, selectedBlockId, updateBlock, deleteBlock, addBlockBelow, indentBlock, outdentBlock]);

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
          </span>
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