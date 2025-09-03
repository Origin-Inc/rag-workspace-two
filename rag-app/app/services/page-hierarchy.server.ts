import { prisma } from '~/utils/db.server';
import type { Page, Prisma } from '@prisma/client';

export interface CreateWorkspacePageInput {
  workspaceId: string;
  parentId?: string | null;
  title: string;
  slug?: string;
  content?: any;
  blocks?: any;
  icon?: string;
  userId: string;
  position?: number;
}

export interface PageWithHierarchy extends Page {
  ancestors?: Page[];
  children?: Page[];
  parent?: Page | null;
  depth?: number;
  path?: string[];
}

export class PageHierarchyService {

  /**
   * Create a page directly under a workspace
   */
  async createWorkspacePage(input: CreateWorkspacePageInput): Promise<Page> {

    // Validate workspace access
    const workspace = await prisma.workspace.findUnique({
      where: { id: input.workspaceId }
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Validate user has access to workspace
    const userWorkspace = await prisma.userWorkspace.findFirst({
      where: {
        userId: input.userId,
        workspaceId: input.workspaceId
      }
    });

    if (!userWorkspace) {
      throw new Error('User does not have access to this workspace');
    }

    // If parent specified, validate it exists and belongs to same workspace
    if (input.parentId) {
      const parentPage = await prisma.page.findUnique({
        where: { id: input.parentId }
      });

      if (!parentPage) {
        throw new Error('Parent page not found');
      }

      if (parentPage.workspaceId !== input.workspaceId) {
        throw new Error('Parent page belongs to different workspace');
      }
    }

    // Generate slug if not provided
    const slug = input.slug || this.generateSlug(input.title);

    // Get next position if not specified
    let position = input.position ?? 0;
    if (position === 0) {
      const lastPage = await prisma.page.findFirst({
        where: {
          workspaceId: input.workspaceId,
          parentId: input.parentId || null
        },
        orderBy: { position: 'desc' }
      });
      position = (lastPage?.position ?? -1) + 1;
    }

    // Create the page
    const page = await prisma.page.create({
      data: {
        workspaceId: input.workspaceId,
        parentId: input.parentId,
        title: input.title,
        slug,
        content: input.content || {},
        blocks: input.blocks || [],
        icon: input.icon,
        position,
        projectId: null // No project required in new hierarchy
      }
    });

    return page;
  }

  /**
   * Validate permissions through page hierarchy
   */
  async validatePageHierarchyPermissions(
    userId: string,
    pageId: string,
    permission: string
  ): Promise<boolean> {

    const page = await this.getPageWithAncestors(pageId);
    if (!page) {
      return false;
    }

    // Check workspace-level permission first
    const userWorkspace = await prisma.userWorkspace.findFirst({
      where: {
        userId,
        workspaceId: page.workspaceId
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true
              }
            }
          }
        }
      }
    });

    if (!userWorkspace) {
      return false;
    }

    // Check if user has required permission through their role
    const hasPermission = userWorkspace.role.permissions.some(rp => {
      const perm = rp.permission;
      return perm.resource === 'page' && perm.action === permission.split(':')[1];
    });

    return hasPermission;
  }

  /**
   * Get page with full ancestor chain
   */
  async getPageWithAncestors(pageId: string): Promise<PageWithHierarchy | null> {

    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        parent: {
          include: {
            parent: {
              include: {
                parent: true
              }
            }
          }
        }
      }
    });

    if (!page) {
      return null;
    }

    // Build ancestor chain
    const ancestors: Page[] = [];
    let currentParent = page.parent;
    while (currentParent) {
      ancestors.unshift(currentParent as Page);
      currentParent = (currentParent as any).parent;
    }

    return {
      ...page,
      ancestors,
      depth: ancestors.length,
      path: [...ancestors.map(a => a.title), page.title]
    };
  }

  /**
   * Get page with children
   */
  async getPageWithChildren(pageId: string): Promise<PageWithHierarchy | null> {

    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        children: {
          where: { isArchived: false },
          orderBy: { position: 'asc' }
        },
        parent: true
      }
    });

    return page as PageWithHierarchy;
  }

  /**
   * Move a page and all its descendants to a new parent
   */
  async moveSubtree(
    pageId: string,
    newParentId: string | null,
    userId: string
  ): Promise<Page> {

    // Validate the page exists
    const page = await prisma.page.findUnique({
      where: { id: pageId }
    });

    if (!page) {
      throw new Error('Page not found');
    }

    // Check for circular reference
    if (newParentId) {
      const isCircular = await this.checkCircularReference(pageId, newParentId);
      if (isCircular) {
        throw new Error('Cannot move page to its own descendant');
      }

      // Validate new parent exists and is in same workspace
      const newParent = await prisma.page.findUnique({
        where: { id: newParentId }
      });

      if (!newParent) {
        throw new Error('New parent page not found');
      }

      if (newParent.workspaceId !== page.workspaceId) {
        throw new Error('Cannot move page to different workspace');
      }
    }

    // Update the page's parent
    const updatedPage = await prisma.page.update({
      where: { id: pageId },
      data: { parentId: newParentId }
    });


    return updatedPage;
  }

  /**
   * Check if moving pageId under targetParentId would create a circular reference
   */
  async checkCircularReference(
    pageId: string,
    targetParentId: string
  ): Promise<boolean> {

    if (pageId === targetParentId) {
      return true;
    }

    // Get all descendants of pageId
    const descendants = await this.getAllDescendants(pageId);
    
    // Check if targetParentId is among the descendants
    return descendants.some(d => d.id === targetParentId);
  }

  /**
   * Get all descendants of a page
   */
  async getAllDescendants(pageId: string): Promise<Page[]> {

    const descendants: Page[] = [];
    const queue = [pageId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      
      const children = await prisma.page.findMany({
        where: { parentId: currentId }
      });

      descendants.push(...children);
      queue.push(...children.map(c => c.id));
    }

    return descendants;
  }

  /**
   * Get page breadcrumb path
   */
  async getPagePath(pageId: string): Promise<Array<{id: string; title: string; slug: string}>> {

    const pageWithAncestors = await this.getPageWithAncestors(pageId);
    if (!pageWithAncestors) {
      return [];
    }

    const path = [
      ...(pageWithAncestors.ancestors || []).map(a => ({
        id: a.id,
        title: a.title,
        slug: a.slug
      })),
      {
        id: pageWithAncestors.id,
        title: pageWithAncestors.title,
        slug: pageWithAncestors.slug
      }
    ];

    return path;
  }

  /**
   * Get all root pages for a workspace
   */
  async getWorkspaceRootPages(workspaceId: string): Promise<Page[]> {

    const pages = await prisma.page.findMany({
      where: {
        workspaceId,
        parentId: null,
        isArchived: false
      },
      orderBy: { position: 'asc' }
    });

    return pages;
  }

  /**
   * Get page tree for a workspace
   */
  async getPageTree(workspaceId: string, maxDepth: number = 3): Promise<PageWithHierarchy[]> {

    const rootPages = await this.getWorkspaceRootPages(workspaceId);
    
    const pagesWithChildren = await Promise.all(
      rootPages.map(page => this.loadPageTreeRecursive(page, 0, maxDepth))
    );

    return pagesWithChildren;
  }

  /**
   * Recursively load page tree
   */
  private async loadPageTreeRecursive(
    page: Page,
    currentDepth: number,
    maxDepth: number
  ): Promise<PageWithHierarchy> {
    if (currentDepth >= maxDepth) {
      return { ...page, children: [] };
    }

    const children = await prisma.page.findMany({
      where: {
        parentId: page.id,
        isArchived: false
      },
      orderBy: { position: 'asc' }
    });

    const childrenWithNested = await Promise.all(
      children.map(child => this.loadPageTreeRecursive(child, currentDepth + 1, maxDepth))
    );

    return {
      ...page,
      children: childrenWithNested,
      depth: currentDepth
    };
  }

  /**
   * Generate a URL-safe slug from a title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

export const pageHierarchyService = new PageHierarchyService();