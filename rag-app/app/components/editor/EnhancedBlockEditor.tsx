import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '~/utils/cn';
import { DatabaseTable } from '~/components/database-block/DatabaseTable';
import { AIBlock } from '~/components/blocks/AIBlock';
import { 
  Plus, 
  GripVertical, 
  ChevronRight,
  ChevronDown,
  Copy,
  Trash2,
  MoreHorizontal,
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  CheckSquare,
  Database,
  Sparkles
} from 'lucide-react';

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
  | 'database'
  | 'ai';

export interface Block {
  id: string;
  type: BlockType;
  content: any;
  metadata?: {
    createdAt?: Date;
    updatedAt?: Date;
    language?: string; // For code blocks
    checked?: boolean; // For todo items
  };
}

interface EnhancedBlockEditorProps {
  initialBlocks?: Block[];
  onChange?: (blocks: Block[]) => void;
  onSave?: (blocks: Block[]) => void;
  className?: string;
}

// Individual block component
const BlockComponent = memo(({ 
  block, 
  index,
  onUpdate,
  onDelete,
  onAddBelow,
  onTransform,
  isSelected,
  onSelect,
}: {
  block: Block;
  index: number;
  onUpdate: (id: string, content: any) => void;
  onDelete: (id: string) => void;
  onAddBelow: (afterId: string) => void;
  onTransform: (id: string, newType: BlockType) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastContentRef = useRef<string>('');
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize content on mount only
  useEffect(() => {
    if (contentRef.current && block.type !== 'code') {
      const blockContent = typeof block.content === 'string' ? block.content : '';
      contentRef.current.textContent = blockContent;
      lastContentRef.current = blockContent;
    }
  }, [block.id]); // Only re-run when block.id changes (new block)

  // Update DOM when content changes from outside (but not when editing)
  useEffect(() => {
    if (contentRef.current && block.type !== 'code' && !isEditing) {
      const blockContent = typeof block.content === 'string' ? block.content : '';
      const currentText = contentRef.current.textContent || '';
      // Only update if content is different from what's in the DOM
      if (currentText !== blockContent && lastContentRef.current !== currentText) {
        contentRef.current.textContent = blockContent;
        lastContentRef.current = blockContent;
      }
    }
  }, [block.content, block.type, isEditing]);

  // Save cursor position
  const saveCursorPosition = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return {
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      startContainer: range.startContainer,
      endContainer: range.endContainer
    };
  }, []);

  // Restore cursor position
  const restoreCursorPosition = useCallback((position: any) => {
    if (!position || !contentRef.current) return;
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      
      // If the nodes still exist, restore position
      if (contentRef.current.contains(position.startContainer)) {
        range.setStart(position.startContainer, position.startOffset);
        range.setEnd(position.endContainer, position.endOffset);
      } else {
        // Otherwise, place cursor at the end
        range.selectNodeContents(contentRef.current);
        range.collapse(false);
      }
      
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch (e) {
      // If restoration fails, place cursor at the end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(contentRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  // Handle content changes
  const handleInput = useCallback(() => {
    if (!contentRef.current) return;
    const text = contentRef.current.textContent || '';
    
    // Store the text immediately to prevent re-renders from resetting it
    lastContentRef.current = text;
    
    // Check for block transformations
    if (block.type === 'paragraph') {
      if (text.startsWith('# ')) {
        const newContent = text.slice(2);
        onTransform(block.id, 'heading1');
        onUpdate(block.id, newContent);
        
        // Update the content after transformation
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.textContent = newContent;
            lastContentRef.current = newContent;
            // Place cursor at the end
            const range = document.createRange();
            const sel = window.getSelection();
            if (contentRef.current.firstChild) {
              range.setStart(contentRef.current.firstChild, newContent.length);
              range.setEnd(contentRef.current.firstChild, newContent.length);
            } else {
              range.selectNodeContents(contentRef.current);
              range.collapse(false);
            }
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }, 0);
        return;
      }
      if (text.startsWith('## ')) {
        const newContent = text.slice(3);
        onTransform(block.id, 'heading2');
        onUpdate(block.id, newContent);
        
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.textContent = newContent;
            lastContentRef.current = newContent;
            const range = document.createRange();
            const sel = window.getSelection();
            if (contentRef.current.firstChild) {
              range.setStart(contentRef.current.firstChild, newContent.length);
              range.setEnd(contentRef.current.firstChild, newContent.length);
            } else {
              range.selectNodeContents(contentRef.current);
              range.collapse(false);
            }
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }, 0);
        return;
      }
      if (text.startsWith('### ')) {
        const newContent = text.slice(4);
        onTransform(block.id, 'heading3');
        onUpdate(block.id, newContent);
        
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.textContent = newContent;
            lastContentRef.current = newContent;
            const range = document.createRange();
            const sel = window.getSelection();
            if (contentRef.current.firstChild) {
              range.setStart(contentRef.current.firstChild, newContent.length);
              range.setEnd(contentRef.current.firstChild, newContent.length);
            } else {
              range.selectNodeContents(contentRef.current);
              range.collapse(false);
            }
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }, 0);
        return;
      }
      if ((text.startsWith('* ') || text.startsWith('- ')) && text.length === 2) {
        // Only transform if user just typed the pattern
        onTransform(block.id, 'bulletList');
        onUpdate(block.id, '');
        
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.textContent = '';
            lastContentRef.current = '';
            contentRef.current.focus();
          }
        }, 0);
        return;
      }
      if (text === '```') {
        onTransform(block.id, 'code');
        onUpdate(block.id, { code: '', language: 'javascript' });
        setTimeout(() => {
          // Focus the code textarea if it exists
          const codeTextarea = document.querySelector(`[data-block-id="${block.id}"] textarea`);
          if (codeTextarea instanceof HTMLTextAreaElement) {
            codeTextarea.focus();
          }
        }, 50);
        return;
      }
    }
    
    // Always update on input
    onUpdate(block.id, block.type === 'code' ? { ...block.content, code: text } : text);
    lastContentRef.current = text;
  }, [block.id, block.type, block.content, onUpdate, onTransform]);

  // Handle key events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onAddBelow(block.id);
    } else if (e.key === 'Backspace' && contentRef.current?.textContent === '') {
      e.preventDefault();
      onDelete(block.id);
    }
  }, [block.id, onAddBelow, onDelete]);

  // Render content based on block type
  const renderContent = () => {
    if (block.type === 'code') {
      return (
        <div className="relative">
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-2 border-b border-gray-800">
              <select
                value={block.content?.language || 'javascript'}
                onChange={(e) => onUpdate(block.id, { ...block.content, language: e.target.value })}
                className="bg-gray-800 text-gray-200 text-xs px-2 py-1 rounded"
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="css">CSS</option>
                <option value="html">HTML</option>
                <option value="json">JSON</option>
                <option value="sql">SQL</option>
                <option value="bash">Bash</option>
              </select>
              <button
                onClick={() => {
                  const code = block.content?.code || '';
                  navigator.clipboard.writeText(code);
                }}
                className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-gray-200"
              >
                Copy
              </button>
            </div>
            <textarea
              ref={codeTextareaRef}
              value={block.content?.code || ''}
              onChange={(e) => onUpdate(block.id, { ...block.content, code: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const start = e.currentTarget.selectionStart;
                  const end = e.currentTarget.selectionEnd;
                  const value = e.currentTarget.value;
                  const newValue = value.substring(0, start) + '  ' + value.substring(end);
                  onUpdate(block.id, { ...block.content, code: newValue });
                  setTimeout(() => {
                    if (codeTextareaRef.current) {
                      codeTextareaRef.current.selectionStart = codeTextareaRef.current.selectionEnd = start + 2;
                    }
                  }, 0);
                } else if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onAddBelow(block.id);
                } else if (e.key === 'Backspace' && e.currentTarget.value === '') {
                  e.preventDefault();
                  onDelete(block.id);
                }
              }}
              className="w-full bg-gray-900 text-gray-200 font-mono text-sm p-3 outline-none resize-none"
              style={{ minHeight: '100px' }}
              placeholder="// Enter code here..."
              spellCheck={false}
            />
          </div>
        </div>
      );
    }

    const commonProps = {
      ref: contentRef,
      contentEditable: true,
      suppressContentEditableWarning: true,
      onInput: handleInput,
      onKeyDown: handleKeyDown,
      onFocus: () => {
        setIsEditing(true);
      },
      onBlur: () => {
        setIsEditing(false);
        // Always save content on blur
        if (contentRef.current) {
          const text = contentRef.current.textContent || '';
          onUpdate(block.id, text);
          lastContentRef.current = text;
        }
      },
      className: 'outline-none',
      'data-placeholder': block.type === 'paragraph' ? "Type '/' for commands or start writing..." : '',
    };

    switch (block.type) {
      case 'heading1':
        return <h1 {...commonProps} className="text-3xl font-bold outline-none" />;
      case 'heading2':
        return <h2 {...commonProps} className="text-2xl font-semibold outline-none" />;
      case 'heading3':
        return <h3 {...commonProps} className="text-xl font-medium outline-none" />;
      case 'bulletList':
        return (
          <div className="flex items-start gap-2">
            <span className="text-gray-400 mt-1">•</span>
            <div {...commonProps} className="flex-1 outline-none" />
          </div>
        );
      case 'numberedList':
        return (
          <div className="flex items-start gap-2">
            <span className="text-gray-400 mt-1">{index + 1}.</span>
            <div {...commonProps} className="flex-1 outline-none" />
          </div>
        );
      case 'todoList':
        return (
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={block.metadata?.checked || false}
              onChange={(e) => onUpdate(block.id, block.content)}
            />
            <div {...commonProps} className="flex-1 outline-none" />
          </div>
        );
      case 'quote':
        return (
          <blockquote className="border-l-4 border-gray-300 pl-4 italic">
            <div {...commonProps} />
          </blockquote>
        );
      case 'divider':
        return <hr className="my-4 border-gray-300" />;
      case 'database':
        return (
          <DatabaseTable
            initialData={block.content?.data || []}
            onDataChange={(data) => onUpdate(block.id, { ...block.content, data })}
            className="w-full"
          />
        );
      case 'ai':
        return (
          <AIBlock
            content={block.content}
            onContentChange={(content) => onUpdate(block.id, content)}
            context={{
              blockId: block.id,
              pageContent: '', // Will be populated from parent
              metadata: block.metadata
            }}
          />
        );
      default:
        return <div {...commonProps} />;
    }
  };

  return (
    <div
      className={cn(
        "group relative px-4 py-2 transition-colors",
        isSelected && "bg-blue-50 border-l-2 border-blue-400",
        isHovered && !isSelected && "bg-gray-50"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(block.id)}
    >
      {/* Block handle - Notion style */}
      <div className={cn(
        "absolute -left-1 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5",
        isSelected && "opacity-100"
      )}>
        {/* Add button */}
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
        
        {/* Grip handle for drag and menu */}
        <button
          className="p-1 hover:bg-gray-200 rounded cursor-move relative"
          draggable
          onDragStart={(e) => {
            setIsDragging(true);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('blockId', block.id);
          }}
          onDragEnd={() => setIsDragging(false)}
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          <GripVertical className="w-4 h-4 text-gray-400" />
        </button>
        
        {/* Dropdown menu */}
        {showMenu && (
          <div className="absolute top-full left-0 mt-1 bg-white shadow-lg rounded-lg border border-gray-200 py-1 z-50 w-48">
            <div className="px-3 py-1 text-xs font-medium text-gray-500 uppercase">Turn into</div>
            <button
              onClick={() => {
                onTransform(block.id, 'paragraph');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <Type className="w-4 h-4" />
              Text
            </button>
            <button
              onClick={() => {
                onTransform(block.id, 'heading1');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <Heading1 className="w-4 h-4" />
              Heading 1
            </button>
            <button
              onClick={() => {
                onTransform(block.id, 'heading2');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <Heading2 className="w-4 h-4" />
              Heading 2
            </button>
            <button
              onClick={() => {
                onTransform(block.id, 'heading3');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <Heading3 className="w-4 h-4" />
              Heading 3
            </button>
            <button
              onClick={() => {
                onTransform(block.id, 'bulletList');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <List className="w-4 h-4" />
              Bullet List
            </button>
            <button
              onClick={() => {
                onTransform(block.id, 'numberedList');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <ListOrdered className="w-4 h-4" />
              Numbered List
            </button>
            <button
              onClick={() => {
                onTransform(block.id, 'todoList');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <CheckSquare className="w-4 h-4" />
              To-do List
            </button>
            <button
              onClick={() => {
                onTransform(block.id, 'quote');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <Quote className="w-4 h-4" />
              Quote
            </button>
            <button
              onClick={() => {
                onTransform(block.id, 'code');
                onUpdate(block.id, { code: '', language: 'javascript' });
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-sm w-full text-left"
            >
              <Code className="w-4 h-4" />
              Code
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

      {/* Block content */}
      <div className="ml-8">
        {renderContent()}
      </div>
    </div>
  );
});

BlockComponent.displayName = 'BlockComponent';

export const EnhancedBlockEditor = memo(function EnhancedBlockEditor({
  initialBlocks = [],
  onChange,
  onSave,
  className,
}: EnhancedBlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(() => 
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
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);

  const updateBlock = useCallback((id: string, content: any) => {
    setBlocks(prev => {
      const newBlocks = prev.map(block => 
        block.id === id ? { ...block, content, metadata: { ...block.metadata, updatedAt: new Date() } } : block
      );
      onChange?.(newBlocks);
      return newBlocks;
    });
  }, [onChange]);

  const deleteBlock = useCallback((id: string) => {
    if (blocks.length === 1) return;
    
    setBlocks(prev => {
      const newBlocks = prev.filter(b => b.id !== id);
      onChange?.(newBlocks);
      return newBlocks;
    });
  }, [blocks.length, onChange]);

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
      }
    };
    
    setBlocks(prev => {
      const newBlocks = [...prev];
      newBlocks.splice(index + 1, 0, newBlock);
      onChange?.(newBlocks);
      return newBlocks;
    });
    
    // Focus the new block
    setTimeout(() => {
      const newBlockElement = document.querySelector(`[data-block-id="${newBlock.id}"]`);
      if (newBlockElement instanceof HTMLElement) {
        const editableElement = newBlockElement.querySelector('[contenteditable]');
        if (editableElement instanceof HTMLElement) {
          editableElement.focus();
        }
      }
    }, 0);
  }, [blocks, onChange]);

  const transformBlock = useCallback((id: string, newType: BlockType) => {
    setBlocks(prev => {
      const newBlocks = prev.map(block => {
        if (block.id === id) {
          // Preserve text content when transforming, except for special blocks
          const currentContent = typeof block.content === 'string' ? block.content : '';
          
          let newContent: any = currentContent;
          if (newType === 'code') {
            newContent = { code: currentContent, language: 'javascript' };
          } else if (newType === 'database') {
            // Initialize with sample data structure
            newContent = {
              data: [
                { id: '1', name: 'Sample Item 1', status: 'Active', priority: 'High' },
                { id: '2', name: 'Sample Item 2', status: 'Pending', priority: 'Medium' },
              ]
            };
          } else if (newType === 'ai') {
            // Initialize AI block with empty analysis
            newContent = {
              prompt: '',
              analysis: '',
              context: {}
            };
          }
          
          return { ...block, type: newType, content: newContent };
        }
        return block;
      });
      onChange?.(newBlocks);
      return newBlocks;
    });
  }, [onChange]);

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

  return (
    <div className={cn("h-full bg-white flex flex-col", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {blocks.length} block{blocks.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => onSave?.(blocks)}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Save
        </button>
      </div>
      
      {/* Editor content */}
      <div className="flex-1 overflow-y-auto">
        {blocks.map((block, index) => (
          <div 
            key={block.id} 
            data-block-id={block.id}
            draggable={false}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverBlockId(block.id);
            }}
            onDragLeave={() => {
              setDragOverBlockId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const draggedId = e.dataTransfer.getData('blockId');
              if (draggedId && draggedId !== block.id) {
                // Reorder blocks
                const draggedIndex = blocks.findIndex(b => b.id === draggedId);
                const dropIndex = blocks.findIndex(b => b.id === block.id);
                
                if (draggedIndex !== -1 && dropIndex !== -1) {
                  const newBlocks = [...blocks];
                  const [draggedBlock] = newBlocks.splice(draggedIndex, 1);
                  newBlocks.splice(dropIndex, 0, draggedBlock);
                  setBlocks(newBlocks);
                  onChange?.(newBlocks);
                }
              }
              setDragOverBlockId(null);
            }}
            className={cn(
              dragOverBlockId === block.id && "border-t-2 border-blue-400"
            )}
          >
            <BlockComponent
              block={block}
              index={index}
              onUpdate={updateBlock}
              onDelete={deleteBlock}
              onAddBelow={addBlockBelow}
              onTransform={transformBlock}
              isSelected={selectedBlockId === block.id}
              onSelect={setSelectedBlockId}
            />
          </div>
        ))}
        
        {/* Add block button at the bottom */}
        <div className="p-4">
          <button
            onClick={() => {
              const newBlock: Block = {
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
      </div>
    </div>
  );
});