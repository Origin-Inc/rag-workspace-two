import { ContentExtractor } from './base.extractor';
import type { ExtractedContent, BlockContext } from './base.extractor';
import { TextExtractor } from './text.extractor';
import { HeadingExtractor } from './heading.extractor';
import { DatabaseExtractor } from './database.extractor';
import { ListExtractor } from './list.extractor';
import { CodeExtractor } from './code.extractor';
import { TableExtractor } from './table.extractor';
import { DebugLogger } from '~/utils/debug-logger';

/**
 * Generic extractor for unrecognized block types
 */
class GenericExtractor extends ContentExtractor {
  constructor() {
    super('generic');
  }

  canExtract(): boolean {
    return true; // Can extract any block as fallback
  }

  async extract(block: any, context: BlockContext): Promise<ExtractedContent> {
    // Try to extract any text content
    let text = '';
    
    // Common content patterns
    if (block.content) {
      text = this.extractText(block.content);
    }
    
    // Fallback to stringifying if needed
    if (!text && block.properties) {
      text = this.extractText(block.properties);
    }
    
    if (!text) {
      text = `${block.type} block`;
      if (block.id) {
        text += ` (${block.id})`;
      }
    }
    
    return {
      text,
      metadata: {
        blockId: block.id,
        blockType: block.type || 'unknown',
        pageId: context.pageId,
        position: block.position
      },
      priority: 30, // Lower priority for generic content
      chunkSize: 500
    };
  }
}

/**
 * Registry for managing content extractors
 */
export class ExtractorRegistry {
  private extractors: ContentExtractor[] = [];
  private genericExtractor: ContentExtractor;
  private logger = new DebugLogger('ExtractorRegistry');

  constructor() {
    // Initialize all extractors
    this.extractors = [
      new TextExtractor(),
      new HeadingExtractor(),
      new DatabaseExtractor(),
      new ListExtractor(),
      new CodeExtractor(),
      new TableExtractor(),
    ];
    
    this.genericExtractor = new GenericExtractor();
    
    this.logger.info('Initialized with extractors', {
      count: this.extractors.length,
      types: this.extractors.map(e => e['blockType'])
    });
  }

  /**
   * Find the appropriate extractor for a block
   */
  getExtractor(block: any): ContentExtractor {
    // Find specific extractor
    const extractor = this.extractors.find(e => e.canExtract(block));
    
    if (extractor) {
      this.logger.debug('Found specific extractor', {
        blockType: block.type,
        extractorType: extractor['blockType']
      });
      return extractor;
    }
    
    // Fallback to generic extractor
    this.logger.debug('Using generic extractor', { blockType: block.type });
    return this.genericExtractor;
  }

  /**
   * Extract content from a block
   */
  async extractContent(block: any, context: BlockContext): Promise<ExtractedContent> {
    const extractor = this.getExtractor(block);
    
    try {
      const content = await extractor.extract(block, context);
      
      this.logger.debug('Content extracted', {
        blockId: block.id,
        blockType: block.type,
        textLength: content.text.length,
        priority: content.priority
      });
      
      return content;
    } catch (error) {
      this.logger.error('Extraction failed', {
        blockId: block.id,
        blockType: block.type,
        error
      });
      
      // Return minimal content on error
      return {
        text: `Failed to extract content from ${block.type} block`,
        metadata: {
          blockId: block.id,
          blockType: block.type,
          pageId: context.pageId,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        priority: 10,
        chunkSize: 500
      };
    }
  }

  /**
   * Extract content from multiple blocks
   */
  async extractBatch(
    blocks: any[],
    context: BlockContext
  ): Promise<ExtractedContent[]> {
    const results = await Promise.all(
      blocks.map(block => this.extractContent(block, context))
    );
    
    this.logger.info('Batch extraction completed', {
      totalBlocks: blocks.length,
      successfulExtractions: results.filter(r => !r.metadata.error).length
    });
    
    return results;
  }

  /**
   * Register a custom extractor
   */
  registerExtractor(extractor: ContentExtractor): void {
    this.extractors.unshift(extractor); // Add at beginning for priority
    this.logger.info('Registered custom extractor', {
      blockType: extractor['blockType']
    });
  }
}

// Export singleton instance
export const extractorRegistry = new ExtractorRegistry();

// Re-export types
export { ContentExtractor };
export type { ExtractedContent, BlockContext };
export { TextExtractor } from './text.extractor';
export { HeadingExtractor } from './heading.extractor';
export { DatabaseExtractor } from './database.extractor';
export { ListExtractor } from './list.extractor';
export { CodeExtractor } from './code.extractor';
export { TableExtractor } from './table.extractor';