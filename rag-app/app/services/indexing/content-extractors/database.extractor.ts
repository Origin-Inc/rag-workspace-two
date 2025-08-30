import { ContentExtractor, ExtractedContent, BlockContext } from './base.extractor';
import { createSupabaseAdmin } from '~/utils/supabase.server';

export class DatabaseExtractor extends ContentExtractor {
  private supabase = createSupabaseAdmin();

  constructor() {
    super('database');
  }

  canExtract(block: any): boolean {
    return ['database', 'database_block', 'database-block'].includes(
      block.type?.toLowerCase()
    );
  }

  async extract(block: any, context: BlockContext): Promise<ExtractedContent> {
    try {
      // Get database block metadata
      const { data: dbBlock } = await this.supabase
        .from('db_blocks')
        .select('*')
        .eq('block_id', block.id)
        .single();

      if (!dbBlock) {
        this.logger.warn('Database block not found in db_blocks table', { blockId: block.id });
        return this.extractBasicDatabaseContent(block, context);
      }

      // Get database rows (limited for performance)
      const { data: rows } = await this.supabase
        .from('db_block_rows')
        .select('*')
        .eq('db_block_id', dbBlock.id)
        .limit(100);

      // Build comprehensive content
      let content = `# Database: ${dbBlock.name}\n\n`;
      
      if (dbBlock.description) {
        content += `${dbBlock.description}\n\n`;
      }

      // Add schema information
      if (dbBlock.schema) {
        content += '## Schema\n';
        const columns = Array.isArray(dbBlock.schema) ? dbBlock.schema : [];
        columns.forEach((col: any) => {
          content += `- ${col.name || col.id} (${col.type || 'text'})\n`;
        });
        content += '\n';
      }

      // Add row data summary
      if (rows && rows.length > 0) {
        content += `## Data (${rows.length} entries)\n\n`;
        
        // Group rows for better chunking
        rows.slice(0, 10).forEach((row, index) => {
          const rowData = this.formatDatabaseRow(row.data, dbBlock.schema);
          content += `${index + 1}. ${rowData}\n`;
        });

        if (rows.length > 10) {
          content += `\n... and ${rows.length - 10} more entries\n`;
        }
      }

      return {
        text: content,
        metadata: {
          blockId: block.id,
          blockType: 'database',
          databaseId: dbBlock.id,
          databaseName: dbBlock.name,
          rowCount: rows?.length || 0,
          pageId: context.pageId,
          position: block.position
        },
        priority: 70, // Databases are important content
        chunkSize: 1000 // Larger chunks for databases
      };

    } catch (error) {
      this.logger.error('Failed to extract database content', { blockId: block.id, error });
      return this.extractBasicDatabaseContent(block, context);
    }
  }

  private extractBasicDatabaseContent(block: any, context: BlockContext): ExtractedContent {
    const text = `Database Block: ${block.id}`;
    
    return {
      text,
      metadata: {
        blockId: block.id,
        blockType: 'database',
        pageId: context.pageId,
        position: block.position
      },
      priority: 50,
      chunkSize: 500
    };
  }

  private formatDatabaseRow(data: Record<string, any>, schema: any): string {
    const entries = Object.entries(data || {});
    if (entries.length === 0) return 'Empty row';

    return entries
      .map(([key, value]) => {
        const column = Array.isArray(schema) 
          ? schema.find((col: any) => col.id === key || col.name === key)
          : null;
        
        const columnName = column?.name || key;
        const formattedValue = this.formatValue(value, column?.type);
        
        return `${columnName}: ${formattedValue}`;
      })
      .join(', ');
  }

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
        return value ? 'checked' : 'unchecked';
      
      case 'select':
      case 'multi_select':
        return Array.isArray(value) ? value.join(', ') : String(value);
      
      case 'user':
        return typeof value === 'object' ? (value.name || value.email || 'User') : String(value);
      
      case 'file':
        return typeof value === 'object' ? (value.name || 'File') : String(value);
      
      default:
        return String(value);
    }
  }
}