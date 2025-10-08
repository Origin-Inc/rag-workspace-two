/**
 * Context Persistence Service
 *
 * Database-backed conversation context persistence to replace in-memory storage.
 * Implements U-shaped attention pattern for query history management.
 *
 * Related ADR: ADR-003 (Context Persistence Strategy)
 * Related Task: #67
 */

import { prisma } from '~/utils/db.server';
import type { ChatContext, QueryHistory, DataFile } from '@prisma/client';

// Types
export interface ConversationContext {
  activeFile: DataFile | null;
  currentTopic: string | null;
  entities: Record<string, string[]>;
  preferences: Record<string, any>;
}

export interface QueryHistoryEntry {
  id: string;
  query: string;
  intent: string;
  sql: string | null;
  results: any;
  response: string | null;
  createdAt: Date;
}

export interface CreateContextOptions {
  pageId: string;
  workspaceId: string;
  activeFileId?: string;
  currentTopic?: string;
  entities?: Record<string, string[]>;
  preferences?: Record<string, any>;
}

export interface UpdateContextOptions {
  activeFileId?: string | null;
  currentTopic?: string | null;
  entities?: Record<string, string[]>;
  preferences?: Record<string, any>;
}

/**
 * ContextPersistenceService
 *
 * Manages conversation context persistence to PostgreSQL database.
 * Provides context loading, saving, and query history management.
 */
export class ContextPersistenceService {
  /**
   * Load context for a page (or create if doesn't exist)
   */
  static async loadContext(pageId: string): Promise<ConversationContext> {
    const context = await prisma.chatContext.findUnique({
      where: { pageId },
      include: { activeFile: true }
    });

    if (!context) {
      return {
        activeFile: null,
        currentTopic: null,
        entities: {},
        preferences: {}
      };
    }

    return {
      activeFile: context.activeFile,
      currentTopic: context.currentTopic,
      entities: (context.entities as Record<string, string[]>) || {},
      preferences: (context.preferences as Record<string, any>) || {}
    };
  }

  /**
   * Create new context for a page
   */
  static async createContext(options: CreateContextOptions): Promise<ChatContext> {
    const {
      pageId,
      workspaceId,
      activeFileId,
      currentTopic,
      entities = {},
      preferences = {}
    } = options;

    return await prisma.chatContext.create({
      data: {
        pageId,
        workspaceId,
        activeFileId,
        currentTopic,
        entities,
        preferences
      }
    });
  }

  /**
   * Save context updates
   */
  static async saveContext(
    pageId: string,
    updates: UpdateContextOptions
  ): Promise<void> {
    // Check if context exists
    const existing = await prisma.chatContext.findUnique({
      where: { pageId }
    });

    if (!existing) {
      // Cannot update non-existent context
      throw new Error(`Context not found for page: ${pageId}`);
    }

    // Build update data, filtering out undefined values
    const updateData: any = {};

    if (updates.activeFileId !== undefined) {
      updateData.activeFileId = updates.activeFileId;
    }

    if (updates.currentTopic !== undefined) {
      updateData.currentTopic = updates.currentTopic;
    }

    if (updates.entities !== undefined) {
      updateData.entities = updates.entities;
    }

    if (updates.preferences !== undefined) {
      updateData.preferences = updates.preferences;
    }

    await prisma.chatContext.update({
      where: { pageId },
      data: updateData
    });
  }

  /**
   * Upsert context (create or update)
   */
  static async upsertContext(
    pageId: string,
    workspaceId: string,
    updates: UpdateContextOptions
  ): Promise<ChatContext> {
    return await prisma.chatContext.upsert({
      where: { pageId },
      update: {
        activeFileId: updates.activeFileId,
        currentTopic: updates.currentTopic,
        entities: updates.entities || {},
        preferences: updates.preferences || {}
      },
      create: {
        pageId,
        workspaceId,
        activeFileId: updates.activeFileId || null,
        currentTopic: updates.currentTopic || null,
        entities: updates.entities || {},
        preferences: updates.preferences || {}
      }
    });
  }

  /**
   * Update active file reference
   */
  static async updateActiveFile(
    pageId: string,
    fileId: string | null
  ): Promise<void> {
    await this.saveContext(pageId, { activeFileId: fileId });
  }

  /**
   * Update current topic
   */
  static async updateTopic(
    pageId: string,
    topic: string | null
  ): Promise<void> {
    await this.saveContext(pageId, { currentTopic: topic });
  }

  /**
   * Add or update entity tracking
   */
  static async updateEntities(
    pageId: string,
    entities: Record<string, string[]>
  ): Promise<void> {
    await this.saveContext(pageId, { entities });
  }

  /**
   * Add entity to tracking
   */
  static async addEntity(
    pageId: string,
    entityType: string,
    entityValue: string
  ): Promise<void> {
    const context = await this.loadContext(pageId);
    const entities = { ...context.entities };

    if (!entities[entityType]) {
      entities[entityType] = [];
    }

    if (!entities[entityType].includes(entityValue)) {
      entities[entityType].push(entityValue);
    }

    await this.saveContext(pageId, { entities });
  }

  /**
   * Update user preferences
   */
  static async updatePreferences(
    pageId: string,
    preferences: Record<string, any>
  ): Promise<void> {
    await this.saveContext(pageId, { preferences });
  }

  /**
   * Add query to history
   */
  static async addToHistory(
    pageId: string,
    query: string,
    intent: string,
    sql?: string,
    results?: any,
    response?: string
  ): Promise<QueryHistory> {
    return await prisma.queryHistory.create({
      data: {
        pageId,
        query,
        intent,
        sql: sql || null,
        results: results || null,
        response: response || null
      }
    });
  }

  /**
   * Get recent query history (U-shaped pattern)
   *
   * Returns most recent queries with option to limit.
   * For U-shaped attention: combine first N + last M queries
   */
  static async getRecentHistory(
    pageId: string,
    limit: number = 10
  ): Promise<QueryHistoryEntry[]> {
    const history = await prisma.queryHistory.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return history.map(h => ({
      id: h.id,
      query: h.query,
      intent: h.intent,
      sql: h.sql,
      results: h.results,
      response: h.response,
      createdAt: h.createdAt
    }));
  }

  /**
   * Get U-shaped history
   *
   * Returns first N queries + last M queries for context window management
   */
  static async getUShapedHistory(
    pageId: string,
    firstN: number = 2,
    lastM: number = 5
  ): Promise<QueryHistoryEntry[]> {
    // Get first N queries (oldest)
    const firstQueries = await prisma.queryHistory.findMany({
      where: { pageId },
      orderBy: { createdAt: 'asc' },
      take: firstN
    });

    // Get last M queries (most recent)
    const lastQueries = await prisma.queryHistory.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: lastM
    });

    // Combine and deduplicate
    const combined = [...firstQueries, ...lastQueries.reverse()];
    const seen = new Set<string>();
    const deduped = combined.filter(q => {
      if (seen.has(q.id)) return false;
      seen.add(q.id);
      return true;
    });

    return deduped.map(h => ({
      id: h.id,
      query: h.query,
      intent: h.intent,
      sql: h.sql,
      results: h.results,
      response: h.response,
      createdAt: h.createdAt
    }));
  }

  /**
   * Get total query count for a page
   */
  static async getQueryCount(pageId: string): Promise<number> {
    return await prisma.queryHistory.count({
      where: { pageId }
    });
  }

  /**
   * Delete context for a page
   */
  static async deleteContext(pageId: string): Promise<void> {
    await prisma.chatContext.delete({
      where: { pageId }
    });
  }

  /**
   * Clear query history for a page
   */
  static async clearHistory(pageId: string): Promise<void> {
    await prisma.queryHistory.deleteMany({
      where: { pageId }
    });
  }

  /**
   * Get context with history
   *
   * Convenience method to load both context and recent history
   */
  static async getContextWithHistory(
    pageId: string,
    historyLimit: number = 10
  ): Promise<{
    context: ConversationContext;
    history: QueryHistoryEntry[];
  }> {
    const [context, history] = await Promise.all([
      this.loadContext(pageId),
      this.getRecentHistory(pageId, historyLimit)
    ]);

    return { context, history };
  }
}
