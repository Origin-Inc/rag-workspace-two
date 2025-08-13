import { memo, useState, useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "~/utils/cn";
import {
  MagnifyingGlassIcon,
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
  PaperClipIcon,
  TableCellsIcon,
  ViewColumnsIcon,
  CalendarIcon,
  ChevronRightIcon,
  LightBulbIcon,
  LinkIcon,
  CubeIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

interface BlockType {
  id: string;
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  category: string;
  keywords: string[];
  defaultContent?: any;
  defaultProperties?: any;
}

const BLOCK_TYPES: BlockType[] = [
  // Basic blocks
  {
    id: "text",
    type: "text",
    label: "Text",
    description: "Plain paragraph text",
    icon: DocumentTextIcon,
    category: "basic",
    keywords: ["text", "paragraph", "content"],
    defaultContent: { text: "" },
  },
  {
    id: "heading1",
    type: "heading",
    label: "Heading 1",
    description: "Large section heading",
    icon: HashtagIcon,
    category: "basic",
    keywords: ["heading", "h1", "title"],
    defaultContent: { text: "" },
    defaultProperties: { level: 1 },
  },
  {
    id: "heading2",
    type: "heading",
    label: "Heading 2",
    description: "Medium section heading",
    icon: HashtagIcon,
    category: "basic",
    keywords: ["heading", "h2", "subtitle"],
    defaultContent: { text: "" },
    defaultProperties: { level: 2 },
  },
  {
    id: "heading3",
    type: "heading",
    label: "Heading 3",
    description: "Small section heading",
    icon: HashtagIcon,
    category: "basic",
    keywords: ["heading", "h3", "subheading"],
    defaultContent: { text: "" },
    defaultProperties: { level: 3 },
  },
  {
    id: "bullet_list",
    type: "bullet_list",
    label: "Bullet List",
    description: "Unordered list with bullets",
    icon: ListBulletIcon,
    category: "basic",
    keywords: ["list", "bullet", "unordered"],
    defaultContent: { items: [{ id: "1", text: "" }] },
  },
  {
    id: "numbered_list",
    type: "numbered_list",
    label: "Numbered List",
    description: "Ordered list with numbers",
    icon: NumberedListIcon,
    category: "basic",
    keywords: ["list", "numbered", "ordered"],
    defaultContent: { items: [{ id: "1", text: "" }] },
  },
  {
    id: "checkbox",
    type: "checkbox",
    label: "Checkbox List",
    description: "To-do list with checkboxes",
    icon: CheckCircleIcon,
    category: "basic",
    keywords: ["checkbox", "todo", "task", "checklist"],
    defaultContent: { items: [{ id: "1", text: "", checked: false }] },
  },
  {
    id: "quote",
    type: "quote",
    label: "Quote",
    description: "Highlighted quote or citation",
    icon: ChatBubbleBottomCenterTextIcon,
    category: "basic",
    keywords: ["quote", "blockquote", "citation"],
    defaultContent: { text: "", author: "" },
  },
  {
    id: "divider",
    type: "divider",
    label: "Divider",
    description: "Horizontal line separator",
    icon: MinusIcon,
    category: "basic",
    keywords: ["divider", "line", "separator", "hr"],
  },
  
  // Media blocks
  {
    id: "image",
    type: "image",
    label: "Image",
    description: "Upload or embed an image",
    icon: PhotoIcon,
    category: "media",
    keywords: ["image", "photo", "picture", "img"],
    defaultContent: { url: "", caption: "" },
  },
  {
    id: "video",
    type: "video",
    label: "Video",
    description: "Embed a video file or URL",
    icon: VideoCameraIcon,
    category: "media",
    keywords: ["video", "movie", "film", "media"],
    defaultContent: { url: "", caption: "" },
  },
  {
    id: "file",
    type: "file",
    label: "File",
    description: "Attach any type of file",
    icon: PaperClipIcon,
    category: "media",
    keywords: ["file", "attachment", "document", "pdf"],
    defaultContent: { url: "", name: "", size: 0 },
  },
  {
    id: "embed",
    type: "embed",
    label: "Embed",
    description: "Embed external content",
    icon: LinkIcon,
    category: "media",
    keywords: ["embed", "iframe", "external", "integration"],
    defaultContent: { url: "", provider: "" },
  },
  
  // Data blocks
  {
    id: "table",
    type: "table",
    label: "Table",
    description: "Create a data table",
    icon: TableCellsIcon,
    category: "data",
    keywords: ["table", "grid", "spreadsheet", "data"],
    defaultContent: { rows: [], columns: [] },
    defaultProperties: { rows: 3, cols: 3 },
  },
  {
    id: "kanban",
    type: "kanban",
    label: "Kanban Board",
    description: "Kanban-style task board",
    icon: ViewColumnsIcon,
    category: "data",
    keywords: ["kanban", "board", "cards", "tasks"],
    defaultContent: { columns: [], cards: [] },
  },
  {
    id: "calendar",
    type: "calendar",
    label: "Calendar",
    description: "Calendar view for events",
    icon: CalendarIcon,
    category: "data",
    keywords: ["calendar", "date", "events", "schedule"],
    defaultContent: { events: [] },
  },
  
  // Advanced blocks
  {
    id: "code",
    type: "code",
    label: "Code Block",
    description: "Syntax highlighted code",
    icon: CodeBracketIcon,
    category: "advanced",
    keywords: ["code", "programming", "syntax", "snippet"],
    defaultContent: { code: "", language: "javascript" },
  },
  {
    id: "toggle",
    type: "toggle",
    label: "Toggle",
    description: "Collapsible content section",
    icon: ChevronRightIcon,
    category: "advanced",
    keywords: ["toggle", "collapse", "expand", "accordion"],
    defaultContent: { title: "", content: "" },
  },
  {
    id: "callout",
    type: "callout",
    label: "Callout",
    description: "Highlighted info box",
    icon: LightBulbIcon,
    category: "advanced",
    keywords: ["callout", "info", "warning", "tip", "note"],
    defaultContent: { text: "", type: "info" },
  },
  {
    id: "synced_block",
    type: "synced_block",
    label: "Synced Block",
    description: "Reusable synced content",
    icon: CubeIcon,
    category: "advanced",
    keywords: ["synced", "reusable", "component", "template"],
    defaultContent: { sourceId: null },
  },
  {
    id: "ai_block",
    type: "ai_block",
    label: "AI Block",
    description: "AI-generated content",
    icon: SparklesIcon,
    category: "advanced",
    keywords: ["ai", "generate", "smart", "assistant"],
    defaultContent: { prompt: "", response: "" },
  },
];

const CATEGORIES = [
  { id: "all", label: "All Blocks", icon: null },
  { id: "basic", label: "Basic", icon: DocumentTextIcon },
  { id: "media", label: "Media", icon: PhotoIcon },
  { id: "data", label: "Data", icon: TableCellsIcon },
  { id: "advanced", label: "Advanced", icon: CodeBracketIcon },
];

interface BlockPaletteProps {
  onBlockSelect?: (blockType: BlockType) => void;
  onBlockDragStart?: (blockType: BlockType) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const BlockPalette = memo(function BlockPalette({
  onBlockSelect,
  onBlockDragStart,
  isCollapsed = false,
  onToggleCollapse,
}: BlockPaletteProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);

  // Filter blocks based on search and category
  const filteredBlocks = useMemo(() => {
    return BLOCK_TYPES.filter(block => {
      const matchesCategory = selectedCategory === "all" || block.category === selectedCategory;
      const matchesSearch = !searchQuery || 
        block.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        block.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        block.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));
      
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  if (isCollapsed) {
    return (
      <div className="w-12 bg-white border-r border-gray-200 flex flex-col items-center py-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-gray-100 rounded-lg"
          title="Expand block palette"
        >
          <ViewColumnsIcon className="h-5 w-5 text-gray-600" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Blocks</h3>
          <button
            onClick={onToggleCollapse}
            className="p-1 hover:bg-gray-100 rounded"
            title="Collapse palette"
          >
            <ChevronRightIcon className="h-4 w-4 text-gray-600 rotate-180" />
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search blocks..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-1 p-2 border-b border-gray-200">
        {CATEGORIES.map(category => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              selectedCategory === category.id
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            )}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Blocks Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {filteredBlocks.map(block => (
            <DraggableBlock
              key={block.id}
              block={block}
              isHovered={hoveredBlock === block.id}
              onHover={() => setHoveredBlock(block.id)}
              onLeave={() => setHoveredBlock(null)}
              onClick={() => onBlockSelect?.(block)}
              onDragStart={() => onBlockDragStart?.(block)}
            />
          ))}
        </div>

        {filteredBlocks.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">No blocks found</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Drag blocks to canvas or click to insert
        </p>
      </div>
    </div>
  );
});

interface DraggableBlockProps {
  block: BlockType;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
  onDragStart: () => void;
}

const DraggableBlock = memo(function DraggableBlock({
  block,
  isHovered,
  onHover,
  onLeave,
  onClick,
  onDragStart,
}: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${block.id}`,
    data: {
      type: "new-block",
      blockType: block.type,
      defaultContent: block.defaultContent,
      defaultProperties: block.defaultProperties,
    },
  });

  const Icon = block.icon;

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "p-3 bg-white border rounded-lg cursor-move transition-all",
        "hover:shadow-md hover:border-blue-300",
        isDragging && "opacity-50",
        isHovered && "border-blue-400 bg-blue-50"
      )}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      onDragStart={onDragStart}
    >
      <div className="flex flex-col items-center text-center">
        <Icon className="h-6 w-6 text-gray-600 mb-1" />
        <span className="text-xs font-medium text-gray-900">{block.label}</span>
      </div>
    </div>
  );
});