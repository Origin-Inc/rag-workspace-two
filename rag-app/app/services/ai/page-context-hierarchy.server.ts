import { prisma } from '~/utils/db.server';
import type { Page } from '@prisma/client';
import { pageHierarchyService } from '../page-hierarchy.server';

export interface HierarchicalContext {
  current: PageContext;
  parent?: PageContext;
  ancestors?: PageContext[];
  children?: PageContext[];
  siblings?: PageContext[];
}

export interface PageContext {
  id: string;
  title: string;
  level: 'ancestor' | 'parent' | 'current' | 'child' | 'sibling';
  depth: number;
  content?: any;
  summary?: string;
  metadata?: any;
  fullContent?: boolean;
}

export class AIHierarchyContextService {
  private readonly MAX_CONTEXT_SIZE = 50000; // 50KB limit
  private readonly MAX_DEPTH = 3;
  private readonly MAX_CHILDREN = 10;
  private readonly MAX_SIBLINGS = 5;

  /**
   * Build complete hierarchical context for a page
   */
  async getHierarchicalContext(
    pageId: string,
    options?: {
      includeAncestors?: boolean;
      includeChildren?: boolean;
      includeSiblings?: boolean;
      maxDepth?: number;
    }
  ): Promise<HierarchicalContext> {
    const {
      includeAncestors = true,
      includeChildren = true,
      includeSiblings = true,
      maxDepth = this.MAX_DEPTH
    } = options || {};

    // Get current page with full content
    const currentPage = await this.getCurrentPageContext(pageId);
    const context: HierarchicalContext = { current: currentPage };

    // Get parent and ancestors if requested
    if (includeAncestors) {
      const ancestorData = await this.getAncestorContext(pageId, maxDepth);
      if (ancestorData.parent) {
        context.parent = ancestorData.parent;
      }
      if (ancestorData.ancestors?.length) {
        context.ancestors = ancestorData.ancestors;
      }
    }

    // Get children if requested
    if (includeChildren) {
      const children = await this.getChildrenContext(pageId);
      if (children.length > 0) {
        context.children = children;
      }
    }

    // Get siblings if requested
    if (includeSiblings && currentPage) {
      const siblings = await this.getSiblingContext(pageId);
      if (siblings.length > 0) {
        context.siblings = siblings;
      }
    }

    return context;
  }

  /**
   * Get current page with full content
   */
  private async getCurrentPageContext(pageId: string): Promise<PageContext> {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        blocks: {
          orderBy: { position: 'asc' },
          take: 50 // Limit blocks for context
        }
      }
    });

    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }

    return {
      id: page.id,
      title: page.title,
      level: 'current',
      depth: 0,
      content: {
        text: page.content,
        blocks: page.blocks.map(b => ({
          id: b.id,
          type: b.type,
          content: b.content
        }))
      },
      metadata: page.metadata as any,
      fullContent: true
    };
  }

  /**
   * Get parent and ancestor pages with summaries
   */
  private async getAncestorContext(
    pageId: string,
    maxDepth: number
  ): Promise<{ parent?: PageContext; ancestors?: PageContext[] }> {
    const pageWithAncestors = await pageHierarchyService.getPageWithAncestors(pageId);
    
    if (!pageWithAncestors || !pageWithAncestors.ancestors?.length) {
      return {};
    }

    const ancestors: PageContext[] = [];
    let parent: PageContext | undefined;

    // Process ancestors from root to immediate parent
    for (let i = 0; i < Math.min(pageWithAncestors.ancestors.length, maxDepth); i++) {
      const ancestor = pageWithAncestors.ancestors[i];
      const summary = await this.generatePageSummary(ancestor.id);
      
      const context: PageContext = {
        id: ancestor.id,
        title: ancestor.title,
        level: 'ancestor',
        depth: pageWithAncestors.ancestors.length - i,
        summary,
        metadata: ancestor.metadata as any
      };

      // The last ancestor is the immediate parent
      if (i === pageWithAncestors.ancestors.length - 1) {
        context.level = 'parent';
        parent = context;
      } else {
        ancestors.push(context);
      }
    }

    return { parent, ancestors };
  }

  /**
   * Get child pages with summaries
   */
  private async getChildrenContext(pageId: string): Promise<PageContext[]> {
    const children = await prisma.page.findMany({
      where: {
        parentId: pageId,
        isArchived: false
      },
      orderBy: { position: 'asc' },
      take: this.MAX_CHILDREN
    });

    const childContexts = await Promise.all(
      children.map(async (child) => ({
        id: child.id,
        title: child.title,
        level: 'child' as const,
        depth: 1,
        summary: await this.generatePageSummary(child.id),
        metadata: child.metadata as any
      }))
    );

    return childContexts;
  }

  /**
   * Get sibling pages (same parent) with summaries
   */
  private async getSiblingContext(pageId: string): Promise<PageContext[]> {
    // First get the page to find its parent
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { parentId: true }
    });

    if (!page?.parentId) {
      return [];
    }

    const siblings = await prisma.page.findMany({
      where: {
        parentId: page.parentId,
        id: { not: pageId },
        isArchived: false
      },
      orderBy: { position: 'asc' },
      take: this.MAX_SIBLINGS
    });

    const siblingContexts = await Promise.all(
      siblings.map(async (sibling) => ({
        id: sibling.id,
        title: sibling.title,
        level: 'sibling' as const,
        depth: 0,
        summary: await this.generatePageSummary(sibling.id),
        metadata: sibling.metadata as any
      }))
    );

    return siblingContexts;
  }

  /**
   * Generate a summary of a page for context
   */
  private async generatePageSummary(pageId: string): Promise<string> {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: {
        title: true,
        content: true,
        blocks: {
          select: { content: true },
          take: 5,
          orderBy: { position: 'asc' }
        }
      }
    });

    if (!page) return '';

    // Extract text content from the page
    let textContent = page.title + '. ';
    
    // Add main content if it's text
    if (page.content && typeof page.content === 'string') {
      textContent += page.content.substring(0, 200) + ' ';
    } else if (page.content && typeof page.content === 'object') {
      textContent += JSON.stringify(page.content).substring(0, 200) + ' ';
    }

    // Add block content
    for (const block of page.blocks) {
      if (block.content && typeof block.content === 'string') {
        textContent += block.content.substring(0, 100) + ' ';
      }
    }

    // Truncate to reasonable summary length
    return textContent.substring(0, 500).trim();
  }

  /**
   * Resolve @parent context reference
   */
  async resolveParentContext(pageId: string): Promise<string> {
    const { parent } = await this.getAncestorContext(pageId, 1);
    
    if (!parent) {
      return 'This page has no parent.';
    }

    return this.formatContextForAI([parent]);
  }

  /**
   * Resolve @ancestors context reference
   */
  async resolveAncestorsContext(pageId: string, maxDepth = 3): Promise<string> {
    const { ancestors, parent } = await this.getAncestorContext(pageId, maxDepth);
    
    const allAncestors = [...(ancestors || [])];
    if (parent) allAncestors.push(parent);

    if (allAncestors.length === 0) {
      return 'This page has no ancestors.';
    }

    return this.formatContextForAI(allAncestors);
  }

  /**
   * Resolve @children context reference
   */
  async resolveChildrenContext(pageId: string): Promise<string> {
    const children = await this.getChildrenContext(pageId);
    
    if (children.length === 0) {
      return 'This page has no children.';
    }

    return this.formatContextForAI(children);
  }

  /**
   * Format context data for AI consumption
   */
  formatContextForAI(contexts: PageContext[]): string {
    let formatted = '';

    for (const ctx of contexts) {
      formatted += `\n[${ctx.level.toUpperCase()}`;
      if (ctx.depth > 0) formatted += ` - Level ${ctx.depth}`;
      formatted += `] ${ctx.title}\n`;
      
      if (ctx.fullContent && ctx.content) {
        formatted += 'Full Content:\n';
        if (typeof ctx.content === 'string') {
          formatted += ctx.content + '\n';
        } else {
          formatted += JSON.stringify(ctx.content, null, 2) + '\n';
        }
      } else if (ctx.summary) {
        formatted += 'Summary: ' + ctx.summary + '\n';
      }
      
      if (ctx.metadata) {
        formatted += 'Metadata: ' + JSON.stringify(ctx.metadata) + '\n';
      }
    }

    // Ensure we don't exceed context size limits
    if (formatted.length > this.MAX_CONTEXT_SIZE) {
      formatted = formatted.substring(0, this.MAX_CONTEXT_SIZE) + '\n[Context truncated due to size limits]';
    }

    return formatted;
  }

  /**
   * Build context prompt for AI with hierarchy information
   */
  async buildContextPrompt(
    pageId: string,
    userQuery: string,
    contextReferences: string[]
  ): Promise<string> {
    let contextPrompt = '';

    // Check for special context references in the query
    const hasParentRef = contextReferences.includes('@parent');
    const hasAncestorsRef = contextReferences.includes('@ancestors');
    const hasChildrenRef = contextReferences.includes('@children');
    const hasSiblingsRef = contextReferences.includes('@siblings');

    // Build the context based on references
    if (hasParentRef || hasAncestorsRef || hasChildrenRef || hasSiblingsRef) {
      const context = await this.getHierarchicalContext(pageId, {
        includeAncestors: hasParentRef || hasAncestorsRef,
        includeChildren: hasChildrenRef,
        includeSiblings: hasSiblingsRef
      });

      contextPrompt += 'Page Hierarchy Context:\n';
      contextPrompt += '======================\n';

      // Add current page context
      contextPrompt += this.formatContextForAI([context.current]);

      // Add requested context
      if (hasAncestorsRef && context.ancestors) {
        contextPrompt += '\nAncestor Pages:\n';
        contextPrompt += this.formatContextForAI(context.ancestors);
      }

      if (hasParentRef && context.parent) {
        contextPrompt += '\nParent Page:\n';
        contextPrompt += this.formatContextForAI([context.parent]);
      }

      if (hasChildrenRef && context.children) {
        contextPrompt += '\nChild Pages:\n';
        contextPrompt += this.formatContextForAI(context.children);
      }

      if (hasSiblingsRef && context.siblings) {
        contextPrompt += '\nSibling Pages:\n';
        contextPrompt += this.formatContextForAI(context.siblings);
      }
    } else {
      // Default context: just the current page
      const currentContext = await this.getCurrentPageContext(pageId);
      contextPrompt += this.formatContextForAI([currentContext]);
    }

    contextPrompt += '\n\nUser Query: ' + userQuery;
    
    return contextPrompt;
  }
}

export const aiHierarchyContextService = new AIHierarchyContextService();