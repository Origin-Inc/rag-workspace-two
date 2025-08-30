import { ContentExtractor, ExtractedContent, BlockContext } from './base.extractor';

export class HeadingExtractor extends ContentExtractor {
  constructor() {
    super('heading');
  }

  canExtract(block: any): boolean {
    return ['heading', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(
      block.type?.toLowerCase()
    );
  }

  async extract(block: any, context: BlockContext): Promise<ExtractedContent> {
    const text = this.extractText(block.content);
    const level = block.content?.level || this.extractLevelFromType(block.type) || 1;
    
    // Format heading with markdown notation
    const formattedText = `${'#'.repeat(level)} ${text}`;
    
    return {
      text: formattedText,
      metadata: {
        blockId: block.id,
        blockType: 'heading',
        headingLevel: level,
        pageId: context.pageId,
        position: block.position
      },
      priority: 100 - (level * 10), // H1=90, H2=80, etc.
      chunkSize: 300 // Smaller chunks for headings
    };
  }

  private extractLevelFromType(type: string): number | null {
    const match = type?.match(/h([1-6])/i);
    return match ? parseInt(match[1], 10) : null;
  }
}