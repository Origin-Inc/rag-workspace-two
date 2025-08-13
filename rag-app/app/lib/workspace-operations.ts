import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Types for workspace operations
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  ownerId: string;
  settings?: WorkspaceSettings;
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface WorkspaceSettings {
  defaultRole?: string;
  guestAccess?: boolean;
  sharingPolicy?: 'private' | 'members' | 'public';
  timezone?: string;
  logoUrl?: string;
  customDomain?: string | null;
  features?: {
    aiEnabled?: boolean;
    ragEnabled?: boolean;
    templatesEnabled?: boolean;
  };
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description?: string;
  structure: any;
  defaultPages?: any[];
  settings?: WorkspaceSettings;
}

export interface WorkspaceInput {
  name: string;
  description?: string;
  settings?: WorkspaceSettings;
  templateId?: string;
}

export interface WorkspaceUpdateInput {
  name?: string;
  description?: string;
  settings?: WorkspaceSettings;
}

// Error classes for workspace operations
export class WorkspaceError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

export class WorkspaceNotFoundError extends WorkspaceError {
  constructor(workspaceId: string) {
    super(`Workspace with ID ${workspaceId} not found`, 'WORKSPACE_NOT_FOUND');
  }
}

export class WorkspaceAccessDeniedError extends WorkspaceError {
  constructor(workspaceId: string) {
    super(`Access denied to workspace ${workspaceId}`, 'ACCESS_DENIED');
  }
}

/**
 * Workspace operations class for managing workspaces in Supabase
 */
export class WorkspaceOperations {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get a single workspace by ID
   */
  async getWorkspace(workspaceId: string): Promise<Workspace> {
    try {
      const { data, error } = await this.supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new WorkspaceNotFoundError(workspaceId);
        }
        throw new WorkspaceError(`Failed to fetch workspace: ${error.message}`, error.code);
      }

      return this.mapWorkspaceFromDb(data);
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new WorkspaceError(`Unexpected error fetching workspace: ${error}`);
    }
  }

  /**
   * Get all workspaces for the current user
   */
  async getWorkspaces(userId: string): Promise<Workspace[]> {
    try {
      const { data, error } = await this.supabase
        .from('user_workspaces')
        .select(`
          workspace:workspaces(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new WorkspaceError(`Failed to fetch workspaces: ${error.message}`, error.code);
      }

      return (data || []).map(item => this.mapWorkspaceFromDb(item.workspace));
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new WorkspaceError(`Unexpected error fetching workspaces: ${error}`);
    }
  }

  /**
   * Get workspace by slug
   */
  async getWorkspaceBySlug(slug: string): Promise<Workspace> {
    try {
      const { data, error } = await this.supabase
        .from('workspaces')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new WorkspaceNotFoundError(slug);
        }
        throw new WorkspaceError(`Failed to fetch workspace: ${error.message}`, error.code);
      }

      return this.mapWorkspaceFromDb(data);
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new WorkspaceError(`Unexpected error fetching workspace: ${error}`);
    }
  }

  /**
   * Check if a user has access to a workspace
   */
  async checkUserAccess(workspaceId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('user_workspaces')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new WorkspaceError(`Failed to check access: ${error.message}`, error.code);
      }

      return !!data;
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new WorkspaceError(`Unexpected error checking access: ${error}`);
    }
  }

  /**
   * Get workspace members
   */
  async getWorkspaceMembers(workspaceId: string) {
    try {
      const { data, error } = await this.supabase
        .from('user_workspaces')
        .select(`
          id,
          user_id,
          role_id,
          joined_at,
          users(id, email, name, avatar_url),
          roles(id, name, display_name)
        `)
        .eq('workspace_id', workspaceId)
        .order('joined_at', { ascending: true });

      if (error) {
        throw new WorkspaceError(`Failed to fetch members: ${error.message}`, error.code);
      }

      return data || [];
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new WorkspaceError(`Unexpected error fetching members: ${error}`);
    }
  }

  /**
   * Get workspace statistics
   */
  async getWorkspaceStats(workspaceId: string) {
    try {
      // Get project count
      const { count: projectCount, error: projectError } = await this.supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId);

      if (projectError) {
        throw new WorkspaceError(`Failed to fetch project count: ${projectError.message}`);
      }

      // Get page count
      const { count: pageCount, error: pageError } = await this.supabase
        .from('pages')
        .select('*, projects!inner(workspace_id)', { count: 'exact', head: true })
        .eq('projects.workspace_id', workspaceId);

      if (pageError) {
        throw new WorkspaceError(`Failed to fetch page count: ${pageError.message}`);
      }

      // Get member count
      const { count: memberCount, error: memberError } = await this.supabase
        .from('user_workspaces')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId);

      if (memberError) {
        throw new WorkspaceError(`Failed to fetch member count: ${memberError.message}`);
      }

      return {
        projects: projectCount || 0,
        pages: pageCount || 0,
        members: memberCount || 0,
      };
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new WorkspaceError(`Unexpected error fetching stats: ${error}`);
    }
  }

  /**
   * Get workspace templates
   */
  async getWorkspaceTemplates(workspaceId?: string): Promise<WorkspaceTemplate[]> {
    try {
      let query = this.supabase
        .from('workspace_templates')
        .select('*');

      // If workspaceId provided, get workspace-specific and public templates
      if (workspaceId) {
        query = query.or(`workspace_id.eq.${workspaceId},is_public.eq.true`);
      } else {
        // Otherwise just get public templates
        query = query.eq('is_public', true);
      }

      const { data, error } = await query.order('use_count', { ascending: false });

      if (error) {
        throw new WorkspaceError(`Failed to fetch templates: ${error.message}`, error.code);
      }

      return data || [];
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new WorkspaceError(`Unexpected error fetching templates: ${error}`);
    }
  }

  /**
   * Map database workspace to domain model
   */
  private mapWorkspaceFromDb(dbWorkspace: any): Workspace {
    return {
      id: dbWorkspace.id,
      name: dbWorkspace.name,
      slug: dbWorkspace.slug,
      description: dbWorkspace.description,
      ownerId: dbWorkspace.owner_id,
      settings: dbWorkspace.settings || {},
      templateId: dbWorkspace.template_id,
      createdAt: dbWorkspace.created_at,
      updatedAt: dbWorkspace.updated_at,
      archivedAt: dbWorkspace.archived_at,
    };
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(input: WorkspaceInput, userId: string): Promise<Workspace> {
    try {
      // Generate unique slug
      const slug = await this.generateUniqueSlug(input.name);

      // Prepare workspace data
      const workspaceData = {
        name: input.name,
        slug,
        description: input.description || null,
        owner_id: userId,
        settings: input.settings || {},
        template_id: input.templateId || null,
      };

      // Create workspace
      const { data: workspace, error: createError } = await this.supabase
        .from('workspaces')
        .insert(workspaceData)
        .select()
        .single();

      if (createError) {
        throw new WorkspaceError(`Failed to create workspace: ${createError.message}`, createError.code);
      }

      // Add creator as owner
      const { error: memberError } = await this.supabase
        .from('user_workspaces')
        .insert({
          user_id: userId,
          workspace_id: workspace.id,
          role_id: await this.getOwnerRoleId(),
        });

      if (memberError) {
        // Rollback workspace creation if member addition fails
        await this.supabase
          .from('workspaces')
          .delete()
          .eq('id', workspace.id);
        
        throw new WorkspaceError(`Failed to add owner to workspace: ${memberError.message}`, memberError.code);
      }

      // Apply template if provided
      if (input.templateId) {
        await this.applyWorkspaceTemplate(workspace.id, input.templateId);
      }

      return this.mapWorkspaceFromDb(workspace);
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new WorkspaceError(`Unexpected error creating workspace: ${error}`);
    }
  }

  /**
   * Apply a template to a workspace
   */
  private async applyWorkspaceTemplate(workspaceId: string, templateId: string): Promise<void> {
    try {
      const { data: template, error } = await this.supabase
        .from('workspace_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error || !template) {
        console.error('Template not found:', templateId);
        return; // Don't fail workspace creation if template is not found
      }

      // Update template use count
      await this.supabase
        .from('workspace_templates')
        .update({ use_count: (template.use_count || 0) + 1 })
        .eq('id', templateId);

      // Apply template structure (this would be expanded based on your template structure)
      if (template.settings) {
        await this.supabase
          .from('workspaces')
          .update({ settings: template.settings })
          .eq('id', workspaceId);
      }

      // Create default pages if specified in template
      if (template.default_pages && Array.isArray(template.default_pages)) {
        for (const page of template.default_pages) {
          // This would create default pages/projects based on template
          // Implementation depends on your page/project structure
        }
      }
    } catch (error) {
      console.error('Failed to apply template:', error);
      // Don't fail workspace creation if template application fails
    }
  }

  /**
   * Update a workspace
   */
  async updateWorkspace(workspaceId: string, input: WorkspaceUpdateInput, userId: string): Promise<Workspace> {
    try {
      // Check if user has permission to update
      const hasAccess = await this.checkUserAccess(workspaceId, userId);
      if (!hasAccess) {
        throw new WorkspaceAccessDeniedError(workspaceId);
      }

      // Prepare update data
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (input.name !== undefined) {
        updateData.name = input.name;
      }

      if (input.description !== undefined) {
        updateData.description = input.description;
      }

      if (input.settings !== undefined) {
        // Merge settings with existing ones
        const { data: existingWorkspace } = await this.supabase
          .from('workspaces')
          .select('settings')
          .eq('id', workspaceId)
          .single();

        updateData.settings = {
          ...(existingWorkspace?.settings || {}),
          ...input.settings,
        };
      }

      // Update workspace
      const { data: updatedWorkspace, error } = await this.supabase
        .from('workspaces')
        .update(updateData)
        .eq('id', workspaceId)
        .select()
        .single();

      if (error) {
        throw new WorkspaceError(`Failed to update workspace: ${error.message}`, error.code);
      }

      return this.mapWorkspaceFromDb(updatedWorkspace);
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new WorkspaceError(`Unexpected error updating workspace: ${error}`);
    }
  }

  /**
   * Delete (soft delete) a workspace
   */
  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    try {
      // Check if user is the owner
      const { data: member, error: memberError } = await this.supabase
        .from('user_workspaces')
        .select('role_id, roles(name)')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single();

      if (memberError || !member) {
        throw new WorkspaceAccessDeniedError(workspaceId);
      }

      // Check if user is owner
      if (member.roles?.name !== 'owner') {
        throw new WorkspaceError('Only workspace owners can delete workspaces', 'PERMISSION_DENIED');
      }

      // Soft delete by setting archived_at
      const { error: deleteError } = await this.supabase
        .from('workspaces')
        .update({ 
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', workspaceId);

      if (deleteError) {
        throw new WorkspaceError(`Failed to delete workspace: ${deleteError.message}`, deleteError.code);
      }
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new WorkspaceError(`Unexpected error deleting workspace: ${error}`);
    }
  }

  /**
   * Restore an archived workspace
   */
  async restoreWorkspace(workspaceId: string, userId: string): Promise<Workspace> {
    try {
      // Check if user is the owner
      const { data: member, error: memberError } = await this.supabase
        .from('user_workspaces')
        .select('role_id, roles(name)')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .single();

      if (memberError || !member) {
        throw new WorkspaceAccessDeniedError(workspaceId);
      }

      // Check if user is owner
      if (member.roles?.name !== 'owner') {
        throw new WorkspaceError('Only workspace owners can restore workspaces', 'PERMISSION_DENIED');
      }

      // Restore by clearing archived_at
      const { data: restoredWorkspace, error: restoreError } = await this.supabase
        .from('workspaces')
        .update({ 
          archived_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workspaceId)
        .select()
        .single();

      if (restoreError) {
        throw new WorkspaceError(`Failed to restore workspace: ${restoreError.message}`, restoreError.code);
      }

      return this.mapWorkspaceFromDb(restoredWorkspace);
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new WorkspaceError(`Unexpected error restoring workspace: ${error}`);
    }
  }

  /**
   * Get the owner role ID
   */
  private async getOwnerRoleId(): Promise<string> {
    const { data, error } = await this.supabase
      .from('roles')
      .select('id')
      .eq('name', 'owner')
      .single();

    if (error || !data) {
      throw new WorkspaceError('Owner role not found in system');
    }

    return data.id;
  }

  /**
   * Generate a unique slug for a workspace
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const { data } = await this.supabase
        .from('workspaces')
        .select('id')
        .eq('slug', slug)
        .single();

      if (!data) {
        return slug;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }
}

// Factory function to create workspace operations instance
export function createWorkspaceOperations(supabase: SupabaseClient): WorkspaceOperations {
  return new WorkspaceOperations(supabase);
}