import { ContentExtractor, ExtractedContent, BlockContext } from './base.extractor';

export class CodeExtractor extends ContentExtractor {
  constructor() {
    super('code');
  }

  canExtract(block: any): boolean {
    return ['code', 'codeblock', 'code_block', 'pre'].includes(
      block.type?.toLowerCase()
    );
  }

  async extract(block: any, context: BlockContext): Promise<ExtractedContent> {
    const code = block.content?.code || block.content?.text || this.extractText(block.content);
    const language = block.content?.language || block.content?.lang || 'plaintext';
    
    // Format as markdown code block for better searchability
    const text = `\`\`\`${language}\n${code}\n\`\`\``;
    
    // Add comments or description if available
    const description = block.content?.caption || block.content?.description;
    const fullText = description ? `${description}\n\n${text}` : text;
    
    return {
      text: fullText,
      metadata: {
        blockId: block.id,
        blockType: 'code',
        language,
        pageId: context.pageId,
        position: block.position,
        hasDescription: !!description
      },
      priority: 60, // Code blocks are moderately important
      chunkSize: 800 // Larger chunks for code to preserve context
    };
  }
}