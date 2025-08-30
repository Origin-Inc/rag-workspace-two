import { DebugLogger } from '~/utils/debug-logger';

export interface ExtractedContent {
  text: string;
  metadata: Record<string, any>;
  priority: number; // 0-100, higher = more important
  chunkSize?: number; // Suggested chunk size for this content
}

export interface BlockContext {
  pageId: string;
  workspaceId: string;
  pageTitle?: string;
  parentBlocks?: any[];
}

export abstract class ContentExtractor {
  protected logger: DebugLogger;

  constructor(protected readonly blockType: string) {
    this.logger = new DebugLogger(`ContentExtractor:${blockType}`);
  }

  /**
   * Check if this extractor can handle the given block
   */
  canExtract(block: any): boolean {
    return block.type === this.blockType || 
           block.type === this.blockType.toLowerCase() ||
           block.type === this.blockType.replace(/_/g, '-');
  }

  /**
   * Extract text and metadata from the block
   */
  abstract extract(block: any, context: BlockContext): Promise<ExtractedContent>;

  /**
   * Helper to safely extract text from various content formats
   */
  protected extractText(content: any): string {
    if (typeof content === 'string') {
      return content;
    }
    
    if (content?.text) {
      return this.extractText(content.text);
    }
    
    if (content?.content) {
      return this.extractText(content.content);
    }
    
    if (content?.rich_text && Array.isArray(content.rich_text)) {
      return this.extractRichText(content.rich_text);
    }
    
    if (Array.isArray(content)) {
      return content.map(item => this.extractText(item)).join('\n');
    }
    
    if (content?.value !== undefined) {
      return String(content.value);
    }
    
    return '';
  }

  /**
   * Extract text from rich text array
   */
  protected extractRichText(richText: any[]): string {
    return richText
      .map(segment => {
        if (typeof segment === 'string') return segment;
        if (segment?.text) return segment.text;
        if (segment?.plain_text) return segment.plain_text;
        return '';
      })
      .join('');
  }

  /**
   * Format content with metadata for better searchability
   */
  protected formatWithMetadata(text: string, metadata: Record<string, any>): string {
    const parts = [text];
    
    if (metadata.title) {
      parts.unshift(`Title: ${metadata.title}`);
    }
    
    if (metadata.description) {
      parts.push(`Description: ${metadata.description}`);
    }
    
    if (metadata.tags && Array.isArray(metadata.tags)) {
      parts.push(`Tags: ${metadata.tags.join(', ')}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * Calculate content priority based on various factors
   */
  protected calculatePriority(block: any, context: BlockContext): number {
    let priority = 50; // Base priority
    
    // Headings get higher priority
    if (block.type === 'heading' || block.type === 'header') {
      const level = block.content?.level || 1;
      priority = 100 - (level * 10); // H1=90, H2=80, etc.
    }
    
    // First blocks get slightly higher priority
    if (block.position !== undefined && block.position < 3) {
      priority += 10;
    }
    
    // Blocks with more content get higher priority
    const contentLength = JSON.stringify(block.content || '').length;
    if (contentLength > 1000) {
      priority += 5;
    }
    
    return Math.min(100, Math.max(0, priority));
  }
}