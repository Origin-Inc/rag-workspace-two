import type { DataFile } from '~/atoms/chat-atoms';
import type { QueryIntent } from './query-intent-analyzer.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('conversation-context');

export interface ConversationContext {
  sessionId: string;
  userId: string;
  workspaceId?: string;
  pageId?: string;
  
  // Active context
  activeFiles: DataFile[];
  currentIntent?: QueryIntent;
  lastQuery?: string;
  lastResponseTime?: number;
  
  // Conversation history
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: {
      intent?: QueryIntent;
      filesUsed?: string[];
      responseType?: 'data-query' | 'general-chat' | 'hybrid';
      tokens?: number;
    };
  }>;
  
  // Session metadata
  createdAt: Date;
  updatedAt: Date;
  tokenCount: number;
  queryCount: number;
  
  // Performance tracking
  averageResponseTime: number;
  lastError?: string;
}

export class ConversationContextManager {
  private static contexts = new Map<string, ConversationContext>();
  private static readonly MAX_CONTEXT_SIZE = 10; // Max messages to keep
  private static readonly CONTEXT_TTL = 30 * 60 * 1000; // 30 minutes
  
  /**
   * Get or create a conversation context
   */
  static getContext(
    sessionId: string,
    userId: string,
    workspaceId?: string,
    pageId?: string
  ): ConversationContext {
    const contextKey = this.generateContextKey(sessionId, userId);
    
    let context = this.contexts.get(contextKey);
    
    if (!context) {
      context = this.createNewContext(sessionId, userId, workspaceId, pageId);
      this.contexts.set(contextKey, context);
      logger.trace('Created new context', { contextKey, userId, workspaceId });
    } else {
      // Update workspace/page if changed
      if (workspaceId) context.workspaceId = workspaceId;
      if (pageId) context.pageId = pageId;
      context.updatedAt = new Date();
    }
    
    // Clean up old contexts periodically
    this.cleanupOldContexts();
    
    return context;
  }
  
  /**
   * Update context with new query
   */
  static updateWithQuery(
    context: ConversationContext,
    query: string,
    intent: QueryIntent,
    files: DataFile[] = []
  ): void {
    context.lastQuery = query;
    context.currentIntent = intent;
    context.activeFiles = files;
    context.queryCount++;
    context.updatedAt = new Date();
    
    // Add user message to history
    context.messages.push({
      role: 'user',
      content: query,
      timestamp: new Date(),
      metadata: {
        intent,
        filesUsed: files.map(f => f.filename).filter(Boolean) as string[]
      }
    });
    
    // Trim messages if exceeding limit
    if (context.messages.length > this.MAX_CONTEXT_SIZE * 2) {
      // Keep system messages and recent messages
      const systemMessages = context.messages.filter(m => m.role === 'system');
      const recentMessages = context.messages.slice(-this.MAX_CONTEXT_SIZE);
      context.messages = [...systemMessages, ...recentMessages];
    }
    
    logger.trace('Updated context with query', {
      sessionId: context.sessionId,
      queryCount: context.queryCount,
      messageCount: context.messages.length,
      intent: intent.queryType
    });
  }
  
  /**
   * Update context with response
   */
  static updateWithResponse(
    context: ConversationContext,
    response: string,
    responseType: 'data-query' | 'general-chat' | 'hybrid',
    responseTime: number,
    tokens?: number
  ): void {
    context.lastResponseTime = responseTime;
    context.updatedAt = new Date();
    
    // Update average response time
    const totalTime = context.averageResponseTime * (context.queryCount - 1) + responseTime;
    context.averageResponseTime = totalTime / context.queryCount;
    
    // Add assistant message to history
    context.messages.push({
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      metadata: {
        responseType,
        tokens,
        intent: context.currentIntent
      }
    });
    
    // Update token count
    if (tokens) {
      context.tokenCount += tokens;
    }
    
    logger.trace('Updated context with response', {
      sessionId: context.sessionId,
      responseType,
      responseTime,
      averageResponseTime: context.averageResponseTime,
      totalTokens: context.tokenCount
    });
  }
  
  /**
   * Get conversation history formatted for AI
   */
  static getFormattedHistory(
    context: ConversationContext,
    maxMessages: number = 10
  ): Array<{ role: string; content: string }> {
    // Get recent messages, prioritizing user-assistant pairs
    const recentMessages = context.messages.slice(-maxMessages);
    
    return recentMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }
  
  /**
   * Determine if context suggests data query intent
   */
  static suggestsDataQuery(context: ConversationContext): boolean {
    // Check if files are actively loaded
    if (context.activeFiles.length === 0) {
      return false;
    }
    
    // Check recent messages for data query patterns
    const recentMessages = context.messages.slice(-3);
    const dataQueryCount = recentMessages.filter(
      msg => msg.metadata?.responseType === 'data-query'
    ).length;
    
    // If majority of recent queries were data queries, suggest data query
    return dataQueryCount >= 2;
  }
  
  /**
   * Get relevant files based on context
   */
  static getRelevantFiles(
    context: ConversationContext,
    query: string
  ): DataFile[] {
    if (context.activeFiles.length === 0) {
      return [];
    }
    
    const queryLower = query.toLowerCase();
    
    // Filter files mentioned in query or recently used
    const relevantFiles = context.activeFiles.filter(file => {
      const filename = file.filename?.toLowerCase() || '';
      const tableName = file.tableName?.toLowerCase() || '';
      
      // Check if file is mentioned in query
      if (filename && queryLower.includes(filename.replace(/\.[^/.]+$/, ''))) {
        return true;
      }
      if (tableName && queryLower.includes(tableName)) {
        return true;
      }
      
      // Check if file was recently used
      const recentFileUsage = context.messages
        .slice(-3)
        .some(msg => msg.metadata?.filesUsed?.includes(file.filename || ''));
      
      return recentFileUsage;
    });
    
    // If no specific files found, return all active files
    return relevantFiles.length > 0 ? relevantFiles : context.activeFiles;
  }
  
  /**
   * Clear context for a session
   */
  static clearContext(sessionId: string, userId: string): void {
    const contextKey = this.generateContextKey(sessionId, userId);
    this.contexts.delete(contextKey);
    logger.trace('Cleared context', { contextKey });
  }
  
  /**
   * Generate a unique context key
   */
  private static generateContextKey(sessionId: string, userId: string): string {
    return `${userId}:${sessionId}`;
  }
  
  /**
   * Create a new context instance
   */
  private static createNewContext(
    sessionId: string,
    userId: string,
    workspaceId?: string,
    pageId?: string
  ): ConversationContext {
    return {
      sessionId,
      userId,
      workspaceId,
      pageId,
      activeFiles: [],
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      tokenCount: 0,
      queryCount: 0,
      averageResponseTime: 0
    };
  }
  
  /**
   * Clean up old contexts to prevent memory leaks
   */
  private static cleanupOldContexts(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.contexts.forEach((context, key) => {
      const age = now - context.updatedAt.getTime();
      if (age > this.CONTEXT_TTL) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.contexts.delete(key);
      logger.trace('Cleaned up old context', { key });
    });
  }
  
  /**
   * Get analytics for a context
   */
  static getAnalytics(context: ConversationContext): {
    totalQueries: number;
    totalTokens: number;
    averageResponseTime: number;
    sessionDuration: number;
    queryTypes: Record<string, number>;
    responseTypes: Record<string, number>;
  } {
    const queryTypes: Record<string, number> = {};
    const responseTypes: Record<string, number> = {};
    
    context.messages.forEach(msg => {
      if (msg.metadata?.intent?.queryType) {
        queryTypes[msg.metadata.intent.queryType] = 
          (queryTypes[msg.metadata.intent.queryType] || 0) + 1;
      }
      if (msg.metadata?.responseType) {
        responseTypes[msg.metadata.responseType] = 
          (responseTypes[msg.metadata.responseType] || 0) + 1;
      }
    });
    
    return {
      totalQueries: context.queryCount,
      totalTokens: context.tokenCount,
      averageResponseTime: context.averageResponseTime,
      sessionDuration: Date.now() - context.createdAt.getTime(),
      queryTypes,
      responseTypes
    };
  }
}