import type { Page } from '@prisma/client';
import { DebugLogger } from '~/utils/debug-logger';

interface Block {
  id: string;
  type: string;
  content: any;
}

export class ContentExtractor {
  private readonly logger = new DebugLogger('ContentExtractor');
  
  /**
   * Extract all text content from a page
   */
  extractFromPage(page: Page): string {
    const contentParts: string[] = [];
    
    // Add page title as context
    if (page.title) {
      contentParts.push(`# ${page.title}`);
    }
    
    // Extract from content field
    const content = page.content as any;
    if (typeof content === 'string') {
      contentParts.push(content);
    }
    
    // Extract from blocks if they exist
    const blocks = page.blocks as any;
    if (blocks && Array.isArray(blocks)) {
      for (const block of blocks) {
        const text = this.extractFromBlock(block);
        if (text) {
          contentParts.push(text);
        }
      }
    }
    
    return contentParts.join('\n\n').trim();
  }
  
  /**
   * Extract text from a single block based on its type
   */
  private extractFromBlock(block: Block): string {
    if (!block || !block.content) return '';
    
    switch (block.type) {
      case 'paragraph':
      case 'text':
        return this.extractTextContent(block.content);
        
      case 'heading':
        const headingText = this.extractTextContent(block.content);
        return headingText ? `## ${headingText}` : '';
        
      case 'list':
      case 'bullet':
      case 'numbered':
        return this.extractListContent(block.content);
        
      case 'code':
        return this.extractCodeContent(block.content);
        
      case 'quote':
        const quoteText = this.extractTextContent(block.content);
        return quoteText ? `> ${quoteText}` : '';
        
      case 'table':
        return this.extractTableContent(block.content);
        
      case 'ai':
        return this.extractAIBlockContent(block.content);
        
      case 'database':
        return this.extractDatabaseContent(block.content);
        
      default:
        return this.extractTextContent(block.content);
    }
  }
  
  /**
   * Extract plain text from various content formats
   */
  private extractTextContent(content: any): string {
    if (!content) return '';
    
    // Handle string content
    if (typeof content === 'string') {
      // Skip empty JSON strings
      if (content === '{}' || content === '[]' || content === 'null') {
        return '';
      }
      return content;
    }
    
    // Handle object content
    if (typeof content === 'object') {
      // Try common text properties
      if (content.text) return String(content.text);
      if (content.content) return this.extractTextContent(content.content);
      if (content.value) return String(content.value);
      if (content.title) return String(content.title);
      if (content.description) return String(content.description);
      
      // Handle array content (rich text)
      if (Array.isArray(content)) {
        return content
          .map(item => this.extractTextContent(item))
          .filter(Boolean)
          .join(' ');
      }
    }
    
    return '';
  }
  
  /**
   * Extract content from list blocks
   */
  private extractListContent(content: any): string {
    if (!content) return '';
    
    if (Array.isArray(content)) {
      return content
        .map(item => `• ${this.extractTextContent(item)}`)
        .filter(Boolean)
        .join('\n');
    }
    
    if (content.items && Array.isArray(content.items)) {
      return content.items
        .map((item: any) => `• ${this.extractTextContent(item)}`)
        .filter(Boolean)
        .join('\n');
    }
    
    return this.extractTextContent(content);
  }
  
  /**
   * Extract content from code blocks
   */
  private extractCodeContent(content: any): string {
    if (!content) return '';
    
    if (typeof content === 'string') {
      return `\`\`\`\n${content}\n\`\`\``;
    }
    
    if (content.code) {
      const language = content.language || '';
      return `\`\`\`${language}\n${content.code}\n\`\`\``;
    }
    
    return '';
  }
  
  /**
   * Extract content from table blocks
   */
  private extractTableContent(content: any): string {
    if (!content) return '';
    
    const rows: string[] = [];
    
    if (content.headers && Array.isArray(content.headers)) {
      rows.push(content.headers.join(' | '));
      rows.push(content.headers.map(() => '---').join(' | '));
    }
    
    if (content.rows && Array.isArray(content.rows)) {
      for (const row of content.rows) {
        if (Array.isArray(row)) {
          rows.push(row.map((cell: any) => this.extractTextContent(cell)).join(' | '));
        }
      }
    }
    
    return rows.join('\n');
  }
  
  /**
   * Extract content from AI blocks
   */
  private extractAIBlockContent(content: any): string {
    if (!content) return '';
    
    const parts: string[] = [];
    
    if (typeof content === 'string') {
      try {
        const parsed = JSON.parse(content);
        content = parsed;
      } catch {
        return content;
      }
    }
    
    if (content.prompt) {
      parts.push(`Question: ${content.prompt}`);
    }
    
    if (content.response) {
      parts.push(`Answer: ${content.response}`);
    }
    
    return parts.join('\n');
  }
  
  /**
   * Extract content from database blocks
   * Index ALL data smartly without overwhelming the system
   */
  private extractDatabaseContent(content: any): string {
    if (!content) return '';
    
    const parts: string[] = [];
    
    // Add database metadata
    if (content.title) {
      parts.push(`# Database: ${content.title}`);
    }
    
    if (content.description) {
      parts.push(content.description);
      parts.push(''); // Empty line for separation
    }
    
    // Index the schema with column names and types
    if (content.schema && content.schema.columns) {
      const columnInfo = content.schema.columns
        .map((col: any) => {
          const name = col.name || col.id;
          const type = col.type || 'text';
          return `${name} (${type})`;
        })
        .join(', ');
      parts.push(`Schema: ${columnInfo}`);
      parts.push(''); // Empty line for separation
    }
    
    // Index ALL rows, but format them smartly
    if (content.rows && Array.isArray(content.rows)) {
      const totalRows = content.rows.length;
      
      if (totalRows > 0) {
        parts.push(`Data (${totalRows} rows):`);
        
        // Process rows in batches to create meaningful chunks
        // Each batch becomes a searchable chunk of ~500 tokens
        const ROWS_PER_BATCH = 20; // Adjust based on typical row size
        
        for (let i = 0; i < totalRows; i += ROWS_PER_BATCH) {
          const batch = content.rows.slice(i, Math.min(i + ROWS_PER_BATCH, totalRows));
          const batchText: string[] = [];
          
          for (const row of batch) {
            // Format row data with column names for context
            const rowParts: string[] = [];
            
            if (content.schema && content.schema.columns) {
              // Include column names with values for better search
              content.schema.columns.forEach((col: any) => {
                const colName = col.name || col.id;
                const value = row[col.id || colName];
                
                if (value !== null && value !== undefined && value !== '') {
                  // Format based on column type for better readability
                  if (typeof value === 'boolean') {
                    rowParts.push(`${colName}: ${value ? 'Yes' : 'No'}`);
                  } else if (typeof value === 'number') {
                    rowParts.push(`${colName}: ${value}`);
                  } else if (value instanceof Date || 
                           (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) {
                    rowParts.push(`${colName}: ${value}`);
                  } else {
                    // Text values - trim long text to prevent single row from being too large
                    const textValue = String(value);
                    const trimmedValue = textValue.length > 200 
                      ? textValue.substring(0, 197) + '...' 
                      : textValue;
                    rowParts.push(`${colName}: ${trimmedValue}`);
                  }
                }
              });
            } else {
              // Fallback: just extract values without column names
              Object.entries(row).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                  const textValue = String(value);
                  const trimmedValue = textValue.length > 200 
                    ? textValue.substring(0, 197) + '...' 
                    : textValue;
                  rowParts.push(trimmedValue);
                }
              });
            }
            
            if (rowParts.length > 0) {
              batchText.push(`Row ${i + batch.indexOf(row) + 1}: ${rowParts.join(', ')}`);
            }
          }
          
          if (batchText.length > 0) {
            parts.push(batchText.join('\n'));
            if (i + ROWS_PER_BATCH < totalRows) {
              parts.push('---'); // Separator between batches
            }
          }
        }
      }
    }
    
    return parts.join('\n');
  }
}