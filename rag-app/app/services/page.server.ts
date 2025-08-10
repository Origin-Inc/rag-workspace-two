import { createSupabaseAdmin } from '~/utils/supabase.server';
import type { Page, NewPage, UpdatePage } from '~/types/supabase';

export interface CreatePageInput {
  workspaceId: string;
  title?: string;
  parentId?: string | null;
  type?: 'document' | 'database' | 'kanban_board' | 'calendar_view' | 'gallery' | 'timeline' | 'chat';
  icon?: string;
  coverImage?: string;
  content?: any;
  properties?: any;
  createdBy: string;
}

export interface UpdatePageInput {
  title?: string;
  icon?: string;
  coverImage?: string;
  content?: any;
  properties?: any;
  isArchived?: boolean;
  isLocked?: boolean;
  lastEditedBy?: string;
}

export interface MovePageInput {
  pageId: string;
  newParentId?: string | null;
  newWorkspaceId?: string;
  newPosition?: number;
}

export class PageService {
  private supabase = createSupabaseAdmin();

  // Create a new page
  async createPage(input: CreatePageInput): Promise<Page> {
    // Get the next position if parent exists
    let position = 0;
    if (input.parentId) {
      const { data: siblings } = await this.supabase
        .from('pages')
        .select('position')
        .eq('parent_id', input.parentId)
        .order('position', { ascending: false })
        .limit(1);
      
      if (siblings && siblings.length > 0) {
        position = siblings[0].position + 1;
      }
    }

    const newPage: NewPage = {
      workspace_id: input.workspaceId,
      parent_id: input.parentId || null,
      title: input.title || 'Untitled',
      type: input.type || 'document',
      icon: input.icon,
      cover_image: input.coverImage,
      content: input.content || {},
      properties: input.properties || {},
      position,
      created_by: input.createdBy,
      last_edited_by: input.createdBy,
    };

    const { data, error } = await this.supabase
      .from('pages')
      .insert(newPage)
      .select()
      .single();

    if (error) {
      console.error('Error creating page:', error);
      throw new Error('Failed to create page');
    }

    // Track activity
    await this.trackActivity(data.id, input.createdBy, 'created');

    return data;
  }

  // Get a page by ID
  async getPage(pageId: string): Promise<Page | null> {
    const { data, error } = await this.supabase
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .eq('is_deleted', false)
      .single();

    if (error) {
      console.error('Error fetching page:', error);
      return null;
    }

    return data;
  }

  // Get page with hierarchy
  async getPageWithHierarchy(pageId: string) {
    // Get the page
    const page = await this.getPage(pageId);
    if (!page) return null;

    // Get parent pages for breadcrumb
    const { data: hierarchy } = await this.supabase
      .rpc('get_page_hierarchy', { page_uuid: pageId });

    // Get child pages
    const { data: children } = await this.supabase
      .from('pages')
      .select('id, title, icon, type, position')
      .eq('parent_id', pageId)
      .eq('is_deleted', false)
      .order('position');

    return {
      ...page,
      hierarchy: hierarchy || [],
      children: children || [],
    };
  }

  // Update a page
  async updatePage(pageId: string, updates: UpdatePageInput): Promise<Page> {
    const updateData: UpdatePage = {
      ...updates,
      last_edited_time: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('pages')
      .update(updateData)
      .eq('id', pageId)
      .select()
      .single();

    if (error) {
      console.error('Error updating page:', error);
      throw new Error('Failed to update page');
    }

    // Track activity
    if (updates.lastEditedBy) {
      await this.trackActivity(pageId, updates.lastEditedBy, 'edited');
    }

    return data;
  }

  // Move a page to a different parent or workspace
  async movePage(input: MovePageInput): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('move_page', {
        page_id: input.pageId,
        new_parent_id: input.newParentId,
        new_workspace_id: input.newWorkspaceId,
      });

    if (error) {
      console.error('Error moving page:', error);
      throw new Error(error.message || 'Failed to move page');
    }

    // Update position if specified
    if (input.newPosition !== undefined) {
      await this.supabase
        .from('pages')
        .update({ position: input.newPosition })
        .eq('id', input.pageId);
    }

    return true;
  }

  // Duplicate a page
  async duplicatePage(
    pageId: string,
    newTitle?: string,
    newParentId?: string
  ): Promise<string> {
    const { data, error } = await this.supabase
      .rpc('duplicate_page', {
        source_page_id: pageId,
        new_title: newTitle,
        new_parent_id: newParentId,
      });

    if (error) {
      console.error('Error duplicating page:', error);
      throw new Error('Failed to duplicate page');
    }

    return data;
  }

  // Delete a page (soft delete)
  async deletePage(pageId: string, userId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('pages')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        last_edited_by: userId,
      })
      .eq('id', pageId);

    if (error) {
      console.error('Error deleting page:', error);
      throw new Error('Failed to delete page');
    }

    // Track activity
    await this.trackActivity(pageId, userId, 'deleted');

    return true;
  }

  // Restore a deleted page
  async restorePage(pageId: string, userId: string): Promise<Page> {
    const { data, error } = await this.supabase
      .from('pages')
      .update({
        is_deleted: false,
        deleted_at: null,
        last_edited_by: userId,
      })
      .eq('id', pageId)
      .select()
      .single();

    if (error) {
      console.error('Error restoring page:', error);
      throw new Error('Failed to restore page');
    }

    // Track activity
    await this.trackActivity(pageId, userId, 'restored');

    return data;
  }

  // Archive/unarchive a page
  async archivePage(pageId: string, archive: boolean, userId: string): Promise<Page> {
    const { data, error } = await this.supabase
      .from('pages')
      .update({
        is_archived: archive,
        last_edited_by: userId,
      })
      .eq('id', pageId)
      .select()
      .single();

    if (error) {
      console.error('Error archiving page:', error);
      throw new Error('Failed to archive page');
    }

    // Track activity
    await this.trackActivity(pageId, userId, archive ? 'archived' : 'unarchived');

    return data;
  }

  // Get workspace pages
  async getWorkspacePages(
    workspaceId: string,
    options: {
      includeArchived?: boolean;
      includeDeleted?: boolean;
      parentId?: string | null;
      type?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    let query = this.supabase
      .from('pages')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId);

    // Apply filters
    if (!options.includeDeleted) {
      query = query.eq('is_deleted', false);
    }
    if (!options.includeArchived) {
      query = query.eq('is_archived', false);
    }
    if (options.parentId !== undefined) {
      if (options.parentId === null) {
        query = query.is('parent_id', null);
      } else {
        query = query.eq('parent_id', options.parentId);
      }
    }
    if (options.type) {
      query = query.eq('type', options.type);
    }

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    // Order by position and creation date
    query = query.order('position').order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching workspace pages:', error);
      return { pages: [], count: 0 };
    }

    return { pages: data || [], count: count || 0 };
  }

  // Search pages
  async searchPages(
    workspaceId: string,
    searchQuery: string,
    limit: number = 10
  ) {
    const { data, error } = await this.supabase
      .from('pages')
      .select('id, title, icon, type, parent_id, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('is_deleted', false)
      .textSearch('search_vector', searchQuery, {
        config: 'english',
      })
      .limit(limit);

    if (error) {
      console.error('Error searching pages:', error);
      return [];
    }

    return data || [];
  }

  // Get recent pages for a user
  async getRecentPages(workspaceId: string, userId: string, limit: number = 10) {
    const { data, error } = await this.supabase
      .from('page_activity')
      .select(`
        page_id,
        pages!inner(id, title, icon, type, updated_at)
      `)
      .eq('user_id', userId)
      .eq('pages.workspace_id', workspaceId)
      .eq('pages.is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent pages:', error);
      return [];
    }

    // Deduplicate and return unique pages
    const uniquePages = new Map();
    data?.forEach(item => {
      if (!uniquePages.has(item.page_id)) {
        uniquePages.set(item.page_id, (item as any).pages);
      }
    });

    return Array.from(uniquePages.values());
  }

  // Create page from template
  async createPageFromTemplate(
    templateId: string,
    workspaceId: string,
    parentId: string | null,
    userId: string
  ): Promise<string> {
    const { data, error } = await this.supabase
      .rpc('create_page_from_template', {
        template_id: templateId,
        target_workspace_id: workspaceId,
        target_parent_id: parentId,
        created_by_user: userId,
      });

    if (error) {
      console.error('Error creating page from template:', error);
      throw new Error('Failed to create page from template');
    }

    return data;
  }

  // Track page activity
  private async trackActivity(
    pageId: string,
    userId: string,
    action: string,
    details?: any
  ) {
    await this.supabase
      .from('page_activity')
      .insert({
        page_id: pageId,
        user_id: userId,
        action,
        details: details || {},
      });
  }

  // Get page permissions
  async getPagePermissions(pageId: string) {
    const { data, error } = await this.supabase
      .from('page_permissions')
      .select('*')
      .eq('page_id', pageId);

    if (error) {
      console.error('Error fetching page permissions:', error);
      return [];
    }

    return data || [];
  }

  // Set page permissions
  async setPagePermission(
    pageId: string,
    userId: string | null,
    permissions: {
      canView?: boolean;
      canEdit?: boolean;
      canComment?: boolean;
      canShare?: boolean;
    }
  ) {
    const { data, error } = await this.supabase
      .from('page_permissions')
      .upsert({
        page_id: pageId,
        user_id: userId,
        can_view: permissions.canView ?? true,
        can_edit: permissions.canEdit ?? false,
        can_comment: permissions.canComment ?? true,
        can_share: permissions.canShare ?? false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error setting page permission:', error);
      throw new Error('Failed to set page permission');
    }

    return data;
  }
}

export const pageService = new PageService();