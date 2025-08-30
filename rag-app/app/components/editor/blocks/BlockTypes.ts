// Core block type definitions and utilities
export type BlockType = 
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
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

export interface BlockMetadata {
  createdAt: Date;
  updatedAt: Date;
  version: number;
  indent?: number;
  language?: string; // For code blocks
  checked?: boolean; // For todo items
  collapsed?: boolean; // For toggle blocks
  variant?: 'info' | 'warning' | 'error' | 'success'; // For callouts
}

export interface Block {
  id: string;
  type: BlockType;
  content: any;
  children?: string[];
  parent?: string;
  metadata?: BlockMetadata;
}

// Block transformation rules
export const BLOCK_TRANSFORMATIONS: Record<string, BlockType> = {
  '#': 'heading1',
  '##': 'heading2',
  '###': 'heading3',
  '####': 'heading4',
  '#####': 'heading5',
  '######': 'heading6',
  '*': 'bulletList',
  '-': 'bulletList',
  '+': 'bulletList',
  '1.': 'numberedList',
  '[]': 'todoList',
  '[ ]': 'todoList',
  '[x]': 'todoList',
  '>': 'quote',
  '```': 'code',
  '---': 'divider',
  ':::': 'callout',
};

// Slash command menu items
export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  type: BlockType;
  keywords: string[];
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: 'Text',
    description: 'Plain text paragraph',
    icon: 'Type',
    type: 'paragraph',
    keywords: ['text', 'paragraph', 'p'],
  },
  {
    title: 'Heading 1',
    description: 'Large heading',
    icon: 'Heading1',
    type: 'heading1',
    keywords: ['h1', 'heading', 'title'],
  },
  {
    title: 'Heading 2',
    description: 'Medium heading',
    icon: 'Heading2',
    type: 'heading2',
    keywords: ['h2', 'heading', 'subtitle'],
  },
  {
    title: 'Heading 3',
    description: 'Small heading',
    icon: 'Heading3',
    type: 'heading3',
    keywords: ['h3', 'heading'],
  },
  {
    title: 'Bullet List',
    description: 'Simple bullet list',
    icon: 'List',
    type: 'bulletList',
    keywords: ['bullet', 'list', 'ul', 'unordered'],
  },
  {
    title: 'Numbered List',
    description: 'Ordered list',
    icon: 'ListOrdered',
    type: 'numberedList',
    keywords: ['number', 'list', 'ol', 'ordered'],
  },
  {
    title: 'Todo List',
    description: 'Checkable todo list',
    icon: 'CheckSquare',
    type: 'todoList',
    keywords: ['todo', 'task', 'check', 'checkbox'],
  },
  {
    title: 'Quote',
    description: 'Quote or callout',
    icon: 'Quote',
    type: 'quote',
    keywords: ['quote', 'blockquote', 'citation'],
  },
  {
    title: 'Code',
    description: 'Code block with syntax highlighting',
    icon: 'Code',
    type: 'code',
    keywords: ['code', 'programming', 'syntax'],
  },
  {
    title: 'Divider',
    description: 'Horizontal line',
    icon: 'Minus',
    type: 'divider',
    keywords: ['divider', 'line', 'hr', 'separator'],
  },
  {
    title: 'Callout',
    description: 'Highlighted information box',
    icon: 'Info',
    type: 'callout',
    keywords: ['callout', 'info', 'warning', 'tip', 'note'],
  },
  {
    title: 'Toggle',
    description: 'Collapsible content',
    icon: 'ChevronRight',
    type: 'toggle',
    keywords: ['toggle', 'collapse', 'expand', 'accordion'],
  },
];

// Transform text based on patterns
export function detectBlockTransformation(text: string): BlockType | null {
  const trimmed = text.trim();
  
  for (const [pattern, type] of Object.entries(BLOCK_TRANSFORMATIONS)) {
    if (trimmed.startsWith(pattern + ' ') || trimmed === pattern) {
      return type;
    }
  }
  
  return null;
}

// Remove transformation pattern from text
export function removeTransformationPattern(text: string, type: BlockType): string {
  const trimmed = text.trim();
  
  for (const [pattern, blockType] of Object.entries(BLOCK_TRANSFORMATIONS)) {
    if (blockType === type && (trimmed.startsWith(pattern + ' ') || trimmed === pattern)) {
      return trimmed.slice(pattern.length).trim();
    }
  }
  
  return text;
}

// Get appropriate icon for block type
export function getBlockIcon(type: BlockType): string {
  switch (type) {
    case 'heading1': return 'Heading1';
    case 'heading2': return 'Heading2';
    case 'heading3': return 'Heading3';
    case 'heading4': return 'Heading4';
    case 'heading5': return 'Heading5';
    case 'heading6': return 'Heading6';
    case 'bulletList': return 'List';
    case 'numberedList': return 'ListOrdered';
    case 'todoList': return 'CheckSquare';
    case 'quote': return 'Quote';
    case 'code': return 'Code';
    case 'divider': return 'Minus';
    case 'callout': return 'Info';
    case 'toggle': return 'ChevronRight';
    case 'image': return 'Image';
    case 'video': return 'Video';
    case 'table': return 'Table';
    case 'embed': return 'Globe';
    default: return 'Type';
  }
}