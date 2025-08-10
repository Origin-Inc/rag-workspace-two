import { createSupabaseAdmin } from '~/utils/supabase.server';
import type { WorkspaceExtended } from '~/types/supabase';
import { prisma } from '~/utils/db.server';

export interface CreateWorkspaceInput {
  workspaceId: string; // From Prisma workspace
  tier?: 'free' | 'pro' | 'team' | 'enterprise';
  settings?: Record<string, any>;
  features?: Record<string, any>;
}

export interface UpdateWorkspaceInput {
  tier?: 'free' | 'pro' | 'team' | 'enterprise';
  settings?: Record<string, any>;
  features?: Record<string, any>;
  customDomain?: string;
  brandLogoUrl?: string;
}

export class WorkspaceService {
  private supabase = createSupabaseAdmin();

  // Create extended workspace settings in Supabase
  async createWorkspaceExtended(input: CreateWorkspaceInput): Promise<WorkspaceExtended> {
    const { data, error } = await this.supabase
      .from('workspaces_extended')
      .insert({
        workspace_id: input.workspaceId,
        tier: input.tier || 'free',
        settings: input.settings || {},
        features: input.features || {
          max_members: 5,
          max_pages: 100,
          version_history_days: 30,
        },
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating workspace extended:', error);
      throw new Error('Failed to create workspace settings');
    }

    return data;
  }

  // Get workspace with extended settings
  async getWorkspace(workspaceId: string) {
    // Get base workspace from Prisma
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        userWorkspaces: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            role: true,
          },
        },
      },
    });

    if (!workspace) {
      return null;
    }

    // Get extended settings from Supabase
    const { data: extended } = await this.supabase
      .from('workspaces_extended')
      .select()
      .eq('workspace_id', workspaceId)
      .single();

    return {
      ...workspace,
      extended,
    };
  }

  // Update workspace settings
  async updateWorkspace(
    workspaceId: string,
    updates: UpdateWorkspaceInput
  ): Promise<WorkspaceExtended> {
    const { data, error } = await this.supabase
      .from('workspaces_extended')
      .update({
        tier: updates.tier,
        settings: updates.settings,
        features: updates.features,
        custom_domain: updates.customDomain,
        brand_logo_url: updates.brandLogoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error) {
      console.error('Error updating workspace:', error);
      throw new Error('Failed to update workspace settings');
    }

    return data;
  }

  // Check workspace limits
  async checkWorkspaceLimits(workspaceId: string) {
    const { data, error } = await this.supabase
      .from('workspaces_extended')
      .select('storage_used_bytes, storage_limit_bytes, ai_credits_used, ai_credits_limit, features')
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) {
      console.error('Error checking workspace limits:', error);
      return {
        canUpload: true,
        canUseAI: true,
        canAddMembers: true,
        canCreatePages: true,
      };
    }

    const features = data.features as any;
    
    // Count current pages
    const { count: pageCount } = await this.supabase
      .from('pages')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('is_deleted', false);

    // Count current members from Prisma
    const memberCount = await prisma.userWorkspace.count({
      where: { workspaceId },
    });

    return {
      canUpload: data.storage_used_bytes < data.storage_limit_bytes,
      canUseAI: data.ai_credits_used < data.ai_credits_limit,
      canAddMembers: memberCount < (features?.max_members || 5),
      canCreatePages: (pageCount || 0) < (features?.max_pages || 100),
      usage: {
        storage: {
          used: data.storage_used_bytes,
          limit: data.storage_limit_bytes,
          percentage: (data.storage_used_bytes / data.storage_limit_bytes) * 100,
        },
        aiCredits: {
          used: data.ai_credits_used,
          limit: data.ai_credits_limit,
          percentage: (data.ai_credits_used / data.ai_credits_limit) * 100,
        },
        members: {
          used: memberCount,
          limit: features?.max_members || 5,
        },
        pages: {
          used: pageCount || 0,
          limit: features?.max_pages || 100,
        },
      },
    };
  }

  // Increment AI credits usage
  async incrementAICredits(workspaceId: string, credits: number = 1) {
    const { error } = await this.supabase.rpc('increment', {
      table_name: 'workspaces_extended',
      column_name: 'ai_credits_used',
      row_id: workspaceId,
      increment_value: credits,
    });

    if (error) {
      console.error('Error incrementing AI credits:', error);
    }
  }

  // Get workspace templates
  async getWorkspaceTemplates(workspaceId?: string) {
    let query = this.supabase
      .from('templates')
      .select('*')
      .order('use_count', { ascending: false });

    if (workspaceId) {
      // Get workspace-specific and public templates
      query = query.or(`workspace_id.eq.${workspaceId},is_public.eq.true`);
    } else {
      // Only public templates
      query = query.eq('is_public', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching templates:', error);
      return [];
    }

    return data;
  }

  // Create a template from a page
  async createTemplate(
    pageId: string,
    name: string,
    category: string,
    description?: string,
    isPublic: boolean = false,
    workspaceId?: string
  ) {
    // Get the page content
    const { data: page } = await this.supabase
      .from('pages')
      .select('*')
      .eq('id', pageId)
      .single();

    if (!page) {
      throw new Error('Page not found');
    }

    // Get all blocks for this page
    const { data: blocks } = await this.supabase
      .from('blocks')
      .select('*')
      .eq('page_id', pageId)
      .order('position->y', { ascending: true });

    const templateContent = {
      page: {
        title: page.title,
        type: page.type,
        icon: page.icon,
        content: page.content,
        properties: page.properties,
      },
      blocks: blocks || [],
    };

    const { data, error } = await this.supabase
      .from('templates')
      .insert({
        workspace_id: workspaceId,
        is_public: isPublic,
        category,
        name,
        description,
        content: templateContent,
        created_by: page.created_by,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating template:', error);
      throw new Error('Failed to create template');
    }

    return data;
  }

  // Delete workspace (soft delete in Supabase, actual delete handled by Prisma)
  async deleteWorkspace(workspaceId: string) {
    // Mark all pages as deleted
    const { error: pagesError } = await this.supabase
      .from('pages')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId);

    if (pagesError) {
      console.error('Error deleting workspace pages:', pagesError);
    }

    // Delete extended settings
    const { error: extendedError } = await this.supabase
      .from('workspaces_extended')
      .delete()
      .eq('workspace_id', workspaceId);

    if (extendedError) {
      console.error('Error deleting workspace extended:', extendedError);
    }

    // Delete from Prisma
    await prisma.workspace.delete({
      where: { id: workspaceId },
    });
  }
}

export const workspaceService = new WorkspaceService();