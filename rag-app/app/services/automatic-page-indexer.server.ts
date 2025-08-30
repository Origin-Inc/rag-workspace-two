import { embeddingGenerationService } from './embedding-generation.server';
import { createSupabaseAdmin } from '~/utils/supabase.server';
import { DebugLogger } from '~/utils/debug-logger';
import type { Block } from '~/types/blocks';

interface PageContent {
  pageId: string;
  workspaceId: string;
  projectId: string;
  title: string;
  content: any;
  blocks: any[];
}

export class AutomaticPageIndexer {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('AutomaticPageIndexer');
  
  /**
   * Index page content automatically when page is saved
   */
  async indexPageContent(pageId: string): Promise<void> {
    this.logger.info('Auto-indexing page content', { pageId });

    try {
      // Get page data with workspace info
      const { data: page, error: pageError } = await this.supabase
        .from('pages')
        .select(`
          id,
          title,
          content,
          blocks,
          project:projects!inner(
            id,
            name,
            workspace_id,
            workspace:workspaces!inner(
              id,
              name
            )
          )
        `)
        .eq('id', pageId)
        .single();

      if (pageError || !page) {
        this.logger.error('Failed to fetch page for indexing', pageError);
        return;
      }

      const workspaceId = page.project.workspace_id;
      this.logger.info('Retrieved page data', { 
        pageId, 
        workspaceId,
        hasBlocks: !!page.blocks,
        hasContent: !!page.content
      });

      // Extract all text content from the page
      const extractedContent = await this.extractPageContent({
        pageId: page.id,
        workspaceId,
        projectId: page.project.id,
        title: page.title,
        content: page.content,
        blocks: page.blocks || []
      });

      if (!extractedContent || extractedContent.length === 0) {
        this.logger.info('No content to index from page', { pageId });
        return;
      }

      // Remove existing documents for this page
      await this.cleanupExistingPageDocuments(pageId);

      // Process the content for indexing
      const passageIds = await embeddingGenerationService.processDocument(
        workspaceId,
        extractedContent,
        {
          source_block_id: pageId,
          page_name: page.title,
          project_name: page.project.name,
          workspace_name: page.project.workspace.name,
          block_type: 'page',
          storage_path: `page:${pageId}`,
          page_id: pageId,
          project_id: page.project.id
        }
      );

      this.logger.info('Page content indexed successfully', {
        pageId,
        passageCount: passageIds.length,
        contentLength: extractedContent.length
      });

    } catch (error) {
      this.logger.error('Auto-indexing failed for page', { pageId, error });
      throw error;
    }
  }

  /**
   * Extract readable text content from page structure
   */
  private async extractPageContent(pageData: PageContent): Promise<string> {
    const contentParts: string[] = [];

    // Add page title
    if (pageData.title && pageData.title !== 'Untitled Page') {
      contentParts.push(`# ${pageData.title}`);
    }

    // Process blocks if they exist
    if (pageData.blocks && Array.isArray(pageData.blocks)) {
      for (const block of pageData.blocks) {
        const blockContent = this.extractBlockContent(block);
        if (blockContent) {
          contentParts.push(blockContent);
        }
      }
    }

    // Process legacy content field if blocks are empty
    if (contentParts.length <= 1 && pageData.content) {
      const legacyContent = this.extractLegacyContent(pageData.content);
      if (legacyContent) {
        contentParts.push(legacyContent);
      }
    }

    return contentParts.filter(Boolean).join('\n\n');
  }

  /**
   * Extract content from individual blocks
   */
  private extractBlockContent(block: Block): string {
    if (!block || !block.type) {
      return '';
    }

    switch (block.type) {
      case 'paragraph':
      case 'text':
        return this.extractTextContent(block.content);

      case 'heading':
      case 'header':
        const level = (block as any).level || 2;
        const text = this.extractTextContent(block.content);
        return `${'#'.repeat(level)} ${text}`;

      case 'list':
      case 'bullet_list':
      case 'numbered_list':
        return this.extractListContent(block.content);

      case 'code':
        const code = this.extractTextContent(block.content);
        return `\`\`\`\n${code}\n\`\`\``;

      case 'quote':
      case 'blockquote':
        const quote = this.extractTextContent(block.content);
        return `> ${quote}`;

      case 'callout':
        const callout = this.extractTextContent(block.content);
        return `📌 ${callout}`;

      case 'ai':
        return this.extractAIBlockContent(block.content);

      case 'database':
        return this.extractDatabaseBlockContent(block);

      case 'table':
        return this.extractTableContent(block.content);

      default:
        // Try to extract any text content
        return this.extractTextContent(block.content);
    }
  }

  /**
   * Extract text from various content formats
   */
  private extractTextContent(content: any): string {
    if (!content) return '';
    
    if (typeof content === 'string') {
      // Clean up stringified objects
      if (content === '{}' || content === '[]' || content === 'null') {
        return '';
      }
      return content;
    }
    
    if (typeof content === 'object') {
      // Handle different content structures
      if (content.text) return String(content.text);
      if (content.content) return this.extractTextContent(content.content);
      if (content.value) return String(content.value);
      if (content.prompt) return String(content.prompt); // AI block prompts
      if (content.code) return String(content.code); // Code blocks
      
      // Handle rich text arrays
      if (Array.isArray(content)) {
        return content
          .map(item => this.extractTextContent(item))
          .filter(Boolean)
          .join(' ');
      }
      
      // Try to extract from object properties
      const textProps = ['text', 'content', 'value', 'title', 'name', 'description'];
      for (const prop of textProps) {
        if (content[prop]) {
          const extracted = this.extractTextContent(content[prop]);
          if (extracted) return extracted;
        }
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
        .map((item, index) => `${index + 1}. ${this.extractTextContent(item)}`)
        .filter(text => text.length > 3)
        .join('\n');
    }
    
    if (content.items && Array.isArray(content.items)) {
      return content.items
        .map((item: any, index: number) => `- ${this.extractTextContent(item)}`)
        .filter((text: string) => text.length > 2)
        .join('\n');
    }

    return this.extractTextContent(content);
  }

  /**
   * Extract content from AI blocks
   */
  private extractAIBlockContent(content: any): string {
    if (!content) return '';
    
    const parts: string[] = [];
    
    if (content.prompt) {
      parts.push(`AI Prompt: ${content.prompt}`);
    }
    
    if (content.response || content.answer) {
      const response = content.response || content.answer;
      parts.push(`AI Response: ${this.extractTextContent(response)}`);
    }

    if (content.context) {
      parts.push(`Context: ${this.extractTextContent(content.context)}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Extract database block information
   */
  private extractDatabaseBlockContent(block: Block): string {
    const content = block.content;
    if (!content) return '';

    const parts: string[] = [];
    
    if (content.name) {
      parts.push(`Database: ${content.name}`);
    }
    
    if (content.description) {
      parts.push(`Description: ${content.description}`);
    }

    // Note: We don't extract all database data here as it could be large
    // Database blocks should be indexed separately via the database indexer
    parts.push('Database content (indexed separately)');

    return parts.join('\n');
  }

  /**
   * Extract table content
   */
  private extractTableContent(content: any): string {
    if (!content || !content.rows) return '';

    return content.rows
      .map((row: any) => {
        if (row.cells) {
          return row.cells
            .map((cell: any) => this.extractTextContent(cell))
            .join(' | ');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Extract legacy content (for backward compatibility)
   */
  private extractLegacyContent(content: any): string {
    if (!content) return '';
    
    if (typeof content === 'string') {
      return content;
    }
    
    // If content is an object, try to extract meaningful text
    return this.extractTextContent(content);
  }

  /**
   * Clean up existing documents for a page
   */
  private async cleanupExistingPageDocuments(pageId: string): Promise<void> {
    this.logger.info('Cleaning up existing documents for page', { pageId });

    const { error } = await this.supabase
      .from('documents')
      .delete()
      .eq('source_block_id', pageId);

    if (error) {
      this.logger.warn('Failed to cleanup existing documents', { pageId, error });
      // Don't throw - continue with indexing
    }
  }

  /**
   * Index all pages in a workspace (bulk operation)
   */
  async indexWorkspacePages(workspaceId: string): Promise<void> {
    this.logger.info('Indexing all pages in workspace', { workspaceId });

    try {
      // Get all pages in the workspace
      const { data: pages, error } = await this.supabase
        .from('pages')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('is_archived', false);

      if (error) {
        throw new Error(`Failed to fetch workspace pages: ${error.message}`);
      }

      if (!pages || pages.length === 0) {
        this.logger.info('No pages found in workspace', { workspaceId });
        return;
      }

      this.logger.info(`Found ${pages.length} pages to index`, { workspaceId });

      // Index each page with error handling
      let successCount = 0;
      let errorCount = 0;

      for (const page of pages) {
        try {
          await this.indexPageContent(page.id);
          successCount++;
          
          // Add small delay to prevent overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          errorCount++;
          this.logger.error('Failed to index page', { pageId: page.id, error });
          // Continue with other pages
        }
      }

      this.logger.info('Workspace indexing completed', {
        workspaceId,
        totalPages: pages.length,
        successCount,
        errorCount
      });

    } catch (error) {
      this.logger.error('Workspace indexing failed', { workspaceId, error });
      throw error;
    }
  }

  /**
   * Index all pages across all workspaces (system-wide operation)
   */
  async indexAllPages(): Promise<void> {
    this.logger.info('Starting system-wide page indexing');

    try {
      const { data: workspaces, error } = await this.supabase
        .from('workspaces')
        .select('id, name');

      if (error) {
        throw new Error(`Failed to fetch workspaces: ${error.message}`);
      }

      if (!workspaces || workspaces.length === 0) {
        this.logger.info('No workspaces found');
        return;
      }

      for (const workspace of workspaces) {
        try {
          await this.indexWorkspacePages(workspace.id);
          
          // Add delay between workspaces
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          this.logger.error('Failed to index workspace', { 
            workspaceId: workspace.id, 
            error 
          });
          // Continue with other workspaces
        }
      }

      this.logger.info('System-wide indexing completed');

    } catch (error) {
      this.logger.error('System-wide indexing failed', error);
      throw error;
    }
  }
}

export const automaticPageIndexer = new AutomaticPageIndexer();