import { createSupabaseAdmin } from '~/utils/supabase.server';
import { embeddingGenerationService } from './embedding-generation.server';
import { documentChunkingService } from './document-chunking.server';
import { DebugLogger } from '~/utils/debug-logger';

interface PageBlock {
  id: string;
  page_id: string;
  type: string;
  content: any;
  properties: any;
  position: number;
}

interface DatabaseBlock {
  id: string;
  block_id: string;
  name: string;
  description?: string;
  schema: any;
}

interface DatabaseRow {
  id: string;
  db_block_id: string;
  data: Record<string, any>;
}

export class PageContentIndexerService {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('PageContentIndexer');

  /**
   * Index all content from a page
   */
  async indexPage(pageId: string, workspaceId: string): Promise<void> {
    this.logger.info('Indexing page', { pageId, workspaceId });

    try {
      // Get all blocks from the page
      const { data: blocks, error: blocksError } = await this.supabase
        .from('blocks')
        .select('*')
        .eq('page_id', pageId)
        .order('position');

      if (blocksError) {
        throw new Error(`Failed to fetch blocks: ${blocksError.message}`);
      }

      if (!blocks || blocks.length === 0) {
        this.logger.info('No blocks found on page');
        return;
      }

      // Process each block
      for (const block of blocks) {
        await this.indexBlock(block, workspaceId, pageId);
      }

      this.logger.info('Page indexing completed', { 
        pageId, 
        blocksIndexed: blocks.length 
      });
    } catch (error) {
      this.logger.error('Page indexing failed', error);
      throw error;
    }
  }

  /**
   * Index a single block
   */
  async indexBlock(
    block: PageBlock,
    workspaceId: string,
    pageId?: string
  ): Promise<void> {
    this.logger.info('Indexing block', { 
      blockId: block.id, 
      type: block.type 
    });

    try {
      // Extract text content based on block type
      const textContent = await this.extractBlockContent(block);

      if (!textContent || textContent.trim().length === 0) {
        this.logger.info('No text content to index for block', { 
          blockId: block.id 
        });
        return;
      }

      // Check if this block is already indexed
      const { data: existingDoc } = await this.supabase
        .from('documents')
        .select('id')
        .eq('source_block_id', block.id)
        .single();

      if (existingDoc) {
        // Update existing document
        await this.updateIndexedBlock(existingDoc.id, textContent, block);
      } else {
        // Create new indexed document
        await this.createIndexedBlock(textContent, block, workspaceId, pageId);
      }
    } catch (error) {
      this.logger.error('Block indexing failed', { 
        blockId: block.id, 
        error 
      });
      // Don't throw - continue with other blocks
    }
  }

  /**
   * Extract text content from a block
   */
  private async extractBlockContent(block: PageBlock): Promise<string> {
    switch (block.type) {
      case 'text':
      case 'paragraph':
        return this.extractTextContent(block.content);

      case 'heading':
      case 'header':
        return this.extractHeadingContent(block.content);

      case 'list':
      case 'bullet_list':
      case 'numbered_list':
        return this.extractListContent(block.content);

      case 'code':
        return this.extractCodeContent(block.content);

      case 'database':
      case 'database_block':
        return await this.extractDatabaseContent(block);

      case 'table':
        return this.extractTableContent(block.content);

      case 'quote':
      case 'blockquote':
        return this.extractQuoteContent(block.content);

      case 'callout':
        return this.extractCalloutContent(block.content);

      case 'toggle':
        return this.extractToggleContent(block.content);

      default:
        // Try to extract any text property
        return this.extractGenericContent(block.content);
    }
  }

  /**
   * Extract text from text/paragraph blocks
   */
  private extractTextContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }
    if (content?.text) {
      return content.text;
    }
    if (content?.rich_text) {
      return this.extractRichText(content.rich_text);
    }
    return '';
  }

  /**
   * Extract heading content
   */
  private extractHeadingContent(content: any): string {
    const text = this.extractTextContent(content);
    const level = content?.level || 1;
    return `${'#'.repeat(level)} ${text}`;
  }

  /**
   * Extract list content
   */
  private extractListContent(content: any): string {
    if (Array.isArray(content)) {
      return content.map(item => `- ${this.extractTextContent(item)}`).join('\n');
    }
    if (content?.items) {
      return content.items.map((item: any) => `- ${this.extractTextContent(item)}`).join('\n');
    }
    return this.extractTextContent(content);
  }

  /**
   * Extract code content
   */
  private extractCodeContent(content: any): string {
    const code = content?.code || content?.text || content;
    const language = content?.language || 'plaintext';
    return `\`\`\`${language}\n${code}\n\`\`\``;
  }

  /**
   * Extract database content
   */
  private async extractDatabaseContent(block: PageBlock): Promise<string> {
    try {
      // Get database block details
      const { data: dbBlock } = await this.supabase
        .from('db_blocks')
        .select('*')
        .eq('block_id', block.id)
        .single();

      if (!dbBlock) {
        return '';
      }

      // Get database rows
      const { data: rows } = await this.supabase
        .from('db_block_rows')
        .select('*')
        .eq('db_block_id', dbBlock.id)
        .limit(100); // Limit for performance

      let content = `Database: ${dbBlock.name}\n`;
      
      if (dbBlock.description) {
        content += `Description: ${dbBlock.description}\n`;
      }

      // Add schema information
      if (dbBlock.schema) {
        const columns = Array.isArray(dbBlock.schema) 
          ? dbBlock.schema.map((col: any) => col.name || col.id).join(', ')
          : 'No columns defined';
        content += `Columns: ${columns}\n`;
      }

      // Add row data
      if (rows && rows.length > 0) {
        content += `\nData (${rows.length} rows):\n`;
        rows.forEach((row, index) => {
          if (index < 10) { // Limit rows in content
            const rowData = Object.entries(row.data || {})
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ');
            content += `Row ${index + 1}: ${rowData}\n`;
          }
        });
      }

      return content;
    } catch (error) {
      this.logger.error('Failed to extract database content', error);
      return `Database block: ${block.id}`;
    }
  }

  /**
   * Extract table content
   */
  private extractTableContent(content: any): string {
    if (content?.rows) {
      return content.rows
        .map((row: any) => 
          row.cells?.map((cell: any) => this.extractTextContent(cell)).join(' | ') || ''
        )
        .join('\n');
    }
    return this.extractTextContent(content);
  }

  /**
   * Extract quote content
   */
  private extractQuoteContent(content: any): string {
    const text = this.extractTextContent(content);
    return `> ${text}`;
  }

  /**
   * Extract callout content
   */
  private extractCalloutContent(content: any): string {
    const icon = content?.icon || '📌';
    const text = this.extractTextContent(content);
    return `${icon} Callout: ${text}`;
  }

  /**
   * Extract toggle content
   */
  private extractToggleContent(content: any): string {
    const title = content?.title || 'Toggle';
    const text = this.extractTextContent(content?.content || content);
    return `▼ ${title}\n${text}`;
  }

  /**
   * Extract generic content
   */
  private extractGenericContent(content: any): string {
    if (!content) return '';
    
    // Try various common properties
    if (typeof content === 'string') return content;
    if (content.text) return this.extractTextContent(content.text);
    if (content.content) return this.extractTextContent(content.content);
    if (content.value) return String(content.value);
    if (content.title) return content.title;
    if (content.name) return content.name;
    
    // Try to stringify if object
    try {
      return JSON.stringify(content);
    } catch {
      return '';
    }
  }

  /**
   * Extract rich text
   */
  private extractRichText(richText: any[]): string {
    if (!Array.isArray(richText)) return '';
    
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
   * Create a new indexed block
   */
  private async createIndexedBlock(
    textContent: string,
    block: PageBlock,
    workspaceId: string,
    pageId?: string
  ): Promise<void> {
    // Process the content to generate embeddings
    const passageIds = await embeddingGenerationService.processDocument(
      workspaceId,
      textContent,
      {
        source_block_id: block.id,
        page_name: pageId || 'Unknown Page',
        block_type: block.type,
        storage_path: `page:${pageId || 'unknown'}/block:${block.id}`
      }
    );

    this.logger.info('Block indexed successfully', {
      blockId: block.id,
      passageCount: passageIds.length
    });
  }

  /**
   * Update an existing indexed block
   */
  private async updateIndexedBlock(
    documentId: string,
    textContent: string,
    block: PageBlock
  ): Promise<void> {
    // Delete old document
    await this.supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    // Re-index with new content
    const workspaceId = await this.getWorkspaceIdForBlock(block.id);
    if (workspaceId) {
      await this.createIndexedBlock(textContent, block, workspaceId, block.page_id);
    }
  }

  /**
   * Get workspace ID for a block
   */
  private async getWorkspaceIdForBlock(blockId: string): Promise<string | null> {
    // This would need to be implemented based on your schema
    // For now, returning null
    return null;
  }

  /**
   * Index all database content
   */
  async indexDatabaseBlock(
    databaseBlockId: string,
    workspaceId: string
  ): Promise<void> {
    this.logger.info('Indexing database block', { databaseBlockId });

    try {
      // Get database block
      const { data: dbBlock } = await this.supabase
        .from('db_blocks')
        .select('*')
        .eq('id', databaseBlockId)
        .single();

      if (!dbBlock) {
        throw new Error('Database block not found');
      }

      // Get all rows
      const { data: rows } = await this.supabase
        .from('db_block_rows')
        .select('*')
        .eq('db_block_id', databaseBlockId);

      // Build content from database
      let content = `# Database: ${dbBlock.name}\n\n`;
      
      if (dbBlock.description) {
        content += `${dbBlock.description}\n\n`;
      }

      // Add schema
      if (dbBlock.schema) {
        content += '## Schema\n';
        const columns = Array.isArray(dbBlock.schema) ? dbBlock.schema : [];
        columns.forEach((col: any) => {
          content += `- ${col.name || col.id} (${col.type || 'text'})\n`;
        });
        content += '\n';
      }

      // Add rows data
      if (rows && rows.length > 0) {
        content += `## Data (${rows.length} entries)\n\n`;
        
        // Group rows for better chunking
        const rowChunks = [];
        let currentChunk = '';
        
        rows.forEach((row, index) => {
          const rowContent = this.formatDatabaseRow(row.data, dbBlock.schema);
          
          if (currentChunk.length + rowContent.length > 500) {
            rowChunks.push(currentChunk);
            currentChunk = rowContent;
          } else {
            currentChunk += rowContent + '\n';
          }
        });
        
        if (currentChunk) {
          rowChunks.push(currentChunk);
        }

        // Index each chunk
        for (let i = 0; i < rowChunks.length; i++) {
          const chunkContent = `${content}### Entries ${i * 10 + 1}-${Math.min((i + 1) * 10, rows.length)}\n${rowChunks[i]}`;
          
          await embeddingGenerationService.processDocument(
            workspaceId,
            chunkContent,
            {
              source_block_id: dbBlock.block_id,
              page_name: `Database: ${dbBlock.name}`,
              block_type: 'database',
              storage_path: `database:${databaseBlockId}/chunk:${i}`
            }
          );
        }
      } else {
        // Index just the schema if no rows
        await embeddingGenerationService.processDocument(
          workspaceId,
          content,
          {
            source_block_id: dbBlock.block_id,
            page_name: `Database: ${dbBlock.name}`,
            block_type: 'database',
            storage_path: `database:${databaseBlockId}`
          }
        );
      }

      this.logger.info('Database block indexed successfully', {
        databaseBlockId,
        rowCount: rows?.length || 0
      });
    } catch (error) {
      this.logger.error('Database block indexing failed', error);
      throw error;
    }
  }

  /**
   * Format a database row for indexing
   */
  private formatDatabaseRow(data: Record<string, any>, schema: any): string {
    const entries = Object.entries(data);
    if (entries.length === 0) return '';

    return entries
      .map(([key, value]) => {
        // Find column info from schema
        const column = Array.isArray(schema) 
          ? schema.find((col: any) => col.id === key || col.name === key)
          : null;
        
        const columnName = column?.name || key;
        const formattedValue = this.formatValue(value, column?.type);
        
        return `${columnName}: ${formattedValue}`;
      })
      .join(', ');
  }

  /**
   * Format a value based on its type
   */
  private formatValue(value: any, type?: string): string {
    if (value === null || value === undefined) return 'empty';
    
    switch (type) {
      case 'date':
      case 'datetime':
        return new Date(value).toLocaleDateString();
      case 'checkbox':
        return value ? 'checked' : 'unchecked';
      case 'select':
      case 'multi_select':
        return Array.isArray(value) ? value.join(', ') : String(value);
      case 'user':
        return value.name || value.email || String(value);
      case 'file':
        return value.name || 'File attachment';
      default:
        return String(value);
    }
  }

  /**
   * Remove indexed content for a block
   */
  async removeBlockIndex(blockId: string): Promise<void> {
    this.logger.info('Removing block index', { blockId });

    const { error } = await this.supabase
      .from('documents')
      .delete()
      .eq('source_block_id', blockId);

    if (error) {
      this.logger.error('Failed to remove block index', error);
      throw error;
    }
  }

  /**
   * Reindex all content in a workspace
   */
  async reindexWorkspace(workspaceId: string): Promise<void> {
    this.logger.info('Reindexing entire workspace', { workspaceId });

    try {
      // Get all pages in workspace
      const { data: pages } = await this.supabase
        .from('pages')
        .select('id')
        .eq('workspace_id', workspaceId);

      if (!pages || pages.length === 0) {
        this.logger.info('No pages found in workspace');
        return;
      }

      // Index each page
      for (const page of pages) {
        await this.indexPage(page.id, workspaceId);
      }

      // Get all database blocks in workspace
      const { data: databases } = await this.supabase
        .from('db_blocks')
        .select('id')
        .eq('workspace_id', workspaceId);

      if (databases && databases.length > 0) {
        for (const db of databases) {
          await this.indexDatabaseBlock(db.id, workspaceId);
        }
      }

      this.logger.info('Workspace reindexing completed', {
        workspaceId,
        pagesIndexed: pages.length,
        databasesIndexed: databases?.length || 0
      });
    } catch (error) {
      this.logger.error('Workspace reindexing failed', error);
      throw error;
    }
  }
}

export const pageContentIndexerService = new PageContentIndexerService();