import { createSupabaseAdmin } from '~/utils/supabase.server';
import { extractorRegistry } from './content-extractors';
import type { ExtractedContent, BlockContext } from './content-extractors';
import { embeddingGenerationService } from '../embedding-generation.server';
import { DebugLogger } from '~/utils/debug-logger';

interface IndexingResult {
  pageId: string;
  success: boolean;
  blocksIndexed: number;
  embeddingsCreated: number;
  errors: string[];
}

export class PageIndexingService {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('PageIndexingService');
  
  /**
   * Index a complete page with all its blocks
   */
  async indexPage(pageId: string): Promise<IndexingResult> {
    this.logger.info('Starting page indexing', { pageId });
    
    const result: IndexingResult = {
      pageId,
      success: false,
      blocksIndexed: 0,
      embeddingsCreated: 0,
      errors: []
    };
    
    try {
      // 1. Get page metadata
      const { data: page, error: pageError } = await this.supabase
        .from('pages')
        .select('*')
        .eq('id', pageId)
        .single();
      
      if (pageError || !page) {
        throw new Error(`Page not found: ${pageId}`);
      }
      
      const workspaceId = page.workspace_id;
      
      // 2. Clean up old embeddings for this page
      await this.cleanupPageEmbeddings(pageId);
      
      // 3. Get all blocks for the page
      const { data: blocks, error: blocksError } = await this.supabase
        .from('blocks')
        .select('*')
        .eq('page_id', pageId)
        .order('position');
      
      if (blocksError) {
        throw new Error(`Failed to fetch blocks: ${blocksError.message}`);
      }
      
      if (!blocks || blocks.length === 0) {
        this.logger.info('No blocks found for page', { pageId });
        result.success = true;
        return result;
      }
      
      // 4. Create context for extraction
      const context: BlockContext = {
        pageId,
        workspaceId,
        pageTitle: page.title
      };
      
      // 5. Extract content from all blocks
      const extractedContents = await extractorRegistry.extractBatch(blocks, context);
      
      // 6. Index page-level content (combine high-priority content)
      const pageContent = await this.createPageLevelContent(page, extractedContents);
      if (pageContent) {
        const pageEmbeddings = await this.indexContent(
          pageContent,
          'page',
          pageId,
          workspaceId,
          { pageTitle: page.title }
        );
        result.embeddingsCreated += pageEmbeddings;
      }
      
      // 7. Index individual blocks
      for (const [index, content] of extractedContents.entries()) {
        try {
          const block = blocks[index];
          const blockEmbeddings = await this.indexBlockContent(
            content,
            block,
            workspaceId
          );
          result.blocksIndexed++;
          result.embeddingsCreated += blockEmbeddings;
        } catch (error) {
          const errorMsg = `Failed to index block ${blocks[index].id}: ${error}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }
      
      // 8. Index database rows separately if needed
      const databaseBlocks = blocks.filter(b => 
        ['database', 'database_block', 'database-block'].includes(b.type?.toLowerCase())
      );
      
      for (const dbBlock of databaseBlocks) {
        try {
          const rowEmbeddings = await this.indexDatabaseRows(dbBlock, workspaceId);
          result.embeddingsCreated += rowEmbeddings;
        } catch (error) {
          const errorMsg = `Failed to index database rows for ${dbBlock.id}: ${error}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }
      
      result.success = result.errors.length === 0;
      
      this.logger.info('Page indexing completed', result);
      return result;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMsg);
      this.logger.error('Page indexing failed', { pageId, error: errorMsg });
      return result;
    }
  }
  
  /**
   * Clean up old embeddings for a page
   */
  private async cleanupPageEmbeddings(pageId: string): Promise<void> {
    try {
      // Use the cleanup function we created in the migration
      const { error } = await this.supabase.rpc('cleanup_page_embeddings', {
        p_page_id: pageId
      });
      
      if (error) {
        this.logger.warn('Failed to cleanup old embeddings', { pageId, error });
      }
    } catch (error) {
      this.logger.error('Error cleaning up embeddings', { pageId, error });
    }
  }
  
  /**
   * Create page-level content from high-priority blocks
   */
  private async createPageLevelContent(
    page: any,
    extractedContents: ExtractedContent[]
  ): Promise<string | null> {
    // Get high-priority content (headings, first paragraphs, etc.)
    const highPriorityContent = extractedContents
      .filter(c => c.priority >= 70)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5); // Top 5 high-priority blocks
    
    if (highPriorityContent.length === 0) {
      return null;
    }
    
    // Build page summary
    const parts = [`# ${page.title || 'Untitled Page'}`];
    
    if (page.description) {
      parts.push(page.description);
    }
    
    // Add high-priority content
    highPriorityContent.forEach(content => {
      if (content.text) {
        parts.push(content.text);
      }
    });
    
    return parts.join('\n\n');
  }
  
  /**
   * Index content and create embeddings
   */
  private async indexContent(
    text: string,
    sourceType: 'page' | 'block' | 'database_row',
    entityId: string,
    workspaceId: string,
    metadata: Record<string, any> = {}
  ): Promise<number> {
    try {
      // Generate embedding
      const embedding = await embeddingGenerationService.generateEmbedding(text);
      
      if (!embedding) {
        this.logger.warn('Failed to generate embedding', { entityId, sourceType });
        return 0;
      }
      
      // Determine table based on source type
      let table: string;
      let insertData: any;
      
      switch (sourceType) {
        case 'page':
          table = 'page_embeddings';
          insertData = {
            page_id: entityId,
            workspace_id: workspaceId,
            chunk_text: text,
            chunk_index: 0,
            embedding,
            metadata
          };
          break;
          
        case 'block':
          table = 'block_embeddings';
          insertData = {
            block_id: entityId,
            page_id: metadata.pageId,
            workspace_id: workspaceId,
            block_type: metadata.blockType || 'unknown',
            chunk_text: text,
            chunk_index: metadata.chunkIndex || 0,
            embedding,
            metadata
          };
          break;
          
        case 'database_row':
          table = 'database_row_embeddings';
          insertData = {
            database_id: metadata.databaseId,
            row_id: entityId,
            page_id: metadata.pageId,
            workspace_id: workspaceId,
            chunk_text: text,
            embedding,
            metadata
          };
          break;
          
        default:
          throw new Error(`Unknown source type: ${sourceType}`);
      }
      
      // Insert embedding
      const { error } = await this.supabase
        .from(table)
        .insert(insertData);
      
      if (error) {
        throw new Error(`Failed to insert embedding: ${error.message}`);
      }
      
      return 1;
      
    } catch (error) {
      this.logger.error('Failed to index content', { entityId, sourceType, error });
      return 0;
    }
  }
  
  /**
   * Index block content with chunking if needed
   */
  private async indexBlockContent(
    content: ExtractedContent,
    block: any,
    workspaceId: string
  ): Promise<number> {
    const chunkSize = content.chunkSize || 500;
    const text = content.text;
    
    if (!text || text.trim().length === 0) {
      return 0;
    }
    
    // If content is small enough, index as single chunk
    if (text.length <= chunkSize * 1.5) {
      return await this.indexContent(
        text,
        'block',
        block.id,
        workspaceId,
        {
          ...content.metadata,
          pageId: block.page_id,
          blockType: block.type,
          chunkIndex: 0
        }
      );
    }
    
    // Otherwise, chunk the content
    const chunks = this.chunkText(text, chunkSize);
    let embeddingsCreated = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const count = await this.indexContent(
        chunks[i],
        'block',
        block.id,
        workspaceId,
        {
          ...content.metadata,
          pageId: block.page_id,
          blockType: block.type,
          chunkIndex: i,
          totalChunks: chunks.length
        }
      );
      embeddingsCreated += count;
    }
    
    return embeddingsCreated;
  }
  
  /**
   * Index individual database rows
   */
  private async indexDatabaseRows(
    dbBlock: any,
    workspaceId: string
  ): Promise<number> {
    try {
      // Get database block metadata
      const { data: database } = await this.supabase
        .from('db_blocks')
        .select('*')
        .eq('block_id', dbBlock.id)
        .single();
      
      if (!database) {
        return 0;
      }
      
      // Get database rows
      const { data: rows } = await this.supabase
        .from('db_block_rows')
        .select('*')
        .eq('db_block_id', database.id)
        .limit(500); // Limit for performance
      
      if (!rows || rows.length === 0) {
        return 0;
      }
      
      let embeddingsCreated = 0;
      
      // Index rows in batches
      const batchSize = 10;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        
        for (const row of batch) {
          const rowText = this.formatDatabaseRow(row, database.schema);
          
          if (rowText) {
            const count = await this.indexContent(
              rowText,
              'database_row',
              row.id,
              workspaceId,
              {
                databaseId: database.id,
                databaseName: database.name,
                pageId: dbBlock.page_id,
                rowData: row.data
              }
            );
            embeddingsCreated += count;
          }
        }
      }
      
      return embeddingsCreated;
      
    } catch (error) {
      this.logger.error('Failed to index database rows', { blockId: dbBlock.id, error });
      return 0;
    }
  }
  
  /**
   * Format a database row for indexing
   */
  private formatDatabaseRow(row: any, schema: any): string {
    if (!row.data || Object.keys(row.data).length === 0) {
      return '';
    }
    
    const parts = [];
    
    // Add row ID for reference
    parts.push(`Row ID: ${row.id}`);
    
    // Format each field
    Object.entries(row.data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        const column = Array.isArray(schema) 
          ? schema.find((col: any) => col.id === key || col.name === key)
          : null;
        
        const columnName = column?.name || key;
        const formattedValue = this.formatValue(value, column?.type);
        
        parts.push(`${columnName}: ${formattedValue}`);
      }
    });
    
    return parts.join('\n');
  }
  
  /**
   * Format a value based on its type
   */
  private formatValue(value: any, type?: string): string {
    if (value === null || value === undefined) return 'empty';
    
    switch (type) {
      case 'date':
      case 'datetime':
        try {
          return new Date(value).toLocaleDateString();
        } catch {
          return String(value);
        }
      
      case 'checkbox':
        return value ? 'yes' : 'no';
      
      case 'select':
      case 'multi_select':
        return Array.isArray(value) ? value.join(', ') : String(value);
      
      default:
        if (typeof value === 'object') {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        }
        return String(value);
    }
  }
  
  /**
   * Chunk text into smaller pieces with overlap
   */
  private chunkText(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    const words = text.split(/\s+/);
    const wordsPerChunk = Math.floor(chunkSize / 5); // Rough estimate: 5 chars per word
    const overlap = Math.floor(wordsPerChunk * 0.1); // 10% overlap
    
    for (let i = 0; i < words.length; i += wordsPerChunk - overlap) {
      const chunk = words.slice(i, i + wordsPerChunk).join(' ');
      if (chunk.trim()) {
        chunks.push(chunk);
      }
    }
    
    return chunks;
  }
}

// Export singleton instance
export const pageIndexingService = new PageIndexingService();