import type { BlockType } from './supabase';

// Base block interface
export interface BaseBlock {
  id: string;
  pageId: string;
  parentId?: string | null;
  type: BlockType;
  position: BlockPosition;
  metadata: BlockMetadata;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string | null;
}

// Position for drag-and-drop grid layout
export interface BlockPosition {
  x: number;      // Grid column position (0-11)
  y: number;      // Grid row position
  width: number;  // Width in grid columns (1-12)
  height: number; // Height in grid rows
}

// Common metadata for all blocks
export interface BlockMetadata {
  locked?: boolean;
  hidden?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  className?: string;
  fileSize?: number; // For file blocks
  mimeType?: string; // For media blocks
  duration?: number; // For video/audio blocks
}

// Content types for each block type
export interface TextBlockContent {
  text: string;
  format?: 'plain' | 'markdown' | 'rich';
}

export interface HeadingBlockContent {
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface ListBlockContent {
  items: Array<{
    id: string;
    text: string;
    checked?: boolean; // For checkbox lists
    children?: any[]; // For nested lists
  }>;
  ordered?: boolean; // For numbered lists
}

export interface CodeBlockContent {
  code: string;
  language: string;
  filename?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
}

export interface QuoteBlockContent {
  text: string;
  author?: string;
  source?: string;
}

export interface ImageBlockContent {
  url: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  alignment?: 'left' | 'center' | 'right' | 'full';
}

export interface VideoBlockContent {
  url: string;
  caption?: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  poster?: string; // Thumbnail URL
}

export interface FileBlockContent {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  downloadUrl?: string;
  icon?: string;
}

export interface TableBlockContent {
  headers: string[];
  rows: string[][];
  hasHeader?: boolean;
  alignment?: ('left' | 'center' | 'right')[];
}

export interface KanbanBlockContent {
  columns: Array<{
    id: string;
    title: string;
    color?: string;
    limit?: number;
  }>;
  cards: Array<{
    id: string;
    columnId: string;
    title: string;
    description?: string;
    assignee?: string;
    dueDate?: string;
    tags?: string[];
    position: number;
  }>;
}

export interface CalendarBlockContent {
  view: 'month' | 'week' | 'day' | 'year';
  events: Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    allDay?: boolean;
    color?: string;
    description?: string;
    location?: string;
    attendees?: string[];
  }>;
  timezone?: string;
}

export interface EmbedBlockContent {
  url: string;
  type: 'iframe' | 'twitter' | 'youtube' | 'spotify' | 'figma' | 'google-docs' | 'other';
  height?: number;
  allowFullscreen?: boolean;
}

export interface LinkBlockContent {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}

export interface ToggleBlockContent {
  title: string;
  content: any[]; // Can contain other blocks
  isOpen?: boolean;
}

export interface CalloutBlockContent {
  text: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'tip';
  icon?: string;
  title?: string;
}

export interface SyncedBlockContent {
  sourceId: string; // ID of the original block
  sourcePageId?: string; // If synced from another page
}

export interface AIBlockContent {
  prompt?: string;
  response?: string;
  model?: string;
  status: 'idle' | 'generating' | 'complete' | 'error';
  error?: string;
  tokens?: number;
  citations?: Array<{
    passage_id: string;
    source_block_id?: string;
    excerpt: string;
  }>;
}

export interface SpreadsheetBlockContent {
  tableName?: string;
  title?: string;
  columns?: Array<{
    id: string;
    name: string;
    type: 'text' | 'number' | 'boolean' | 'date';
    width?: number;
  }>;
  rows?: any[];
}

// Union type for all block contents
export type BlockContent =
  | TextBlockContent
  | HeadingBlockContent
  | ListBlockContent
  | CodeBlockContent
  | QuoteBlockContent
  | ImageBlockContent
  | VideoBlockContent
  | FileBlockContent
  | TableBlockContent
  | KanbanBlockContent
  | CalendarBlockContent
  | SpreadsheetBlockContent
  | EmbedBlockContent
  | LinkBlockContent
  | ToggleBlockContent
  | CalloutBlockContent
  | SyncedBlockContent
  | AIBlockContent;

// Type guards for each block type
export function isTextBlock(content: any): content is TextBlockContent {
  return 'text' in content;
}

export function isHeadingBlock(content: any): content is HeadingBlockContent {
  return 'text' in content && 'level' in content;
}

export function isListBlock(content: any): content is ListBlockContent {
  return 'items' in content && Array.isArray(content.items);
}

export function isCodeBlock(content: any): content is CodeBlockContent {
  return 'code' in content && 'language' in content;
}

export function isImageBlock(content: any): content is ImageBlockContent {
  return 'url' in content && !('code' in content);
}

export function isKanbanBlock(content: any): content is KanbanBlockContent {
  return 'columns' in content && 'cards' in content;
}

// Block properties for database views
export interface BlockProperties {
  // For database blocks
  title?: PropertyConfig;
  status?: PropertyConfig;
  priority?: PropertyConfig;
  assignee?: PropertyConfig;
  dueDate?: PropertyConfig;
  tags?: PropertyConfig;
  number?: PropertyConfig;
  checkbox?: PropertyConfig;
  url?: PropertyConfig;
  email?: PropertyConfig;
  phone?: PropertyConfig;
  formula?: PropertyConfig;
  relation?: PropertyConfig;
  rollup?: PropertyConfig;
  createdTime?: PropertyConfig;
  createdBy?: PropertyConfig;
  lastEditedTime?: PropertyConfig;
  lastEditedBy?: PropertyConfig;
}

export interface PropertyConfig {
  type: 'title' | 'text' | 'number' | 'select' | 'multi-select' | 'date' | 
        'person' | 'checkbox' | 'url' | 'email' | 'phone' | 'formula' | 
        'relation' | 'rollup' | 'created-time' | 'created-by' | 
        'last-edited-time' | 'last-edited-by';
  name: string;
  options?: Array<{
    id: string;
    name: string;
    color?: string;
  }>;
  formula?: string;
  relationTo?: string; // Page ID for relations
  rollupProperty?: string;
  rollupRelation?: string;
  rollupCalculation?: 'count' | 'sum' | 'average' | 'min' | 'max';
}

// Block rendering configuration
export interface BlockRenderConfig {
  component: React.ComponentType<any>;
  editable: boolean;
  resizable: boolean;
  draggable: boolean;
  deletable: boolean;
  duplicatable: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  defaultPosition?: Partial<BlockPosition>;
}

// Block type configuration map
export const BLOCK_CONFIGS: Record<BlockType, Partial<BlockRenderConfig>> = {
  text: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 2,
    maxWidth: 12,
    minHeight: 1,
  },
  heading: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 3,
    maxWidth: 12,
    minHeight: 1,
    maxHeight: 2,
  },
  bullet_list: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 3,
    maxWidth: 12,
    minHeight: 2,
  },
  numbered_list: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 3,
    maxWidth: 12,
    minHeight: 2,
  },
  checkbox: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 3,
    maxWidth: 12,
    minHeight: 2,
  },
  code: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 4,
    maxWidth: 12,
    minHeight: 3,
  },
  quote: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 4,
    maxWidth: 12,
    minHeight: 2,
  },
  divider: {
    editable: false,
    resizable: false,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 12,
    maxWidth: 12,
    minHeight: 1,
    maxHeight: 1,
  },
  image: {
    editable: false,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: false,
    minWidth: 2,
    maxWidth: 12,
    minHeight: 2,
  },
  video: {
    editable: false,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: false,
    minWidth: 4,
    maxWidth: 12,
    minHeight: 3,
  },
  file: {
    editable: false,
    resizable: false,
    draggable: true,
    deletable: true,
    duplicatable: false,
    minWidth: 3,
    maxWidth: 6,
    minHeight: 1,
    maxHeight: 2,
  },
  table: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 6,
    maxWidth: 12,
    minHeight: 4,
  },
  kanban: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: false,
    minWidth: 8,
    maxWidth: 12,
    minHeight: 6,
  },
  calendar: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: false,
    minWidth: 8,
    maxWidth: 12,
    minHeight: 6,
  },
  spreadsheet: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 8,
    maxWidth: 12,
    minHeight: 6,
  },
  embed: {
    editable: false,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 4,
    maxWidth: 12,
    minHeight: 3,
  },
  link: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 3,
    maxWidth: 8,
    minHeight: 2,
    maxHeight: 3,
  },
  toggle: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 4,
    maxWidth: 12,
    minHeight: 2,
  },
  callout: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: true,
    minWidth: 4,
    maxWidth: 12,
    minHeight: 2,
  },
  synced_block: {
    editable: false,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: false,
    minWidth: 3,
    maxWidth: 12,
    minHeight: 1,
  },
  ai_block: {
    editable: true,
    resizable: true,
    draggable: true,
    deletable: true,
    duplicatable: false,
    minWidth: 6,
    maxWidth: 12,
    minHeight: 3,
  },
};

// Helper to get default content for a block type
export function getDefaultContent(type: BlockType): BlockContent {
  switch (type) {
    case 'text':
      return { text: '', format: 'rich' };
    case 'heading':
      return { text: 'Heading', level: 2 };
    case 'bullet_list':
    case 'numbered_list':
    case 'checkbox':
      return { items: [], ordered: type === 'numbered_list' };
    case 'code':
      return { code: '', language: 'javascript' };
    case 'quote':
      return { text: '' };
    case 'divider':
      return {} as any;
    case 'image':
      return { url: '', alt: '' };
    case 'video':
      return { url: '' };
    case 'file':
      return { url: '', filename: '', size: 0, mimeType: '' };
    case 'table':
      return { headers: ['Column 1', 'Column 2'], rows: [['']], hasHeader: true };
    case 'kanban':
      return { columns: [], cards: [] };
    case 'calendar':
      return { view: 'month', events: [] };
    case 'spreadsheet':
      return { title: 'Spreadsheet', columns: [], rows: [] };
    case 'embed':
      return { url: '', type: 'iframe' };
    case 'link':
      return { url: '' };
    case 'toggle':
      return { title: 'Toggle', content: [], isOpen: false };
    case 'callout':
      return { text: '', type: 'info' };
    case 'synced_block':
      return { sourceId: '' };
    case 'ai_block':
      return { status: 'idle' };
    default:
      return { text: '' } as TextBlockContent;
  }
}