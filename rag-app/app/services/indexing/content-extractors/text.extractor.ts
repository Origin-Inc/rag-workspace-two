import { ContentExtractor, ExtractedContent, BlockContext } from './base.extractor';

export class TextExtractor extends ContentExtractor {
  constructor() {
    super('text');
  }

  canExtract(block: any): boolean {
    return ['text', 'paragraph', 'p'].includes(block.type?.toLowerCase());
  }

  async extract(block: any, context: BlockContext): Promise<ExtractedContent> {
    const text = this.extractText(block.content);
    
    return {
      text,
      metadata: {
        blockId: block.id,
        blockType: 'text',
        pageId: context.pageId,
        position: block.position
      },
      priority: this.calculatePriority(block, context),
      chunkSize: 500
    };
  }
}