/**
 * AI Context Panel Component
 * Contextual AI assistant for individual blocks with type-specific suggestions
 */

import { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Type,
  Hash,
  List,
  Table,
  Code,
  Quote,
  Image,
  Database,
  ChevronRight,
  X,
  Loader2,
  Wand2,
  Languages,
  FileText,
  BarChart,
  CheckSquare,
  ArrowUpDown,
  Scissors,
  Copy,
  Trash2
} from 'lucide-react';
import { cn } from '~/utils/cn';
import type { Block, BlockType } from './EnhancedBlockEditor';

interface AIContextPanelProps {
  show: boolean;
  block: Block;
  onClose: () => void;
  onAction: (action: string) => Promise<void>;
  position?: { x: number; y: number };
  className?: string;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  command: string;
  description?: string;
  category?: 'transform' | 'edit' | 'style' | 'generate';
}

// Type-specific quick actions
const getQuickActionsForType = (blockType: BlockType): QuickAction[] => {
  const commonActions: QuickAction[] = [
    { 
      id: 'duplicate', 
      label: 'Duplicate', 
      icon: <Copy className="w-4 h-4" />, 
      command: 'duplicate this block',
      category: 'edit'
    },
    { 
      id: 'delete', 
      label: 'Delete', 
      icon: <Trash2 className="w-4 h-4" />, 
      command: 'delete this block',
      category: 'edit'
    },
    {
      id: 'move-up',
      label: 'Move Up',
      icon: <ArrowUpDown className="w-4 h-4" />,
      command: 'move this block up',
      category: 'edit'
    }
  ];

  const typeSpecificActions: Record<BlockType, QuickAction[]> = {
    paragraph: [
      { 
        id: 'shorten', 
        label: 'Shorten', 
        icon: <Scissors className="w-4 h-4" />, 
        command: 'shorten this paragraph',
        description: 'Make more concise',
        category: 'edit'
      },
      { 
        id: 'expand', 
        label: 'Expand', 
        icon: <FileText className="w-4 h-4" />, 
        command: 'expand this with more details',
        description: 'Add more information',
        category: 'generate'
      },
      { 
        id: 'to-list', 
        label: 'Convert to List', 
        icon: <List className="w-4 h-4" />, 
        command: 'convert to bullet points',
        description: 'Break into list items',
        category: 'transform'
      },
      { 
        id: 'translate', 
        label: 'Translate', 
        icon: <Languages className="w-4 h-4" />, 
        command: 'translate to Spanish',
        description: 'Change language',
        category: 'generate'
      },
      {
        id: 'to-heading',
        label: 'Make Heading',
        icon: <Hash className="w-4 h-4" />,
        command: 'convert to heading',
        category: 'transform'
      }
    ],

    heading1: [
      { 
        id: 'to-paragraph', 
        label: 'To Paragraph', 
        icon: <Type className="w-4 h-4" />, 
        command: 'convert to paragraph',
        category: 'transform'
      },
      { 
        id: 'capitalize', 
        label: 'Capitalize', 
        icon: <Type className="w-4 h-4" />, 
        command: 'capitalize this heading',
        category: 'style'
      },
      {
        id: 'to-question',
        label: 'Make Question',
        icon: <Wand2 className="w-4 h-4" />,
        command: 'convert to a question',
        category: 'edit'
      }
    ],

    heading2: [
      { 
        id: 'to-paragraph', 
        label: 'To Paragraph', 
        icon: <Type className="w-4 h-4" />, 
        command: 'convert to paragraph',
        category: 'transform'
      },
      { 
        id: 'to-h1', 
        label: 'To Heading 1', 
        icon: <Hash className="w-4 h-4" />, 
        command: 'convert to heading 1',
        category: 'transform'
      }
    ],

    heading3: [
      { 
        id: 'to-paragraph', 
        label: 'To Paragraph', 
        icon: <Type className="w-4 h-4" />, 
        command: 'convert to paragraph',
        category: 'transform'
      },
      { 
        id: 'to-h2', 
        label: 'To Heading 2', 
        icon: <Hash className="w-4 h-4" />, 
        command: 'convert to heading 2',
        category: 'transform'
      }
    ],

    bulletList: [
      { 
        id: 'to-table', 
        label: 'Convert to Table', 
        icon: <Table className="w-4 h-4" />, 
        command: 'convert to table',
        description: 'Create structured table',
        category: 'transform'
      },
      { 
        id: 'to-numbered', 
        label: 'Number Items', 
        icon: <List className="w-4 h-4" />, 
        command: 'convert to numbered list',
        category: 'transform'
      },
      { 
        id: 'sort', 
        label: 'Sort A-Z', 
        icon: <ArrowUpDown className="w-4 h-4" />, 
        command: 'sort alphabetically',
        category: 'edit'
      },
      {
        id: 'to-checklist',
        label: 'Add Checkboxes',
        icon: <CheckSquare className="w-4 h-4" />,
        command: 'convert to checklist',
        category: 'transform'
      }
    ],

    numberedList: [
      { 
        id: 'to-bullets', 
        label: 'Remove Numbers', 
        icon: <List className="w-4 h-4" />, 
        command: 'convert to bullet list',
        category: 'transform'
      },
      { 
        id: 'to-table', 
        label: 'Convert to Table', 
        icon: <Table className="w-4 h-4" />, 
        command: 'convert to table',
        category: 'transform'
      },
      { 
        id: 'reverse', 
        label: 'Reverse Order', 
        icon: <ArrowUpDown className="w-4 h-4" />, 
        command: 'reverse the order',
        category: 'edit'
      }
    ],

    todoList: [
      { 
        id: 'prioritize', 
        label: 'Prioritize', 
        icon: <ArrowUpDown className="w-4 h-4" />, 
        command: 'sort by priority',
        category: 'edit'
      },
      { 
        id: 'to-bullets', 
        label: 'Remove Checkboxes', 
        icon: <List className="w-4 h-4" />, 
        command: 'convert to bullet list',
        category: 'transform'
      }
    ],

    quote: [
      { 
        id: 'to-paragraph', 
        label: 'To Paragraph', 
        icon: <Type className="w-4 h-4" />, 
        command: 'convert to paragraph',
        category: 'transform'
      },
      { 
        id: 'add-citation', 
        label: 'Add Citation', 
        icon: <Quote className="w-4 h-4" />, 
        command: 'add citation',
        category: 'edit'
      }
    ],

    code: [
      { 
        id: 'add-comments', 
        label: 'Add Comments', 
        icon: <Code className="w-4 h-4" />, 
        command: 'add comments to this code',
        description: 'Explain the code',
        category: 'generate'
      },
      { 
        id: 'refactor', 
        label: 'Refactor', 
        icon: <Wand2 className="w-4 h-4" />, 
        command: 'refactor this code',
        description: 'Improve code quality',
        category: 'edit'
      },
      { 
        id: 'add-types', 
        label: 'Add Types', 
        icon: <Code className="w-4 h-4" />, 
        command: 'add TypeScript types',
        category: 'generate'
      },
      {
        id: 'optimize',
        label: 'Optimize',
        icon: <Wand2 className="w-4 h-4" />,
        command: 'optimize performance',
        category: 'edit'
      }
    ],

    database: [
      { 
        id: 'add-column', 
        label: 'Add Column', 
        icon: <Table className="w-4 h-4" />, 
        command: 'add new column',
        category: 'edit'
      },
      { 
        id: 'sort', 
        label: 'Sort Data', 
        icon: <ArrowUpDown className="w-4 h-4" />, 
        command: 'sort by first column',
        category: 'edit'
      },
      { 
        id: 'to-chart', 
        label: 'Create Chart', 
        icon: <BarChart className="w-4 h-4" />, 
        command: 'create chart from this data',
        description: 'Visualize the data',
        category: 'transform'
      },
      {
        id: 'add-stats',
        label: 'Add Statistics',
        icon: <Database className="w-4 h-4" />,
        command: 'add statistics row',
        category: 'generate'
      }
    ],

    ai: [
      { 
        id: 'regenerate', 
        label: 'Regenerate', 
        icon: <Sparkles className="w-4 h-4" />, 
        command: 'regenerate response',
        category: 'generate'
      },
      { 
        id: 'improve', 
        label: 'Improve', 
        icon: <Wand2 className="w-4 h-4" />, 
        command: 'improve this response',
        category: 'edit'
      }
    ],

    divider: []
  };

  return [...(typeSpecificActions[blockType] || []), ...commonActions];
};

export function AIContextPanel({
  show,
  block,
  onClose,
  onAction,
  position,
  className
}: AIContextPanelProps) {
  const [customCommand, setCustomCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickActions = getQuickActionsForType(block.type);
  
  // Group actions by category
  const actionsByCategory = quickActions.reduce((acc, action) => {
    const category = action.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(action);
    return acc;
  }, {} as Record<string, QuickAction[]>);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (show) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [show, onClose]);

  const handleAction = async (command: string, actionId?: string) => {
    console.log('[AIContextPanel] Triggering action:', { command, actionId, blockId: block.id });
    setIsProcessing(true);
    setProcessingAction(actionId || 'custom');
    
    try {
      await onAction(command);
      onClose();
    } catch (error) {
      console.error('[AIContextPanel] Action failed:', error);
    } finally {
      setIsProcessing(false);
      setProcessingAction(null);
    }
  };

  const handleCustomCommand = async () => {
    if (!customCommand.trim()) return;
    await handleAction(customCommand);
  };

  if (!show) return null;

  // Calculate panel position
  const style: React.CSSProperties = position ? {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: 'translateY(-100%)',
    zIndex: 50
  } : {};

  const categoryLabels: Record<string, string> = {
    transform: 'Transform',
    edit: 'Edit',
    style: 'Style',
    generate: 'Generate',
    other: 'Actions'
  };

  const categoryIcons: Record<string, React.ReactNode> = {
    transform: <Wand2 className="w-3 h-3" />,
    edit: <Type className="w-3 h-3" />,
    style: <Sparkles className="w-3 h-3" />,
    generate: <FileText className="w-3 h-3" />,
    other: <ChevronRight className="w-3 h-3" />
  };

  return (
    <div
      ref={containerRef}
      style={style}
      className={cn(
        "w-72 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden",
        "transform transition-all duration-200 ease-out",
        show ? "scale-100 opacity-100" : "scale-95 opacity-0",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-gray-900">
            AI Actions - {block.type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-gray-100 rounded transition-colors"
        >
          <X className="w-3 h-3 text-gray-500" />
        </button>
      </div>

      {/* Quick actions grouped by category */}
      <div className="max-h-96 overflow-y-auto">
        {Object.entries(actionsByCategory).map(([category, actions]) => (
          <div key={category}>
            {actions.length > 0 && (
              <>
                <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-600">
                    {categoryIcons[category]}
                    {categoryLabels[category]}
                  </div>
                </div>
                <div className="py-1">
                  {actions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleAction(action.command, action.id)}
                      disabled={isProcessing}
                      className={cn(
                        "w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors",
                        "flex items-start gap-2 group",
                        isProcessing && processingAction === action.id && "bg-blue-50"
                      )}
                    >
                      <div className="mt-0.5 text-gray-400 group-hover:text-blue-600">
                        {processingAction === action.id && isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          action.icon
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-gray-900">{action.label}</div>
                        {action.description && (
                          <div className="text-xs text-gray-500">{action.description}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Custom command input */}
      <div className="border-t border-gray-100 p-3">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCustomCommand();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Custom command..."
            className="w-full px-3 py-2 pr-8 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={isProcessing}
          />
          {customCommand && (
            <button
              onClick={handleCustomCommand}
              disabled={isProcessing}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded transition-colors"
            >
              {processingAction === 'custom' && isProcessing ? (
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}