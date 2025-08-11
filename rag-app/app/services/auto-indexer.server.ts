import { createSupabaseAdmin } from '~/utils/supabase.server';
import { pageContentIndexerService } from './page-content-indexer.server';
import { DebugLogger } from '~/utils/debug-logger';

/**
 * Production-ready auto-indexing service
 * Automatically indexes page content when created or modified
 */
export class AutoIndexerService {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('AutoIndexer');

  /**
   * Initialize auto-indexing for a workspace
   * This should be called when a workspace is created
   */
  async initializeWorkspace(workspaceId: string): Promise<void> {
    this.logger.info('Initializing workspace for auto-indexing', { workspaceId });

    try {
      // Create initial index entry
      const { error } = await this.supabase
        .from('documents')
        .insert({
          workspace_id: workspaceId,
          content: 'Welcome to your workspace. Start adding content to pages and databases to enable AI search.',
          passage_id: `workspace-${workspaceId}-init`,
          metadata: {
            type: 'workspace-init',
            indexed_at: new Date().toISOString()
          }
        });

      if (error) {
        this.logger.error('Failed to initialize workspace', error);
      }

      this.logger.info('Workspace initialized for indexing');
    } catch (error) {
      this.logger.error('Workspace initialization failed', error);
    }
  }

  /**
   * Index content when a block is created or updated
   * This is the main entry point for production auto-indexing
   */
  async onBlockChange(
    blockId: string,
    workspaceId: string,
    changeType: 'create' | 'update' | 'delete'
  ): Promise<void> {
    this.logger.info('Block change detected', {
      blockId,
      workspaceId,
      changeType
    });

    try {
      if (changeType === 'delete') {
        // Remove from index
        await this.removeFromIndex(blockId);
      } else {
        // Get block data
        const { data: block, error } = await this.supabase
          .from('blocks')
          .select('*')
          .eq('id', blockId)
          .single();

        if (error || !block) {
          this.logger.error('Failed to fetch block', error);
          return;
        }

        // Index the block
        await pageContentIndexerService.indexBlock(
          block,
          workspaceId,
          block.page_id
        );

        this.logger.info('Block indexed successfully', { blockId });
      }
    } catch (error) {
      this.logger.error('Block indexing failed', error);
    }
  }

  /**
   * Index content when a database is created or updated
   */
  async onDatabaseChange(
    databaseId: string,
    workspaceId: string,
    changeType: 'create' | 'update' | 'delete'
  ): Promise<void> {
    this.logger.info('Database change detected', {
      databaseId,
      workspaceId,
      changeType
    });

    try {
      if (changeType === 'delete') {
        // Remove all database content from index
        const { error } = await this.supabase
          .from('documents')
          .delete()
          .like('storage_path', `database:${databaseId}%`);

        if (error) {
          this.logger.error('Failed to remove database from index', error);
        }
      } else {
        // Index the database
        await pageContentIndexerService.indexDatabaseBlock(
          databaseId,
          workspaceId
        );

        this.logger.info('Database indexed successfully', { databaseId });
      }
    } catch (error) {
      this.logger.error('Database indexing failed', error);
    }
  }

  /**
   * Remove content from index
   */
  private async removeFromIndex(blockId: string): Promise<void> {
    const { error } = await this.supabase
      .from('documents')
      .delete()
      .eq('source_block_id', blockId);

    if (error) {
      this.logger.error('Failed to remove from index', error);
      throw error;
    }

    this.logger.info('Content removed from index', { blockId });
  }

  /**
   * Ensure documents table exists (for production deployment)
   */
  async ensureDocumentsTable(): Promise<void> {
    this.logger.info('Ensuring documents table exists');

    try {
      // Check if table exists
      const { data, error } = await this.supabase
        .from('documents')
        .select('id')
        .limit(1);

      if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
        this.logger.warn('Documents table does not exist, creating it...');
        
        // Create the table using raw SQL
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS documents (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            workspace_id UUID NOT NULL,
            content TEXT NOT NULL,
            embedding vector(1536),
            passage_id TEXT UNIQUE,
            source_block_id UUID,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
          
          CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents(workspace_id);
          CREATE INDEX IF NOT EXISTS documents_source_block_idx ON documents(source_block_id);
          CREATE INDEX IF NOT EXISTS documents_passage_id_idx ON documents(passage_id);
        `;

        // This would need to be run via a migration in production
        this.logger.error('Documents table needs to be created via migration!');
        this.logger.info('Run: npx supabase migration new create_documents_table');
        this.logger.info('Then add the SQL above to the migration file');
      } else {
        this.logger.info('Documents table exists and is accessible');
      }
    } catch (error) {
      this.logger.error('Failed to ensure documents table', error);
    }
  }

  /**
   * Get indexing statistics for monitoring
   */
  async getIndexingStats(workspaceId: string): Promise<{
    totalDocuments: number;
    indexedBlocks: number;
    indexedDatabases: number;
    lastIndexed: string | null;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('source_block_id, metadata, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) {
        this.logger.error('Failed to get indexing stats', error);
        return {
          totalDocuments: 0,
          indexedBlocks: 0,
          indexedDatabases: 0,
          lastIndexed: null
        };
      }

      const stats = {
        totalDocuments: data.length,
        indexedBlocks: data.filter(d => d.source_block_id).length,
        indexedDatabases: data.filter(d => 
          d.metadata?.storage_path?.startsWith('database:')
        ).length,
        lastIndexed: data[0]?.created_at || null
      };

      this.logger.info('Indexing stats retrieved', stats);
      return stats;
    } catch (error) {
      this.logger.error('Failed to get indexing stats', error);
      return {
        totalDocuments: 0,
        indexedBlocks: 0,
        indexedDatabases: 0,
        lastIndexed: null
      };
    }
  }
}

export const autoIndexerService = new AutoIndexerService();

// Ensure table exists on service initialization
autoIndexerService.ensureDocumentsTable();