import { useState, useCallback, useRef, memo } from 'react';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { 
  $createListNode, 
  $createListItemNode,
  ListNode,
  ListItemNode
} from '@lexical/list';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
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

// Block types
export type BlockType = 
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'numberedList'
  | 'quote';

export interface Block {
  id: string;
  type: BlockType;
  content: any;
  metadata?: {
    createdAt: Date;
    updatedAt: Date;
    version: number;
    indent?: number;
  };
}

interface LexicalBlockEditorProps {
  initialBlocks?: Block[];
  onChange?: (blocks: Block[]) => void;
  onSave?: (blocks: Block[]) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
}

// Individual block editor component
const BlockEditor = memo(({ 
  block, 
  index,
  onUpdate,
  onDelete,
  onAddBelow,
  isSelected,
  onSelect,
}: {
  block: Block;
  index: number;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onAddBelow: (afterId: string) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const initialConfig = {
    namespace: `block-${block.id}`,
    theme: {
      paragraph: 'mb-0',
      heading: {
        h1: 'text-3xl font-bold',
        h2: 'text-2xl font-semibold',
        h3: 'text-xl font-medium',
      },
      list: {
        ul: 'list-disc ml-4',
        ol: 'list-decimal ml-4',
        listitem: 'ml-2',
      },
      quote: 'border-l-4 border-gray-300 pl-4 italic',
    },
    onError: (error: Error) => {
      console.error('Lexical error:', error);
    },
    editorState: () => {
      const root = $getRoot();
      
      switch (block.type) {
        case 'heading1':
          root.append($createHeadingNode('h1').append($createTextNode(block.content || '')));
          break;
        case 'heading2':
          root.append($createHeadingNode('h2').append($createTextNode(block.content || '')));
          break;
        case 'heading3':
          root.append($createHeadingNode('h3').append($createTextNode(block.content || '')));
          break;
        case 'bulletList':
          const ul = $createListNode('bullet');
          ul.append($createListItemNode().append($createTextNode(block.content || '')));
          root.append(ul);
          break;
        case 'numberedList':
          const ol = $createListNode('number');
          ol.append($createListItemNode().append($createTextNode(block.content || '')));
          root.append(ol);
          break;
        case 'quote':
          root.append($createQuoteNode().append($createTextNode(block.content || '')));
          break;
        default:
          root.append($createParagraphNode().append($createTextNode(block.content || '')));
      }
    },
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
  };

  const handleChange = useCallback((editorState: any) => {
    editorState.read(() => {
      const root = $getRoot();
      const content = root.getTextContent();
      onUpdate(block.id, content);
    });
  }, [block.id, onUpdate]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target instanceof HTMLElement) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (range.endOffset === (range.endContainer.textContent?.length || 0)) {
          e.preventDefault();
          onAddBelow(block.id);
        }
      }
    } else if (e.key === 'Backspace' && block.content === '') {
      e.preventDefault();
      onDelete(block.id);
    }
  }, [block.id, block.content, onAddBelow, onDelete]);

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
      <div className="ml-12" onKeyDown={handleKeyDown as any}>
        <LexicalComposer initialConfig={initialConfig}>
          <RichTextPlugin
            contentEditable={
              <ContentEditable 
                className="outline-none min-h-[1.5em]"
                data-testid={`block-${block.id}`}
              />
            }
            placeholder={
              <div className="absolute top-0 left-0 text-gray-400 pointer-events-none">
                {block.type === 'heading1' ? 'Heading 1' :
                 block.type === 'heading2' ? 'Heading 2' :
                 block.type === 'heading3' ? 'Heading 3' :
                 block.type === 'quote' ? 'Quote' :
                 "Type '/' for commands"}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <OnChangePlugin onChange={handleChange} />
          <HistoryPlugin />
          <ListPlugin />
        </LexicalComposer>
      </div>
    </div>
  );
});

BlockEditor.displayName = 'BlockEditor';

export const LexicalBlockEditor = memo(function LexicalBlockEditor({
  initialBlocks = [],
  onChange,
  onSave,
  className,
  readOnly = false,
}: LexicalBlockEditorProps) {
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

  const updateBlock = useCallback((id: string, content: string) => {
    setBlocks(prev => {
      const newBlocks = prev.map(block => 
        block.id === id ? { ...block, content } : block
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
        version: 1,
        indent: blocks[index]?.metadata?.indent || 0,
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
      const newBlockElement = document.querySelector(`[data-testid="block-${newBlock.id}"]`);
      if (newBlockElement instanceof HTMLElement) {
        newBlockElement.focus();
      }
    }, 0);
  }, [blocks, onChange]);

  return (
    <div className={cn("h-full bg-white flex flex-col", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {blocks.length} block{blocks.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      
      {/* Editor content */}
      <div className="flex-1 overflow-y-auto">
        {blocks.map((block, index) => (
          <BlockEditor
            key={block.id}
            block={block}
            index={index}
            onUpdate={updateBlock}
            onDelete={deleteBlock}
            onAddBelow={addBlockBelow}
            isSelected={selectedBlockId === block.id}
            onSelect={setSelectedBlockId}
          />
        ))}
      </div>
    </div>
  );
});