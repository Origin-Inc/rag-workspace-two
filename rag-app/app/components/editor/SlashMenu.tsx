import { useEffect, useRef, useState, memo } from 'react';
import { cn } from '~/utils/cn';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  CodeSquare,
  Minus,
  Image,
  Table,
  ToggleLeft,
  FileText,
  Calendar,
  CheckSquare,
  AlertCircle,
  Columns,
  Database,
  Video,
  Music,
  Link2,
  Sparkles,
} from 'lucide-react';

interface Command {
  id: string;
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  keywords: string[];
}

const commands: Command[] = [
  {
    id: 'heading1',
    type: 'heading1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: <Heading1 className="w-4 h-4" />,
    keywords: ['h1', 'title', 'header'],
  },
  {
    id: 'heading2',
    type: 'heading2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: <Heading2 className="w-4 h-4" />,
    keywords: ['h2', 'subtitle'],
  },
  {
    id: 'heading3',
    type: 'heading3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: <Heading3 className="w-4 h-4" />,
    keywords: ['h3', 'subheading'],
  },
  {
    id: 'bulletList',
    type: 'bulletList',
    label: 'Bullet List',
    description: 'Create a bulleted list',
    icon: <List className="w-4 h-4" />,
    keywords: ['ul', 'unordered', 'bullets'],
  },
  {
    id: 'orderedList',
    type: 'orderedList',
    label: 'Numbered List',
    description: 'Create a numbered list',
    icon: <ListOrdered className="w-4 h-4" />,
    keywords: ['ol', 'ordered', 'numbers'],
  },
  {
    id: 'todoList',
    type: 'todoList',
    label: 'To-do List',
    description: 'Track tasks with checkboxes',
    icon: <CheckSquare className="w-4 h-4" />,
    keywords: ['todo', 'task', 'checkbox', 'checklist'],
  },
  {
    id: 'blockquote',
    type: 'blockquote',
    label: 'Quote',
    description: 'Add a quote block',
    icon: <Quote className="w-4 h-4" />,
    keywords: ['quote', 'citation', 'blockquote'],
  },
  {
    id: 'codeBlock',
    type: 'codeBlock',
    label: 'Code Block',
    description: 'Add a code snippet',
    icon: <CodeSquare className="w-4 h-4" />,
    keywords: ['code', 'snippet', 'programming'],
  },
  {
    id: 'horizontalRule',
    type: 'horizontalRule',
    label: 'Divider',
    description: 'Add a horizontal divider',
    icon: <Minus className="w-4 h-4" />,
    keywords: ['hr', 'divider', 'separator', 'line'],
  },
  {
    id: 'callout',
    type: 'callout',
    label: 'Callout',
    description: 'Add a callout box',
    icon: <AlertCircle className="w-4 h-4" />,
    keywords: ['info', 'warning', 'tip', 'note', 'alert'],
  },
  {
    id: 'toggle',
    type: 'toggle',
    label: 'Toggle',
    description: 'Add collapsible content',
    icon: <ToggleLeft className="w-4 h-4" />,
    keywords: ['collapse', 'expand', 'accordion', 'details'],
  },
  {
    id: 'table',
    type: 'table',
    label: 'Table',
    description: 'Add a table',
    icon: <Table className="w-4 h-4" />,
    keywords: ['table', 'grid', 'spreadsheet'],
  },
  {
    id: 'columns',
    type: 'columns',
    label: 'Columns',
    description: 'Add column layout',
    icon: <Columns className="w-4 h-4" />,
    keywords: ['columns', 'layout', 'split'],
  },
  {
    id: 'image',
    type: 'image',
    label: 'Image',
    description: 'Upload or embed an image',
    icon: <Image className="w-4 h-4" />,
    keywords: ['img', 'picture', 'photo', 'media'],
  },
  {
    id: 'video',
    type: 'video',
    label: 'Video',
    description: 'Embed a video',
    icon: <Video className="w-4 h-4" />,
    keywords: ['video', 'movie', 'youtube', 'media'],
  },
  {
    id: 'audio',
    type: 'audio',
    label: 'Audio',
    description: 'Embed audio',
    icon: <Music className="w-4 h-4" />,
    keywords: ['audio', 'music', 'sound', 'podcast'],
  },
  {
    id: 'file',
    type: 'file',
    label: 'File',
    description: 'Attach a file',
    icon: <FileText className="w-4 h-4" />,
    keywords: ['file', 'attachment', 'document', 'pdf'],
  },
  {
    id: 'embed',
    type: 'embed',
    label: 'Embed',
    description: 'Embed external content',
    icon: <Link2 className="w-4 h-4" />,
    keywords: ['embed', 'iframe', 'external', 'link'],
  },
  {
    id: 'database',
    type: 'database',
    label: 'Database',
    description: 'Add a database view',
    icon: <Database className="w-4 h-4" />,
    keywords: ['database', 'table', 'data', 'records'],
  },
  {
    id: 'ai',
    type: 'ai',
    label: 'AI Analysis',
    description: 'Add AI-powered analysis block',
    icon: <Sparkles className="w-4 h-4" />,
    keywords: ['ai', 'analysis', 'intelligence', 'smart', 'assistant'],
  },
  {
    id: 'calendar',
    type: 'calendar',
    label: 'Calendar',
    description: 'Add a calendar view',
    icon: <Calendar className="w-4 h-4" />,
    keywords: ['calendar', 'date', 'schedule', 'events'],
  },
];

interface SlashMenuProps {
  position: { x: number; y: number };
  onSelect: (command: Command) => void;
  onClose: () => void;
  searchQuery?: string;
}

export const SlashMenu = memo(function SlashMenu({
  position,
  onSelect,
  onClose,
  searchQuery = '',
}: SlashMenuProps) {
  const [search, setSearch] = useState(searchQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Filter commands based on search
  const filteredCommands = commands.filter(cmd => {
    const searchLower = search.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.description.toLowerCase().includes(searchLower) ||
      cmd.keywords.some(keyword => keyword.toLowerCase().includes(searchLower))
    );
  });

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            setSelectedIndex(prev => 
              prev > 0 ? prev - 1 : filteredCommands.length - 1
            );
          } else {
            setSelectedIndex(prev => 
              prev < filteredCommands.length - 1 ? prev + 1 : 0
            );
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white shadow-xl border border-gray-200 rounded-lg w-80 max-h-96 overflow-hidden"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {/* Search input */}
      <div className="p-2 border-b border-gray-200">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedIndex(0);
          }}
          placeholder="Search commands..."
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
      </div>

      {/* Commands list */}
      <div className="overflow-y-auto max-h-80">
        {filteredCommands.length > 0 ? (
          filteredCommands.map((cmd, index) => (
            <button
              key={cmd.id}
              ref={(el) => (itemRefs.current[index] = el)}
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={cn(
                "w-full flex items-start gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left",
                selectedIndex === index && "bg-gray-50"
              )}
            >
              <div className="flex-shrink-0 mt-0.5 text-gray-500">
                {cmd.icon}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  {cmd.label}
                </div>
                <div className="text-xs text-gray-500">
                  {cmd.description}
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="px-3 py-8 text-center text-sm text-gray-500">
            No commands found
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="px-3 py-2 border-t border-gray-200 text-xs text-gray-500">
        <span className="font-medium">↑↓</span> Navigate{' '}
        <span className="font-medium">↵</span> Select{' '}
        <span className="font-medium">ESC</span> Cancel
      </div>
    </div>
  );
});