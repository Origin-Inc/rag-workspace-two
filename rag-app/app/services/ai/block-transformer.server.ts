/**
 * Block Transformation Service
 * Intelligently transforms blocks between different types while preserving content
 */

import type { Block, BlockType } from '~/components/editor/EnhancedBlockEditor';
import { openai, isOpenAIConfigured } from '../openai.server';

export class BlockTransformer {
  private static instance: BlockTransformer;

  static getInstance(): BlockTransformer {
    if (!this.instance) {
      this.instance = new BlockTransformer();
    }
    return this.instance;
  }

  /**
   * Transform a block from one type to another
   */
  async transform(block: Block, targetType: BlockType): Promise<Block> {
    const transformKey = `${block.type}-to-${targetType}`;
    
    // Use specific transformer if available
    const specificTransformer = this.getSpecificTransformer(transformKey);
    if (specificTransformer) {
      return specificTransformer(block);
    }

    // Otherwise use AI transformation
    return this.aiTransform(block, targetType);
  }

  /**
   * Get specific transformer function
   */
  private getSpecificTransformer(key: string): ((block: Block) => Block) | null {
    const transformers: Record<string, (block: Block) => Block> = {
      'bulletList-to-table': this.listToTable.bind(this),
      'numberedList-to-table': this.listToTable.bind(this),
      'todoList-to-table': this.listToTable.bind(this),
      'table-to-bulletList': this.tableToList.bind(this),
      'table-to-numberedList': this.tableToList.bind(this),
      'paragraph-to-bulletList': this.paragraphToList.bind(this),
      'paragraph-to-numberedList': this.paragraphToList.bind(this),
      'paragraph-to-heading1': this.paragraphToHeading.bind(this),
      'paragraph-to-heading2': this.paragraphToHeading.bind(this),
      'paragraph-to-heading3': this.paragraphToHeading.bind(this),
      'heading1-to-paragraph': this.headingToParagraph.bind(this),
      'heading2-to-paragraph': this.headingToParagraph.bind(this),
      'heading3-to-paragraph': this.headingToParagraph.bind(this),
      'bulletList-to-numberedList': this.listToList.bind(this),
      'numberedList-to-bulletList': this.listToList.bind(this),
      'todoList-to-bulletList': this.listToList.bind(this),
      'paragraph-to-quote': this.paragraphToQuote.bind(this),
      'quote-to-paragraph': this.quoteToParagraph.bind(this),
      'paragraph-to-code': this.paragraphToCode.bind(this),
      'code-to-paragraph': this.codeToParagraph.bind(this),
    };

    return transformers[key] || null;
  }

  /**
   * Transform list to table
   */
  private listToTable(block: Block): Block {
    const content = typeof block.content === 'string' ? block.content : '';
    const lines = content.split('\n').filter(Boolean);

    // Try to detect structure in the list
    const rows = lines.map(line => {
      // Remove list markers
      const cleanLine = line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '');
      
      // Try to split by common delimiters
      if (cleanLine.includes(':')) {
        return cleanLine.split(':').map(s => s.trim());
      } else if (cleanLine.includes('|')) {
        return cleanLine.split('|').map(s => s.trim());
      } else if (cleanLine.includes(',')) {
        return cleanLine.split(',').map(s => s.trim());
      } else {
        return [cleanLine];
      }
    });

    // Determine number of columns
    const maxCols = Math.max(...rows.map(r => r.length));
    
    // Pad rows to have same number of columns
    const normalizedRows = rows.map(row => {
      while (row.length < maxCols) {
        row.push('');
      }
      return row;
    });

    // Create database structure
    const columns = [];
    for (let i = 0; i < maxCols; i++) {
      columns.push({
        id: `col${i + 1}`,
        name: `Column ${i + 1}`,
        type: 'text',
        position: i,
        width: 200
      });
    }

    const databaseRows = normalizedRows.map((row, index) => ({
      id: `row${index + 1}`,
      cells: row.reduce((acc, cell, colIndex) => {
        acc[`col${colIndex + 1}`] = cell;
        return acc;
      }, {} as Record<string, any>)
    }));

    return {
      ...block,
      type: 'database',
      content: {
        columns,
        rows: databaseRows
      }
    };
  }

  /**
   * Transform table to list
   */
  private tableToList(block: Block): Block {
    const targetType = block.type as BlockType; // Will be set by transform method
    const content = block.content as any;
    
    if (!content?.rows || !Array.isArray(content.rows)) {
      return {
        ...block,
        type: targetType,
        content: ''
      };
    }

    const listItems = content.rows.map((row: any, index: number) => {
      const cells = Object.values(row.cells || {}).filter(Boolean);
      const text = cells.join(' - ');
      
      if (targetType === 'numberedList') {
        return `${index + 1}. ${text}`;
      } else {
        return `• ${text}`;
      }
    });

    return {
      ...block,
      type: targetType,
      content: listItems.join('\n')
    };
  }

  /**
   * Transform paragraph to list
   */
  private paragraphToList(block: Block): Block {
    const content = typeof block.content === 'string' ? block.content : '';
    const targetType = block.type as BlockType; // Will be set by transform method
    
    // Split by sentences or commas
    let items: string[] = [];
    
    if (content.includes(',')) {
      items = content.split(',').map(s => s.trim()).filter(Boolean);
    } else if (content.includes('.')) {
      items = content.split('.').map(s => s.trim()).filter(Boolean);
    } else {
      items = content.split('\n').map(s => s.trim()).filter(Boolean);
    }

    const listContent = items.map((item, index) => {
      if (targetType === 'numberedList') {
        return `${index + 1}. ${item}`;
      } else if (targetType === 'todoList') {
        return `☐ ${item}`;
      } else {
        return `• ${item}`;
      }
    }).join('\n');

    return {
      ...block,
      type: targetType,
      content: listContent
    };
  }

  /**
   * Transform paragraph to heading
   */
  private paragraphToHeading(block: Block): Block {
    const content = typeof block.content === 'string' ? block.content : '';
    const targetType = block.type as BlockType;
    
    // Truncate if too long for a heading
    const truncated = content.length > 100 ? content.substring(0, 100) + '...' : content;
    
    return {
      ...block,
      type: targetType,
      content: truncated
    };
  }

  /**
   * Transform heading to paragraph
   */
  private headingToParagraph(block: Block): Block {
    return {
      ...block,
      type: 'paragraph',
      content: block.content
    };
  }

  /**
   * Transform between list types
   */
  private listToList(block: Block): Block {
    const content = typeof block.content === 'string' ? block.content : '';
    const targetType = block.type as BlockType;
    
    // Remove old markers and add new ones
    const lines = content.split('\n').map(line => {
      // Remove existing markers
      let clean = line.replace(/^[-*•]\s*/, '')
                     .replace(/^\d+\.\s*/, '')
                     .replace(/^☐\s*/, '')
                     .replace(/^☑\s*/, '');
      
      // Add new marker based on target type
      if (targetType === 'numberedList') {
        return clean; // Will be numbered in rendering
      } else if (targetType === 'todoList') {
        return clean; // Will get checkbox in rendering
      } else {
        return clean; // Will get bullet in rendering
      }
    });

    return {
      ...block,
      type: targetType,
      content: lines.join('\n')
    };
  }

  /**
   * Transform paragraph to quote
   */
  private paragraphToQuote(block: Block): Block {
    return {
      ...block,
      type: 'quote',
      content: block.content
    };
  }

  /**
   * Transform quote to paragraph
   */
  private quoteToParagraph(block: Block): Block {
    return {
      ...block,
      type: 'paragraph',
      content: block.content
    };
  }

  /**
   * Transform paragraph to code
   */
  private paragraphToCode(block: Block): Block {
    const content = typeof block.content === 'string' ? block.content : '';
    
    // Try to detect language
    let language = 'text';
    if (content.includes('function') || content.includes('const') || content.includes('var')) {
      language = 'javascript';
    } else if (content.includes('def ') || content.includes('import ')) {
      language = 'python';
    } else if (content.includes('<?php')) {
      language = 'php';
    } else if (content.includes('<html') || content.includes('<div')) {
      language = 'html';
    } else if (content.includes('SELECT') || content.includes('FROM')) {
      language = 'sql';
    }

    return {
      ...block,
      type: 'code',
      content: {
        code: content,
        language
      }
    };
  }

  /**
   * Transform code to paragraph
   */
  private codeToParagraph(block: Block): Block {
    const code = block.content?.code || '';
    
    return {
      ...block,
      type: 'paragraph',
      content: code
    };
  }

  /**
   * AI-powered transformation for complex cases
   */
  private async aiTransform(block: Block, targetType: BlockType): Promise<Block> {
    if (!isOpenAIConfigured()) {
      // Fallback to simple transformation
      return {
        ...block,
        type: targetType,
        content: this.extractContent(block)
      };
    }

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Transform content from ${block.type} block to ${targetType} block. 
                     Preserve all information while adapting the format appropriately.
                     Return only the transformed content, no explanations.`
          },
          {
            role: 'user',
            content: JSON.stringify(block.content)
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const transformedContent = completion.choices[0]?.message?.content;
      
      // Parse the content based on target type
      let newContent: any = transformedContent;
      
      if (targetType === 'database') {
        try {
          newContent = JSON.parse(transformedContent || '{}');
        } catch {
          // Create default database structure
          newContent = {
            columns: [
              { id: 'col1', name: 'Data', type: 'text', position: 0, width: 300 }
            ],
            rows: [{
              id: 'row1',
              cells: { col1: transformedContent }
            }]
          };
        }
      } else if (targetType === 'code') {
        newContent = {
          code: transformedContent,
          language: 'text'
        };
      }

      return {
        ...block,
        type: targetType,
        content: newContent
      };
    } catch (error) {
      console.error('AI transformation failed:', error);
      // Fallback to simple transformation
      return {
        ...block,
        type: targetType,
        content: this.extractContent(block)
      };
    }
  }

  /**
   * Extract text content from any block type
   */
  private extractContent(block: Block): string {
    if (typeof block.content === 'string') {
      return block.content;
    }

    if (block.content?.text) {
      return block.content.text;
    }

    if (block.content?.code) {
      return block.content.code;
    }

    if (block.content?.rows && Array.isArray(block.content.rows)) {
      return block.content.rows
        .map((row: any) => Object.values(row.cells || {}).join(' '))
        .join('\n');
    }

    return JSON.stringify(block.content);
  }

  /**
   * Create a chart from data
   */
  async createChart(data: any, chartType?: string): Promise<Block> {
    // This would integrate with a chart library
    return {
      id: `chart-${Date.now()}`,
      type: 'ai' as BlockType, // Using AI block to display chart
      content: {
        status: 'complete',
        response: `Chart created: ${chartType || 'auto'}`,
        prompt: 'Generated chart from data',
        model: 'chart-generator'
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };
  }
}

// Export singleton instance
export const blockTransformer = BlockTransformer.getInstance();