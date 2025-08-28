import { ContentExtractor, ExtractedContent, BlockContext } from './base.extractor';

export class TableExtractor extends ContentExtractor {
  constructor() {
    super('table');
  }

  async extract(block: any, context: BlockContext): Promise<ExtractedContent> {
    let text = '';
    
    if (block.content?.rows) {
      // Extract headers if available
      const headers = block.content.headers || 
                     (block.content.rows[0]?.isHeader ? block.content.rows[0].cells : null);
      
      if (headers) {
        text += this.formatRow(headers, '|');
        text += '\n' + headers.map(() => '---').join(' | ') + '\n';
      }
      
      // Extract data rows
      const dataRows = headers && block.content.rows[0]?.isHeader 
        ? block.content.rows.slice(1) 
        : block.content.rows;
      
      dataRows.forEach((row: any) => {
        text += this.formatRow(row.cells || row, '|') + '\n';
      });
    } else if (block.content?.data && Array.isArray(block.content.data)) {
      // Alternative table format
      block.content.data.forEach((row: any, index: number) => {
        if (index === 0 && block.content.hasHeader) {
          text += this.formatRow(row, '|');
          text += '\n' + row.map(() => '---').join(' | ') + '\n';
        } else {
          text += this.formatRow(row, '|') + '\n';
        }
      });
    } else {
      text = this.extractText(block.content);
    }
    
    // Add caption if available
    const caption = block.content?.caption || block.content?.title;
    if (caption) {
      text = `Table: ${caption}\n\n${text}`;
    }
    
    return {
      text,
      metadata: {
        blockId: block.id,
        blockType: 'table',
        pageId: context.pageId,
        position: block.position,
        hasCaption: !!caption
      },
      priority: 55, // Tables are moderately important
      chunkSize: 600
    };
  }

  private formatRow(cells: any[], separator: string): string {
    if (!Array.isArray(cells)) return '';
    
    return cells
      .map(cell => this.extractText(cell).replace(/[\n\r]/g, ' '))
      .join(` ${separator} `);
  }
}