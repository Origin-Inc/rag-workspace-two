import { memo, useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "~/utils/cn";
import {
  DocumentTextIcon,
  HashtagIcon,
  ListBulletIcon,
  NumberedListIcon,
  CheckCircleIcon,
  CodeBracketIcon,
  ChatBubbleBottomCenterTextIcon,
  MinusIcon,
  PhotoIcon,
  VideoCameraIcon,
  TableCellsIcon,
  ViewColumnsIcon,
  CalendarIcon,
  ChevronRightIcon,
  LightBulbIcon,
  SparklesIcon,
  CalendarDaysIcon,
  AtSymbolIcon,
} from "@heroicons/react/24/outline";

interface SlashCommand {
  id: string;
  command: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  category: string;
  action: {
    type: "insert_block" | "ai_action" | "formatting" | "navigation";
    data: any;
  };
  keywords?: string[];
}

const SLASH_COMMANDS: SlashCommand[] = [
  // Basic blocks
  {
    id: "text",
    command: "/text",
    label: "Text",
    description: "Plain paragraph",
    icon: DocumentTextIcon,
    category: "basic",
    action: { type: "insert_block", data: { type: "text" } },
    keywords: ["paragraph", "p"],
  },
  {
    id: "h1",
    command: "/h1",
    label: "Heading 1",
    description: "Large heading",
    icon: HashtagIcon,
    category: "basic",
    action: { type: "insert_block", data: { type: "heading", properties: { level: 1 } } },
    keywords: ["title", "header"],
  },
  {
    id: "h2",
    command: "/h2",
    label: "Heading 2",
    description: "Medium heading",
    icon: HashtagIcon,
    category: "basic",
    action: { type: "insert_block", data: { type: "heading", properties: { level: 2 } } },
    keywords: ["subtitle", "header"],
  },
  {
    id: "h3",
    command: "/h3",
    label: "Heading 3",
    description: "Small heading",
    icon: HashtagIcon,
    category: "basic",
    action: { type: "insert_block", data: { type: "heading", properties: { level: 3 } } },
    keywords: ["subheading", "header"],
  },
  {
    id: "bullet",
    command: "/bullet",
    label: "Bullet List",
    description: "Create a bullet list",
    icon: ListBulletIcon,
    category: "basic",
    action: { type: "insert_block", data: { type: "bullet_list" } },
    keywords: ["list", "ul"],
  },
  {
    id: "number",
    command: "/number",
    label: "Numbered List",
    description: "Create a numbered list",
    icon: NumberedListIcon,
    category: "basic",
    action: { type: "insert_block", data: { type: "numbered_list" } },
    keywords: ["list", "ol"],
  },
  {
    id: "check",
    command: "/check",
    label: "Checkbox",
    description: "Create a checkbox list",
    icon: CheckCircleIcon,
    category: "basic",
    action: { type: "insert_block", data: { type: "checkbox" } },
    keywords: ["todo", "task"],
  },
  {
    id: "code",
    command: "/code",
    label: "Code Block",
    description: "Add a code block",
    icon: CodeBracketIcon,
    category: "advanced",
    action: { type: "insert_block", data: { type: "code" } },
    keywords: ["programming", "snippet"],
  },
  {
    id: "quote",
    command: "/quote",
    label: "Quote",
    description: "Add a quote block",
    icon: ChatBubbleBottomCenterTextIcon,
    category: "basic",
    action: { type: "insert_block", data: { type: "quote" } },
    keywords: ["blockquote", "citation"],
  },
  {
    id: "divider",
    command: "/divider",
    label: "Divider",
    description: "Add a horizontal divider",
    icon: MinusIcon,
    category: "basic",
    action: { type: "insert_block", data: { type: "divider" } },
    keywords: ["line", "separator", "hr"],
  },
  
  // Media
  {
    id: "image",
    command: "/image",
    label: "Image",
    description: "Upload or embed an image",
    icon: PhotoIcon,
    category: "media",
    action: { type: "insert_block", data: { type: "image" } },
    keywords: ["picture", "photo", "img"],
  },
  {
    id: "video",
    command: "/video",
    label: "Video",
    description: "Embed a video",
    icon: VideoCameraIcon,
    category: "media",
    action: { type: "insert_block", data: { type: "video" } },
    keywords: ["movie", "film"],
  },
  
  // Data
  {
    id: "table",
    command: "/table",
    label: "Table",
    description: "Add a table",
    icon: TableCellsIcon,
    category: "data",
    action: { type: "insert_block", data: { type: "table", properties: { rows: 3, cols: 3 } } },
    keywords: ["grid", "spreadsheet"],
  },
  {
    id: "kanban",
    command: "/kanban",
    label: "Kanban Board",
    description: "Add a kanban board",
    icon: ViewColumnsIcon,
    category: "data",
    action: { type: "insert_block", data: { type: "kanban" } },
    keywords: ["board", "cards"],
  },
  {
    id: "calendar",
    command: "/calendar",
    label: "Calendar",
    description: "Add a calendar view",
    icon: CalendarIcon,
    category: "data",
    action: { type: "insert_block", data: { type: "calendar" } },
    keywords: ["date", "schedule"],
  },
  
  // Advanced
  {
    id: "toggle",
    command: "/toggle",
    label: "Toggle",
    description: "Add a toggle list",
    icon: ChevronRightIcon,
    category: "advanced",
    action: { type: "insert_block", data: { type: "toggle" } },
    keywords: ["collapse", "expand", "accordion"],
  },
  {
    id: "callout",
    command: "/callout",
    label: "Callout",
    description: "Add a callout box",
    icon: LightBulbIcon,
    category: "advanced",
    action: { type: "insert_block", data: { type: "callout" } },
    keywords: ["info", "warning", "tip"],
  },
  
  // AI Actions
  {
    id: "ai",
    command: "/ai",
    label: "AI Assistant",
    description: "Ask AI to write",
    icon: SparklesIcon,
    category: "ai",
    action: { type: "ai_action", data: { action: "generate" } },
    keywords: ["generate", "write", "create"],
  },
  {
    id: "summarize",
    command: "/summarize",
    label: "Summarize",
    description: "Summarize selected text",
    icon: SparklesIcon,
    category: "ai",
    action: { type: "ai_action", data: { action: "summarize" } },
    keywords: ["tldr", "brief"],
  },
  
  // Formatting
  {
    id: "date",
    command: "/date",
    label: "Date",
    description: "Insert current date",
    icon: CalendarDaysIcon,
    category: "utility",
    action: { type: "formatting", data: { type: "date" } },
    keywords: ["today", "now"],
  },
  {
    id: "mention",
    command: "/mention",
    label: "Mention",
    description: "Mention a user",
    icon: AtSymbolIcon,
    category: "utility",
    action: { type: "formatting", data: { type: "mention" } },
    keywords: ["user", "person", "@"],
  },
];

interface SlashCommandMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  searchQuery: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export const SlashCommandMenu = memo(function SlashCommandMenu({
  isOpen,
  position,
  searchQuery,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    const query = searchQuery.toLowerCase().replace("/", "");
    if (!query) return SLASH_COMMANDS.slice(0, 10); // Show top 10 when no search

    return SLASH_COMMANDS.filter(cmd => {
      const matchesCommand = cmd.command.toLowerCase().includes(query);
      const matchesLabel = cmd.label.toLowerCase().includes(query);
      const matchesDescription = cmd.description.toLowerCase().includes(query);
      const matchesKeywords = cmd.keywords?.some(k => k.toLowerCase().includes(query));
      
      return matchesCommand || matchesLabel || matchesDescription || matchesKeywords;
    }).slice(0, 10); // Limit to 10 results
  }, [searchQuery]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          break;
        
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          break;
        
        case "Enter":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex]);
          }
          break;
        
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        
        case "Tab":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex]);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) {
      acc[cmd.category] = [];
    }
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, SlashCommand[]>);

  const categoryOrder = ["basic", "media", "data", "advanced", "ai", "utility"];
  const sortedCategories = Object.keys(groupedCommands).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  let globalIndex = 0;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 w-80 max-h-96 overflow-y-auto"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {filteredCommands.length === 0 ? (
        <div className="px-4 py-3 text-sm text-gray-500">
          No commands found for "{searchQuery}"
        </div>
      ) : (
        sortedCategories.map(category => (
          <div key={category}>
            <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">
              {category}
            </div>
            {groupedCommands[category].map(cmd => {
              const currentIndex = globalIndex++;
              const Icon = cmd.icon;
              
              return (
                <button
                  key={cmd.id}
                  ref={el => itemRefs.current[currentIndex] = el}
                  className={cn(
                    "w-full px-3 py-2 flex items-start gap-3 hover:bg-gray-100 transition-colors",
                    selectedIndex === currentIndex && "bg-gray-100"
                  )}
                  onClick={() => onSelect(cmd)}
                  onMouseEnter={() => setSelectedIndex(currentIndex)}
                >
                  <Icon className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {cmd.label}
                      </span>
                      <code className="text-xs text-gray-500 bg-gray-100 px-1 rounded">
                        {cmd.command}
                      </code>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {cmd.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        ))
      )}
      
      <div className="px-3 py-2 border-t border-gray-200 mt-2">
        <p className="text-xs text-gray-500">
          ↑↓ to navigate • Enter to select • Esc to dismiss
        </p>
      </div>
    </div>,
    document.body
  );
});