import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import { Extension, textblockTypeInputRule, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Dropcursor from '@tiptap/extension-dropcursor';
import Gapcursor from '@tiptap/extension-gapcursor';
import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { VariableSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { 
  Bold, 
  Italic, 
  Strikethrough, 
  Code,
  List as ListIcon,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Type,
  CheckSquare,
  Plus,
  GripVertical,
  Trash2,
  Copy,
  ChevronRight,
  Highlighter
} from 'lucide-react';
import { cn } from '~/utils/cn';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';

// Block type definitions
export interface TiptapBlock {
  id: string;
  type: string;
  content: any;
  editor?: any; // Individual Tiptap editor instance
  height?: number;
  metadata?: {
    createdAt?: Date;
    updatedAt?: Date;
    version?: number;
  };
}

interface TiptapBlockEditorProps {
  initialBlocks?: TiptapBlock[];
  onChange?: (blocks: TiptapBlock[]) => void;
  onSave?: (blocks: TiptapBlock[]) => void;
  className?: string;
  enableVirtualScrolling?: boolean;
}

// Slash command suggestions
const SLASH_COMMANDS = [
  { name: 'Text', icon: Type, command: 'paragraph', description: 'Plain text block' },
  { name: 'Heading 1', icon: Heading1, command: 'heading1', description: 'Large heading' },
  { name: 'Heading 2', icon: Heading2, command: 'heading2', description: 'Medium heading' },
  { name: 'Heading 3', icon: Heading3, command: 'heading3', description: 'Small heading' },
  { name: 'Bullet List', icon: ListIcon, command: 'bulletList', description: 'Unordered list' },
  { name: 'Numbered List', icon: ListOrdered, command: 'orderedList', description: 'Ordered list' },
  { name: 'Task List', icon: CheckSquare, command: 'taskList', description: 'Checklist with tasks' },
  { name: 'Quote', icon: Quote, command: 'blockquote', description: 'Quote or callout' },
  { name: 'Code', icon: Code, command: 'codeBlock', description: 'Code snippet' },
];

// Individual block component
const BlockEditor = memo(({ 
  block,
  onUpdate, 
  onDelete,
  onAddBelow,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  isSelected,
  onSelect,
  style
}: {
  block: TiptapBlock;
  onUpdate: (id: string, content: any, height?: number) => void;
  onDelete: (id: string) => void;
  onAddBelow: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDuplicate: (id: string) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
  style?: React.CSSProperties;
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  // Custom markdown shortcuts extension
  const MarkdownShortcuts = Extension.create({
    name: 'markdownShortcuts',
    
    addInputRules() {
      return [
        // Headings
        textblockTypeInputRule({
          find: /^(#{1,6})\s$/,
          type: this.editor.schema.nodes.heading,
          getAttributes: match => {
            return { level: match[1].length };
          },
        }),
        // Bullet list
        wrappingInputRule({
          find: /^(\*|-)\s$/,
          type: this.editor.schema.nodes.bulletList,
        }),
        // Ordered list
        wrappingInputRule({
          find: /^(\d+)\.\s$/,
          type: this.editor.schema.nodes.orderedList,
          getAttributes: match => ({ start: +match[1] }),
          joinPredicate: (match, node) => node.childCount + node.attrs.start === +match[1],
        }),
        // Blockquote
        wrappingInputRule({
          find: /^>\s$/,
          type: this.editor.schema.nodes.blockquote,
        }),
        // Code block
        textblockTypeInputRule({
          find: /^```([a-z]+)?[\s\n]$/,
          type: this.editor.schema.nodes.codeBlock,
          getAttributes: match => ({ language: match[1] }),
        }),
      ];
    },
  });

  // Configure Tiptap extensions
  const extensions = useMemo(() => {
    const baseExtensions = [
      StarterKit.configure({
        history: {
          depth: 100,
        },
        heading: {
          levels: [1, 2, 3],
        },
        dropcursor: false, // Disable from StarterKit to avoid duplicate
        gapcursor: false,  // Disable from StarterKit to avoid duplicate
      }),
      MarkdownShortcuts,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return 'Heading...';
          }
          if (node.type.name === 'codeBlock') {
            return '// Write code...';
          }
          return "Type '/' for commands or start writing...";
        },
      }),
      Typography,
      Highlight,
      Dropcursor.configure({
        color: '#3b82f6',
        width: 2,
      }),
      Gapcursor,
    ];

    // Always include TaskList and TaskItem extensions
    baseExtensions.push(TaskList, TaskItem.configure({
      nested: true,
    }));

    return baseExtensions;
  }, []);

  // Initialize Tiptap editor
  const editor = useEditor({
    extensions,
    content: block.content || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[24px]',
      },
      handleKeyDown: (view, event) => {
        // Handle slash commands
        if (event.key === '/') {
          const { from } = view.state.selection;
          const coords = view.coordsAtPos(from);
          setSlashMenuPosition({
            top: coords.top + 20,
            left: coords.left,
          });
          setShowSlashMenu(true);
          setSearchQuery('');
          return false;
        }

        // Handle escape to close menus
        if (event.key === 'Escape') {
          if (showSlashMenu) {
            setShowSlashMenu(false);
            return true;
          }
        }

        // Navigate between blocks
        if (event.key === 'ArrowUp' && view.state.selection.$anchor.pos === 1) {
          event.preventDefault();
          // Focus previous block
          const prevBlock = document.querySelector(`[data-block-id="${block.id}"]`)
            ?.previousElementSibling?.querySelector('.ProseMirror');
          if (prevBlock instanceof HTMLElement) {
            prevBlock.focus();
            return true;
          }
        }

        if (event.key === 'ArrowDown') {
          const { doc } = view.state;
          const endPos = doc.content.size - 1;
          if (view.state.selection.$anchor.pos >= endPos) {
            event.preventDefault();
            // Focus next block
            const nextBlock = document.querySelector(`[data-block-id="${block.id}"]`)
              ?.nextElementSibling?.querySelector('.ProseMirror');
            if (nextBlock instanceof HTMLElement) {
              nextBlock.focus();
              return true;
            }
          }
        }

        // Create new block on Enter
        if (event.key === 'Enter' && !event.shiftKey) {
          const { $anchor } = view.state.selection;
          const isAtEnd = $anchor.pos === view.state.doc.content.size - 1;
          
          if (isAtEnd) {
            event.preventDefault();
            onAddBelow(block.id);
            return true;
          }
        }

        // Delete block on Backspace when empty
        if (event.key === 'Backspace') {
          const { doc } = view.state;
          if (doc.textContent === '') {
            event.preventDefault();
            onDelete(block.id);
            return true;
          }
        }

        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const content = editor.getHTML();
      onUpdate(block.id, content);
      
      // Measure height for virtual scrolling
      if (measureRef.current) {
        const height = measureRef.current.offsetHeight;
        if (height !== block.height) {
          onUpdate(block.id, content, height);
        }
      }
    },
    autofocus: false,
  });

  // Update editor content when block changes
  useEffect(() => {
    if (editor && block.content !== editor.getHTML()) {
      editor.commands.setContent(block.content || '');
    }
  }, [editor, block.content]);

  // Filter slash commands based on search
  const filteredCommands = useMemo(() => {
    if (!searchQuery) return SLASH_COMMANDS;
    
    const query = searchQuery.toLowerCase();
    return SLASH_COMMANDS.filter(cmd => 
      cmd.name.toLowerCase().includes(query) ||
      cmd.command.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Handle slash command selection
  const handleSlashCommand = useCallback((command: string) => {
    setShowSlashMenu(false);
    
    // Transform block type
    if (editor) {
      // First, clear the slash character
      const { from } = editor.state.selection;
      editor.chain()
        .focus()
        .deleteRange({ from: from - 1, to: from })
        .run();
      
      // Then apply the new formatting
      setTimeout(() => {
        switch (command) {
          case 'heading1':
            editor.chain().focus().setHeading({ level: 1 }).run();
            break;
          case 'heading2':
            editor.chain().focus().setHeading({ level: 2 }).run();
            break;
          case 'heading3':
            editor.chain().focus().setHeading({ level: 3 }).run();
            break;
          case 'bulletList':
            editor.chain().focus().toggleBulletList().run();
            break;
          case 'orderedList':
            editor.chain().focus().toggleOrderedList().run();
            break;
          case 'taskList':
            editor.chain().focus().toggleTaskList().run();
            break;
          case 'blockquote':
            editor.chain().focus().toggleBlockquote().run();
            break;
          case 'codeBlock':
            editor.chain().focus().toggleCodeBlock().run();
            break;
          default:
            editor.chain().focus().setParagraph().run();
        }
      }, 0);
    }
  }, [editor]);

  return (
    <div
      data-block-id={block.id}
      ref={measureRef}
      style={style}
      className={cn(
        "group relative transition-colors",
        isSelected && "bg-blue-50",
        "hover:bg-gray-50"
      )}
      onClick={() => onSelect(block.id)}
    >
      {/* Block controls */}
      <div className="absolute -left-1 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddBelow(block.id);
          }}
          className="p-1 hover:bg-gray-200 rounded"
          title="Add block below"
        >
          <Plus className="w-4 h-4 text-gray-400" />
        </button>
        
        <button
          className="p-1 hover:bg-gray-200 rounded cursor-move"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('blockId', block.id);
          }}
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          <GripVertical className="w-4 h-4 text-gray-400" />
        </button>
        
        {/* Block menu */}
        {showMenu && (
          <div className="absolute top-full left-0 mt-1 bg-white shadow-lg rounded-lg border border-gray-200 py-1 z-50 w-48">
            <button
              onClick={() => {
                onDuplicate(block.id);
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </button>
            <button
              onClick={() => {
                onMoveUp(block.id);
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <ChevronRight className="w-4 h-4 rotate-[-90deg]" />
              Move Up
            </button>
            <button
              onClick={() => {
                onMoveDown(block.id);
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <ChevronRight className="w-4 h-4 rotate-90" />
              Move Down
            </button>
            <hr className="my-1 border-gray-200" />
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
      </div>

      {/* Editor content */}
      <div className="ml-8 pr-4 py-2" ref={editorRef}>
        <EditorContent editor={editor} />
        
        {/* Bubble menu for text formatting */}
        {editor && mounted && (
          <BubbleMenu
            editor={editor}
            tippyOptions={{ duration: 100 }}
            className="bg-white shadow-lg rounded-lg border border-gray-200 p-1 flex items-center gap-1"
          >
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={cn(
                "p-1.5 rounded hover:bg-gray-100",
                editor.isActive('bold') && "bg-gray-200"
              )}
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={cn(
                "p-1.5 rounded hover:bg-gray-100",
                editor.isActive('italic') && "bg-gray-200"
              )}
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={cn(
                "p-1.5 rounded hover:bg-gray-100",
                editor.isActive('strike') && "bg-gray-200"
              )}
            >
              <Strikethrough className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleCode().run()}
              className={cn(
                "p-1.5 rounded hover:bg-gray-100",
                editor.isActive('code') && "bg-gray-200"
              )}
            >
              <Code className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              className={cn(
                "p-1.5 rounded hover:bg-gray-100",
                editor.isActive('highlight') && "bg-gray-200"
              )}
            >
              <Highlighter className="w-4 h-4" />
            </button>
          </BubbleMenu>
        )}
      </div>

      {/* Slash command menu */}
      {showSlashMenu && (
        <div
          className="fixed bg-white shadow-xl rounded-lg border border-gray-200 py-2 z-50 w-64 max-h-80 overflow-y-auto"
          style={{
            top: slashMenuPosition.top,
            left: slashMenuPosition.left,
          }}
          onMouseDown={(e) => e.preventDefault()} // Prevent losing focus
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search commands..."
            className="px-3 py-1 border-b border-gray-200 w-full outline-none text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowSlashMenu(false);
                editor?.chain().focus().run();
              } else if (e.key === 'Enter' && filteredCommands.length > 0) {
                e.preventDefault();
                handleSlashCommand(filteredCommands[0].command);
              }
            }}
          />
          {filteredCommands.map((cmd, index) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.command}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSlashCommand(cmd.command);
                }}
                onMouseDown={(e) => e.preventDefault()} // Prevent losing focus
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 w-full text-left"
              >
                <Icon className="w-4 h-4 text-gray-500" />
                <div>
                  <div className="text-sm font-medium">{cmd.name}</div>
                  <div className="text-xs text-gray-500">{cmd.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

BlockEditor.displayName = 'BlockEditor';

// Main editor component with virtual scrolling
export const TiptapBlockEditor = memo(function TiptapBlockEditor({
  initialBlocks = [],
  onChange,
  onSave,
  className,
  enableVirtualScrolling = true,
}: TiptapBlockEditorProps) {
  const [blocks, setBlocks] = useState<TiptapBlock[]>(() => 
    initialBlocks.length > 0 ? initialBlocks : [{
      id: uuidv4(),
      type: 'paragraph',
      content: '',
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    }]
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const listRef = useRef<List>(null);
  const rowHeights = useRef<{ [key: string]: number }>({});

  // Handle block updates
  const updateBlock = useCallback((id: string, content: any, height?: number) => {
    setBlocks(prev => {
      const newBlocks = prev.map(block => {
        if (block.id === id) {
          const updated = { 
            ...block, 
            content,
            metadata: { ...block.metadata, updatedAt: new Date() }
          };
          if (height !== undefined) {
            updated.height = height;
            rowHeights.current[id] = height;
          }
          return updated;
        }
        return block;
      });
      onChange?.(newBlocks);
      return newBlocks;
    });
    
    // Reset virtual list if height changed
    if (height !== undefined && listRef.current) {
      const index = blocks.findIndex(b => b.id === id);
      if (index !== -1) {
        listRef.current.resetAfterIndex(index);
      }
    }
  }, [blocks, onChange]);

  // Delete block
  const deleteBlock = useCallback((id: string) => {
    if (blocks.length === 1) return;
    
    setBlocks(prev => {
      const newBlocks = prev.filter(b => b.id !== id);
      onChange?.(newBlocks);
      return newBlocks;
    });
  }, [blocks.length, onChange]);

  // Add block below
  const addBlockBelow = useCallback((afterId: string) => {
    const index = blocks.findIndex(b => b.id === afterId);
    if (index === -1) return;
    
    const newBlock: TiptapBlock = {
      id: uuidv4(),
      type: 'paragraph',
      content: '',
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    };
    
    setBlocks(prev => {
      const newBlocks = [...prev];
      newBlocks.splice(index + 1, 0, newBlock);
      onChange?.(newBlocks);
      return newBlocks;
    });
    
    // Focus new block
    setTimeout(() => {
      const newBlockElement = document.querySelector(`[data-block-id="${newBlock.id}"] .ProseMirror`);
      if (newBlockElement instanceof HTMLElement) {
        newBlockElement.focus();
      }
    }, 100);
  }, [blocks, onChange]);

  // Move block up
  const moveBlockUp = useCallback((id: string) => {
    const index = blocks.findIndex(b => b.id === id);
    if (index <= 0) return;
    
    setBlocks(prev => {
      const newBlocks = [...prev];
      [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
      onChange?.(newBlocks);
      return newBlocks;
    });
  }, [blocks, onChange]);

  // Move block down
  const moveBlockDown = useCallback((id: string) => {
    const index = blocks.findIndex(b => b.id === id);
    if (index === -1 || index >= blocks.length - 1) return;
    
    setBlocks(prev => {
      const newBlocks = [...prev];
      [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
      onChange?.(newBlocks);
      return newBlocks;
    });
  }, [blocks, onChange]);

  // Duplicate block
  const duplicateBlock = useCallback((id: string) => {
    const index = blocks.findIndex(b => b.id === id);
    if (index === -1) return;
    
    const blockToDuplicate = blocks[index];
    const newBlock: TiptapBlock = {
      ...blockToDuplicate,
      id: uuidv4(),
      metadata: {
        ...blockToDuplicate.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    };
    
    setBlocks(prev => {
      const newBlocks = [...prev];
      newBlocks.splice(index + 1, 0, newBlock);
      onChange?.(newBlocks);
      return newBlocks;
    });
  }, [blocks, onChange]);

  // Handle drag and drop
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
    };
    
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const draggedId = e.dataTransfer!.getData('blockId');
      const dropTarget = (e.target as HTMLElement).closest('[data-block-id]');
      
      if (draggedId && dropTarget) {
        const dropId = dropTarget.getAttribute('data-block-id');
        if (dropId && draggedId !== dropId) {
          const draggedIndex = blocks.findIndex(b => b.id === draggedId);
          const dropIndex = blocks.findIndex(b => b.id === dropId);
          
          if (draggedIndex !== -1 && dropIndex !== -1) {
            setBlocks(prev => {
              const newBlocks = [...prev];
              const [draggedBlock] = newBlocks.splice(draggedIndex, 1);
              newBlocks.splice(dropIndex, 0, draggedBlock);
              onChange?.(newBlocks);
              return newBlocks;
            });
          }
        }
      }
    };
    
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [blocks, onChange]);

  // Save shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        onSave?.(blocks);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [blocks, onSave]);

  // Get row height for virtual scrolling
  const getItemSize = useCallback((index: number) => {
    const block = blocks[index];
    return rowHeights.current[block.id] || 80;
  }, [blocks]);

  // Render block for virtual list
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const block = blocks[index];
    
    return (
      <BlockEditor
        key={block.id}
        block={block}
        onUpdate={updateBlock}
        onDelete={deleteBlock}
        onAddBelow={addBlockBelow}
        onMoveUp={moveBlockUp}
        onMoveDown={moveBlockDown}
        onDuplicate={duplicateBlock}
        isSelected={selectedBlockId === block.id}
        onSelect={setSelectedBlockId}
        style={style}
      />
    );
  }, [blocks, selectedBlockId, updateBlock, deleteBlock, addBlockBelow, moveBlockUp, moveBlockDown, duplicateBlock]);

  return (
    <div className={cn("h-full bg-white flex flex-col", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">
            {blocks.length} block{blocks.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-gray-500">
            {enableVirtualScrolling ? 'Virtual scrolling enabled' : 'Standard rendering'}
          </span>
        </div>
        <button
          onClick={() => onSave?.(blocks)}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Save (⌘S)
        </button>
      </div>
      
      {/* Editor content */}
      <div className="flex-1 overflow-hidden">
        {enableVirtualScrolling && blocks.length > 50 ? (
          // Use virtual scrolling for large documents
          <AutoSizer>
            {({ height, width }) => (
              <List
                ref={listRef}
                height={height}
                itemCount={blocks.length}
                itemSize={getItemSize}
                width={width}
                overscanCount={5}
              >
                {Row}
              </List>
            )}
          </AutoSizer>
        ) : (
          // Standard rendering for smaller documents
          <div className="overflow-y-auto h-full">
            {blocks.map((block, index) => (
              <BlockEditor
                key={block.id}
                block={block}
                onUpdate={updateBlock}
                onDelete={deleteBlock}
                onAddBelow={addBlockBelow}
                onMoveUp={moveBlockUp}
                onMoveDown={moveBlockDown}
                onDuplicate={duplicateBlock}
                isSelected={selectedBlockId === block.id}
                onSelect={setSelectedBlockId}
              />
            ))}
          </div>
        )}
        
        {/* Add block button at the bottom (for non-virtual mode) */}
        {!enableVirtualScrolling && (
          <div className="p-4">
            <button
              onClick={() => {
                const newBlock: TiptapBlock = {
                  id: uuidv4(),
                  type: 'paragraph',
                  content: '',
                  metadata: {
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  }
                };
                setBlocks([...blocks, newBlock]);
              }}
              className="flex items-center gap-2 text-gray-400 hover:text-gray-600"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Add a block</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default TiptapBlockEditor;