// Task 19.7: Incremental indexing system with content checksums
import { createSupabaseAdmin } from '~/utils/supabase.server';
import { DebugLogger } from '~/utils/debug-logger';
import { createHash } from 'crypto';
import { embeddingGenerationService } from '../embedding-generation.server';
import * as diff from 'diff';

interface Page {
  id: string;
  title: string;
  content: string;
  content_checksum?: string;
  updated_at: string;
  workspace_id: string;
}

interface Block {
  id: string;
  type: string;
  content: any;
  content_checksum?: string;
  page_id: string;
  position: any;
}

interface IndexEntry {
  id: string;
  entity_id: string;
  entity_type: string;
  content: string;
  content_checksum: string;
  chunks?: ContentChunk[];
  embedding?: number[];
  metadata: any;
}

interface ContentChunk {
  id: string;
  content: string;
  checksum: string;
  position: number;
  embedding?: number[];
}

interface ContentDiff {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: string[];
}

export class IncrementalIndexer {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('IncrementalIndexer');
  
  // Configuration
  private readonly CHUNK_SIZE = 1000; // Characters per chunk
  private readonly CHUNK_OVERLAP = 100; // Overlap between chunks

  /**
   * Index pages with incremental updates
   */
  async indexPages(pageIds: string[]): Promise<void> {
    this.logger.info('Incrementally indexing pages', { count: pageIds.length });
    
    // Fetch pages with checksums
    const { data: pages, error } = await this.supabase
      .from('pages')
      .select('id, title, content, content_checksum, updated_at, workspace_id')
      .in('id', pageIds);
    
    if (error) {
      throw new Error(`Failed to fetch pages: ${error.message}`);
    }
    
    for (const page of pages || []) {
      await this.indexPage(page);
    }
  }

  /**
   * Index a single page with incremental updates
   */
  private async indexPage(page: Page): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Calculate content checksum
      const newChecksum = this.calculateChecksum(page.content || '');
      
      // Get existing index entry
      const existingIndex = await this.getExistingIndex(page.id, 'page');
      
      // Check if content has changed
      if (existingIndex?.content_checksum === newChecksum) {
        this.logger.debug('Page content unchanged, skipping', { 
          pageId: page.id,
          checksum: newChecksum 
        });
        return;
      }
      
      // Generate incremental updates
      const chunks = await this.generateIncrementalChunks(
        page,
        existingIndex
      );
      
      // Update vectors for changed chunks only
      await this.updateVectors(chunks, page.workspace_id, {
        page_id: page.id,
        page_title: page.title,
        entity_type: 'page'
      });
      
      // Update page checksum in database
      await this.updateEntityChecksum('pages', page.id, newChecksum);
      
      const processingTime = Date.now() - startTime;
      this.logger.info('Page indexed incrementally', {
        pageId: page.id,
        chunksUpdated: chunks.length,
        processingTimeMs: processingTime
      });
      
    } catch (error) {
      this.logger.error('Failed to index page', { pageId: page.id, error });
      throw error;
    }
  }

  /**
   * Index blocks with incremental updates
   */
  async indexBlocks(blockIds: string[]): Promise<void> {
    this.logger.info('Incrementally indexing blocks', { count: blockIds.length });
    
    // Fetch blocks with checksums
    const { data: blocks, error } = await this.supabase
      .from('blocks')
      .select('*')
      .in('id', blockIds);
    
    if (error) {
      throw new Error(`Failed to fetch blocks: ${error.message}`);
    }
    
    for (const block of blocks || []) {
      await this.indexBlock(block);
    }
  }

  /**
   * Index a single block with incremental updates
   */
  private async indexBlock(block: Block): Promise<void> {
    const contentStr = JSON.stringify(block.content);
    const newChecksum = this.calculateChecksum(contentStr);
    
    // Get existing index
    const existingIndex = await this.getExistingIndex(block.id, 'block');
    
    // Check if content has changed
    if (existingIndex?.content_checksum === newChecksum) {
      this.logger.debug('Block content unchanged, skipping', {
        blockId: block.id,
        checksum: newChecksum
      });
      return;
    }
    
    // For blocks, we typically re-index the whole thing as they're smaller
    const { data: page } = await this.supabase
      .from('pages')
      .select('workspace_id')
      .eq('id', block.page_id)
      .single();
    
    if (page) {
      await embeddingGenerationService.generateAndStoreEmbedding(
        contentStr,
        page.workspace_id,
        {
          block_id: block.id,
          block_type: block.type,
          page_id: block.page_id,
          entity_type: 'block'
        }
      );
      
      // Update block checksum
      await this.updateEntityChecksum('blocks', block.id, newChecksum);
    }
  }

  /**
   * Get existing index entry for an entity
   */
  private async getExistingIndex(
    entityId: string,
    entityType: string
  ): Promise<IndexEntry | null> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('*')
      .eq('metadata->>entity_id', entityId)
      .eq('metadata->>entity_type', entityType)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return {
      id: data.id,
      entity_id: entityId,
      entity_type: entityType,
      content: data.content,
      content_checksum: data.metadata?.content_checksum,
      metadata: data.metadata
    };
  }

  /**
   * Generate incremental chunks for a page
   */
  private async generateIncrementalChunks(
    page: Page,
    existingIndex: IndexEntry | null
  ): Promise<ContentChunk[]> {
    const newContent = page.content || '';
    const oldContent = existingIndex?.content || '';
    
    // If no existing index, chunk everything
    if (!existingIndex) {
      return this.chunkContent(newContent);
    }
    
    // Compute content diff
    const contentDiff = this.computeContentDiff(oldContent, newContent);
    
    // Generate chunks only for changed sections
    const changedChunks: ContentChunk[] = [];
    
    // Process added content
    for (const added of contentDiff.added) {
      const chunks = this.chunkContent(added);
      changedChunks.push(...chunks);
    }
    
    // Process modified content
    for (const modified of contentDiff.modified) {
      const chunks = this.chunkContent(modified);
      changedChunks.push(...chunks);
    }
    
    return changedChunks;
  }

  /**
   * Compute diff between old and new content
   */
  private computeContentDiff(oldContent: string, newContent: string): ContentDiff {
    // Use diff library to find changes
    const changes = diff.diffLines(oldContent, newContent);
    
    const result: ContentDiff = {
      added: [],
      removed: [],
      modified: [],
      unchanged: []
    };
    
    for (const change of changes) {
      if (change.added) {
        result.added.push(change.value);
      } else if (change.removed) {
        result.removed.push(change.value);
      } else {
        result.unchanged.push(change.value);
      }
    }
    
    // Detect modified sections (removed + added in sequence)
    // This is a simplified approach - could be more sophisticated
    if (result.removed.length > 0 && result.added.length > 0) {
      // Treat consecutive remove+add as modification
      const modified = result.added.map((added, i) => {
        if (result.removed[i]) {
          return added; // Return the new version
        }
        return null;
      }).filter(Boolean) as string[];
      
      result.modified = modified;
    }
    
    return result;
  }

  /**
   * Chunk content into smaller pieces
   */
  private chunkContent(content: string): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    
    // Simple chunking by character count with overlap
    for (let i = 0; i < content.length; i += this.CHUNK_SIZE - this.CHUNK_OVERLAP) {
      const chunk = content.slice(i, i + this.CHUNK_SIZE);
      
      if (chunk.trim().length > 0) {
        chunks.push({
          id: this.generateChunkId(content, i),
          content: chunk,
          checksum: this.calculateChecksum(chunk),
          position: i
        });
      }
    }
    
    return chunks;
  }

  /**
   * Update vectors for changed chunks
   */
  private async updateVectors(
    chunks: ContentChunk[],
    workspaceId: string,
    metadata: any
  ): Promise<void> {
    for (const chunk of chunks) {
      // Generate embedding for chunk
      await embeddingGenerationService.generateAndStoreEmbedding(
        chunk.content,
        workspaceId,
        {
          ...metadata,
          chunk_id: chunk.id,
          chunk_position: chunk.position,
          chunk_checksum: chunk.checksum
        }
      );
    }
  }

  /**
   * Calculate SHA-256 checksum of content
   */
  private calculateChecksum(content: string): string {
    return createHash('sha256')
      .update(content)
      .digest('hex');
  }

  /**
   * Generate unique ID for a chunk
   */
  private generateChunkId(content: string, position: number): string {
    const hash = createHash('sha256')
      .update(`${content.substring(position, position + 20)}:${position}`)
      .digest('hex')
      .substring(0, 8);
    
    return `chunk_${position}_${hash}`;
  }

  /**
   * Update entity checksum in database
   */
  private async updateEntityChecksum(
    table: string,
    entityId: string,
    checksum: string
  ): Promise<void> {
    // Store checksum in metadata or add column if needed
    const { error } = await this.supabase
      .from(table)
      .update({ 
        content_checksum: checksum,
        updated_at: new Date().toISOString()
      })
      .eq('id', entityId);
    
    if (error) {
      // Column might not exist yet, store in documents metadata
      await this.supabase
        .from('documents')
        .update({
          'metadata': {
            content_checksum: checksum
          }
        })
        .eq('metadata->>entity_id', entityId);
    }
  }

  /**
   * Analyze content changes and return statistics
   */
  async analyzeContentChanges(
    entityId: string,
    entityType: string,
    newContent: string
  ): Promise<{
    hasChanged: boolean;
    changePercentage: number;
    addedChars: number;
    removedChars: number;
  }> {
    const existingIndex = await this.getExistingIndex(entityId, entityType);
    
    if (!existingIndex) {
      return {
        hasChanged: true,
        changePercentage: 100,
        addedChars: newContent.length,
        removedChars: 0
      };
    }
    
    const oldContent = existingIndex.content || '';
    const diff = this.computeContentDiff(oldContent, newContent);
    
    const addedChars = diff.added.join('').length;
    const removedChars = diff.removed.join('').length;
    const totalChars = Math.max(oldContent.length, newContent.length);
    
    const changePercentage = totalChars > 0
      ? ((addedChars + removedChars) / totalChars) * 100
      : 0;
    
    return {
      hasChanged: changePercentage > 0,
      changePercentage,
      addedChars,
      removedChars
    };
  }

  /**
   * Bulk analyze multiple entities for changes
   */
  async bulkAnalyzeChanges(
    entities: Array<{ id: string; type: string; content: string }>
  ): Promise<Map<string, boolean>> {
    const changeMap = new Map<string, boolean>();
    
    for (const entity of entities) {
      const checksum = this.calculateChecksum(entity.content);
      const existing = await this.getExistingIndex(entity.id, entity.type);
      
      changeMap.set(
        entity.id,
        !existing || existing.content_checksum !== checksum
      );
    }
    
    return changeMap;
  }
}

// Create singleton instance
export const incrementalIndexer = new IncrementalIndexer();