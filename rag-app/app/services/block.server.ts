import { createSupabaseAdmin } from '~/utils/supabase.server';
import type { Block, NewBlock, UpdateBlock, BlockType } from '~/types/supabase';
import type { BlockContent, BlockPosition, BlockMetadata } from '~/types/blocks';
import { getDefaultContent } from '~/types/blocks';

export interface CreateBlockInput {
  pageId: string;
  type: BlockType;
  content?: BlockContent;
  position?: BlockPosition;
  parentId?: string | null;
  metadata?: BlockMetadata;
  properties?: any;
  createdBy: string;
}

export interface UpdateBlockInput {
  content?: BlockContent;
  position?: BlockPosition;
  metadata?: BlockMetadata;
  properties?: any;
  updatedBy?: string;
}

export interface MoveBlockInput {
  blockId: string;
  newPosition: BlockPosition;
  newParentId?: string | null;
  newPageId?: string;
}

export interface BulkUpdateBlock {
  id: string;
  updates: UpdateBlockInput;
}

export class BlockService {
  private supabase = createSupabaseAdmin();

  // Create a new block
  async createBlock(input: CreateBlockInput): Promise<Block> {
    const defaultContent = getDefaultContent(input.type);
    
    const newBlock: NewBlock = {
      page_id: input.pageId,
      parent_id: input.parentId || null,
      type: input.type,
      content: input.content || defaultContent,
      position: input.position || { x: 0, y: 0, width: 6, height: 1 },
      metadata: input.metadata || {},
      properties: input.properties || {},
      created_by: input.createdBy,
      updated_by: input.createdBy,
    };

    const { data, error } = await this.supabase
      .from('blocks')
      .insert(newBlock)
      .select()
      .single();

    if (error) {
      console.error('Error creating block:', error);
      throw new Error('Failed to create block');
    }

    // Update page's last edited time
    await this.updatePageTimestamp(input.pageId, input.createdBy);

    return data;
  }

  // Create multiple blocks at once
  async createBlocks(blocks: CreateBlockInput[]): Promise<Block[]> {
    const newBlocks: NewBlock[] = blocks.map(input => {
      const defaultContent = getDefaultContent(input.type);
      return {
        page_id: input.pageId,
        parent_id: input.parentId || null,
        type: input.type,
        content: input.content || defaultContent,
        position: input.position || { x: 0, y: 0, width: 6, height: 1 },
        metadata: input.metadata || {},
        properties: input.properties || {},
        created_by: input.createdBy,
        updated_by: input.createdBy,
      };
    });

    const { data, error } = await this.supabase
      .from('blocks')
      .insert(newBlocks)
      .select();

    if (error) {
      console.error('Error creating blocks:', error);
      throw new Error('Failed to create blocks');
    }

    // Update page timestamp
    if (blocks.length > 0) {
      await this.updatePageTimestamp(blocks[0].pageId, blocks[0].createdBy);
    }

    return data || [];
  }

  // Get a block by ID
  async getBlock(blockId: string): Promise<Block | null> {
    const { data, error } = await this.supabase
      .from('blocks')
      .select('*')
      .eq('id', blockId)
      .single();

    if (error) {
      console.error('Error fetching block:', error);
      return null;
    }

    return data;
  }

  // Get all blocks for a page
  async getPageBlocks(pageId: string): Promise<Block[]> {
    const { data, error } = await this.supabase
      .from('blocks')
      .select('*')
      .eq('page_id', pageId)
      .order('position->y')
      .order('position->x');

    if (error) {
      console.error('Error fetching page blocks:', error);
      return [];
    }

    return data || [];
  }

  // Update a block
  async updateBlock(blockId: string, updates: UpdateBlockInput): Promise<Block> {
    const updateData: UpdateBlock = {
      content: updates.content,
      position: updates.position,
      metadata: updates.metadata,
      properties: updates.properties,
      updated_by: updates.updatedBy,
      updated_at: new Date().toISOString(),
      version: this.supabase.sql`version + 1`,
    };

    const { data, error } = await this.supabase
      .from('blocks')
      .update(updateData)
      .eq('id', blockId)
      .select()
      .single();

    if (error) {
      console.error('Error updating block:', error);
      throw new Error('Failed to update block');
    }

    // Update page timestamp
    if (updates.updatedBy) {
      await this.updatePageTimestamp(data.page_id, updates.updatedBy);
    }

    return data;
  }

  // Bulk update blocks (for performance when updating multiple blocks)
  async bulkUpdateBlocks(updates: BulkUpdateBlock[]): Promise<Block[]> {
    const promises = updates.map(({ id, updates }) => 
      this.supabase
        .from('blocks')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
          version: this.supabase.sql`version + 1`,
        })
        .eq('id', id)
        .select()
        .single()
    );

    const results = await Promise.all(promises);
    const blocks: Block[] = [];

    for (const result of results) {
      if (result.data) {
        blocks.push(result.data);
      }
    }

    // Update page timestamp if we have blocks
    if (blocks.length > 0 && updates[0].updates.updatedBy) {
      await this.updatePageTimestamp(blocks[0].page_id, updates[0].updates.updatedBy);
    }

    return blocks;
  }

  // Move a block to a new position
  async moveBlock(input: MoveBlockInput): Promise<Block> {
    const updates: UpdateBlock = {
      position: input.newPosition,
      parent_id: input.newParentId,
      updated_at: new Date().toISOString(),
    };

    if (input.newPageId) {
      updates.page_id = input.newPageId;
    }

    const { data, error } = await this.supabase
      .from('blocks')
      .update(updates)
      .eq('id', input.blockId)
      .select()
      .single();

    if (error) {
      console.error('Error moving block:', error);
      throw new Error('Failed to move block');
    }

    return data;
  }

  // Duplicate a block
  async duplicateBlock(blockId: string, userId: string): Promise<Block> {
    // Get the original block
    const original = await this.getBlock(blockId);
    if (!original) {
      throw new Error('Block not found');
    }

    // Create a copy with adjusted position
    const newPosition = { ...original.position };
    newPosition.y += 1; // Place below original

    const { data, error } = await this.supabase
      .from('blocks')
      .insert({
        page_id: original.page_id,
        parent_id: original.parent_id,
        type: original.type,
        content: original.content,
        properties: original.properties,
        position: newPosition,
        metadata: { ...original.metadata, duplicatedFrom: blockId },
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error duplicating block:', error);
      throw new Error('Failed to duplicate block');
    }

    return data;
  }

  // Delete a block
  async deleteBlock(blockId: string, userId: string): Promise<boolean> {
    // Get block info before deletion
    const block = await this.getBlock(blockId);
    if (!block) {
      return false;
    }

    // Delete the block (cascade will handle child blocks)
    const { error } = await this.supabase
      .from('blocks')
      .delete()
      .eq('id', blockId);

    if (error) {
      console.error('Error deleting block:', error);
      throw new Error('Failed to delete block');
    }

    // Update page timestamp
    await this.updatePageTimestamp(block.page_id, userId);

    return true;
  }

  // Delete multiple blocks
  async deleteBlocks(blockIds: string[], userId: string): Promise<boolean> {
    if (blockIds.length === 0) return true;

    // Get page ID from first block
    const firstBlock = await this.getBlock(blockIds[0]);
    if (!firstBlock) return false;

    const { error } = await this.supabase
      .from('blocks')
      .delete()
      .in('id', blockIds);

    if (error) {
      console.error('Error deleting blocks:', error);
      throw new Error('Failed to delete blocks');
    }

    // Update page timestamp
    await this.updatePageTimestamp(firstBlock.page_id, userId);

    return true;
  }

  // Create a synced block
  async createSyncedBlock(
    sourceBlockId: string,
    targetPageId: string,
    position: BlockPosition,
    userId: string
  ): Promise<Block> {
    const sourceBlock = await this.getBlock(sourceBlockId);
    if (!sourceBlock) {
      throw new Error('Source block not found');
    }

    const { data, error } = await this.supabase
      .from('blocks')
      .insert({
        page_id: targetPageId,
        type: 'synced_block',
        content: { sourceId: sourceBlockId, sourcePageId: sourceBlock.page_id },
        position,
        metadata: { syncedFrom: sourceBlock.page_id },
        is_synced: true,
        sync_source_id: sourceBlockId,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating synced block:', error);
      throw new Error('Failed to create synced block');
    }

    return data;
  }

  // Get synced blocks for a source block
  async getSyncedBlocks(sourceBlockId: string): Promise<Block[]> {
    const { data, error } = await this.supabase
      .from('blocks')
      .select('*')
      .eq('sync_source_id', sourceBlockId)
      .eq('is_synced', true);

    if (error) {
      console.error('Error fetching synced blocks:', error);
      return [];
    }

    return data || [];
  }

  // Search blocks in a workspace
  async searchBlocks(workspaceId: string, query: string, limit: number = 20) {
    const { data, error } = await this.supabase
      .from('blocks')
      .select(`
        id,
        type,
        content,
        page_id,
        pages!inner(
          id,
          title,
          workspace_id
        )
      `)
      .eq('pages.workspace_id', workspaceId)
      .textSearch('search_vector', query, {
        config: 'english',
      })
      .limit(limit);

    if (error) {
      console.error('Error searching blocks:', error);
      return [];
    }

    return data || [];
  }

  // Add a comment to a block
  async addBlockComment(
    blockId: string,
    pageId: string,
    userId: string,
    content: string
  ) {
    const { data, error } = await this.supabase
      .from('block_comments')
      .insert({
        block_id: blockId,
        page_id: pageId,
        user_id: userId,
        content,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding comment:', error);
      throw new Error('Failed to add comment');
    }

    return data;
  }

  // Get block comments
  async getBlockComments(blockId: string, includeResolved: boolean = false) {
    let query = this.supabase
      .from('block_comments')
      .select('*')
      .eq('block_id', blockId)
      .order('created_at', { ascending: false });

    if (!includeResolved) {
      query = query.eq('resolved', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching comments:', error);
      return [];
    }

    return data || [];
  }

  // Resolve a comment
  async resolveComment(commentId: string, userId: string, resolved: boolean = true) {
    const { data, error } = await this.supabase
      .from('block_comments')
      .update({
        resolved,
        resolved_by: resolved ? userId : null,
        resolved_at: resolved ? new Date().toISOString() : null,
      })
      .eq('id', commentId)
      .select()
      .single();

    if (error) {
      console.error('Error resolving comment:', error);
      throw new Error('Failed to resolve comment');
    }

    return data;
  }

  // Reorder blocks in a grid layout
  async reorderBlocks(
    pageId: string,
    blockPositions: Array<{ id: string; position: BlockPosition }>,
    userId: string
  ): Promise<boolean> {
    const updates = blockPositions.map(({ id, position }) => ({
      id,
      updates: {
        position,
        updatedBy: userId,
      },
    }));

    await this.bulkUpdateBlocks(updates);
    return true;
  }

  // Helper to update page's last edited timestamp
  private async updatePageTimestamp(pageId: string, userId: string) {
    await this.supabase
      .from('pages')
      .update({
        last_edited_by: userId,
        last_edited_time: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pageId);
  }

  // Get block version history (if implementing versioning)
  async getBlockHistory(blockId: string, limit: number = 10) {
    // This would fetch from a block_history table if implemented
    // For now, just return the current block
    const block = await this.getBlock(blockId);
    return block ? [block] : [];
  }

  // Restore block to a previous version
  async restoreBlockVersion(blockId: string, version: number, userId: string) {
    // This would restore from block_history table if implemented
    throw new Error('Version history not yet implemented');
  }
}

export const blockService = new BlockService();