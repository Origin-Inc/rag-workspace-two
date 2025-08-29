import { createSupabaseAdmin } from '~/utils/supabase.server';
import { DebugLogger } from '~/utils/debug-logger';
import type { IntentClassification, Entity } from './intent-classifier.server';
import { z } from 'zod';

// Context types
export interface QueryContext {
  workspace: WorkspaceContext;
  databases: DatabaseContext[];
  pages: PageContext[];
  user: UserContext;
  sessionHistory: SessionContext[];
  extractedEntities: ExtractedEntity[];
}

export interface WorkspaceContext {
  id: string;
  name: string;
  memberCount: number;
  recentActivity: string[];
}

export interface DatabaseContext {
  id: string;
  name: string;
  columnCount: number;
  rowCount: number;
  columns: Array<{
    name: string;
    type: string;
    isFormula?: boolean;
  }>;
  recentlyAccessed: boolean;
  relevanceScore: number;
}

export interface PageContext {
  id: string;
  title: string;
  lastModified: Date;
  blockCount: number;
  hasDatabase: boolean;
  relevanceScore: number;
}

export interface UserContext {
  id: string;
  email: string;
  role: string;
  recentDatabases: string[];
  recentPages: string[];
  preferences: Record<string, any>;
}

export interface SessionContext {
  query: string;
  intent: string;
  timestamp: Date;
  successful: boolean;
}

export interface ExtractedEntity {
  type: string;
  value: string;
  matchedResourceId?: string;
  matchedResourceType?: string;
  confidence: number;
}

export class ContextExtractionEngine {
  private supabase = createSupabaseAdmin();
  private logger = new DebugLogger('ContextExtractionEngine');
  
  // Cache for workspace data
  private contextCache = new Map<string, any>();
  private readonly CACHE_TTL = 2 * 60 * 1000; // 2 minutes
  
  /**
   * Extract comprehensive context for a query
   */
  async extractContext(
    query: string,
    classification: IntentClassification,
    workspaceId: string,
    userId: string
  ): Promise<QueryContext> {
    this.logger.info('Extracting context', {
      query,
      intent: classification.intent,
      workspaceId,
      userId
    });
    
    try {
      // Parallel extraction of different context types
      const [
        workspace,
        databases,
        pages,
        user,
        sessionHistory,
        extractedEntities
      ] = await Promise.all([
        this.getWorkspaceContext(workspaceId),
        this.getDatabaseContext(workspaceId, classification),
        this.getPageContext(workspaceId, classification),
        this.getUserContext(userId, workspaceId),
        this.getSessionHistory(userId, workspaceId),
        this.matchEntities(classification.entities, workspaceId)
      ]);
      
      const context: QueryContext = {
        workspace,
        databases,
        pages,
        user,
        sessionHistory,
        extractedEntities
      };
      
      this.logger.info('Context extracted', {
        databaseCount: databases.length,
        pageCount: pages.length,
        entityCount: extractedEntities.length
      });
      
      return context;
    } catch (error) {
      this.logger.error('Failed to extract context', error);
      throw error;
    }
  }
  
  /**
   * Get workspace context
   */
  private async getWorkspaceContext(workspaceId: string): Promise<WorkspaceContext> {
    const cacheKey = `workspace:${workspaceId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const { data: workspace, error } = await this.supabase
      .from('workspaces')
      .select(`
        id,
        name
      `)
      .eq('id', workspaceId)
      .single();
    
    if (error || !workspace) {
      this.logger.error('Failed to get workspace context', error);
      throw new Error('Workspace not found');
    }
    
    // Get recent activity
    const { data: recentActivity } = await this.supabase
      .from('pages')
      .select('title, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(5);
    
    const context: WorkspaceContext = {
      id: workspace.id,
      name: workspace.name,
      memberCount: 1, // Default for now
      recentActivity: recentActivity?.map(p => p.title) || []
    };
    
    this.addToCache(cacheKey, context);
    return context;
  }
  
  /**
   * Get relevant database context based on query
   */
  private async getDatabaseContext(
    workspaceId: string,
    classification: IntentClassification
  ): Promise<DatabaseContext[]> {
    // Extract database references from classification
    const dbReferences = classification.entities
      .filter(e => e.type === 'database')
      .map(e => e.value.toLowerCase());
    
    // Get all databases in workspace - using actual Supabase schema
    const { data: databases, error } = await this.supabase
      .from('db_blocks')
      .select(`
        id,
        block_id,
        name,
        description,
        schema,
        created_at,
        updated_at
      `)
      .limit(10);
    
    if (error) {
      this.logger.error('Failed to get databases', error);
      return [];
    }
    
    // Score and filter databases by relevance
    const scoredDatabases = databases?.map(db => {
      const schema = db.schema as any;
      const data = db.data as any;
      
      // Calculate relevance score
      let relevanceScore = 0;
      
      // Check if database name matches any references
      const dbName = db.name || '';
      if (dbReferences.some(ref => dbName.toLowerCase().includes(ref))) {
        relevanceScore += 10;
      }
      
      // Check column names for matches
      const columns = schema?.columns || [];
      columns.forEach((col: any) => {
        if (classification.entities.some(e => 
          col.name.toLowerCase().includes(e.value.toLowerCase())
        )) {
          relevanceScore += 2;
        }
      });
      
      // Boost recently accessed databases
      const hoursSinceUpdate = 
        (Date.now() - new Date(db.updated_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate < 1) relevanceScore += 5;
      else if (hoursSinceUpdate < 24) relevanceScore += 3;
      else if (hoursSinceUpdate < 168) relevanceScore += 1;
      
      return {
        id: db.id,
        name: db.name || 'Untitled Database',
        columnCount: columns.length,
        rowCount: 0, // Will need separate query for row count
        columns: columns.map((col: any) => ({
          name: col.name,
          type: col.type,
          isFormula: col.type === 'formula'
        })),
        recentlyAccessed: hoursSinceUpdate < 24,
        relevanceScore
      };
    }) || [];
    
    // Sort by relevance and return top results
    return scoredDatabases
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  }
  
  /**
   * Get relevant page context
   */
  private async getPageContext(
    workspaceId: string,
    classification: IntentClassification
  ): Promise<PageContext[]> {
    // Extract page references
    const pageReferences = classification.entities
      .filter(e => e.type === 'page' || e.type === 'project')
      .map(e => e.value.toLowerCase());
    
    // Get pages with content - simplified query
    const { data: pages, error } = await this.supabase
      .from('pages')
      .select(`
        id,
        title,
        updated_at
      `)
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(20);
    
    if (error) {
      this.logger.error('Failed to get pages', error);
      return [];
    }
    
    // Score pages by relevance
    const scoredPages = pages?.map(page => {
      let relevanceScore = 0;
      
      // Check title matches
      const title = page.title.toLowerCase();
      if (pageReferences.some(ref => title.includes(ref))) {
        relevanceScore += 10;
      }
      
      // Check for entity matches in title
      classification.entities.forEach(entity => {
        if (title.includes(entity.value.toLowerCase())) {
          relevanceScore += 3;
        }
      });
      
      // Recent pages get a boost
      const hoursSinceUpdate = 
        (Date.now() - new Date(page.updated_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate < 24) relevanceScore += 2;
      
      return {
        id: page.id,
        title: page.title,
        lastModified: new Date(page.updated_at),
        blockCount: 0, // Simplified for now
        hasDatabase: false, // Will need separate query
        relevanceScore
      };
    }) || [];
    
    return scoredPages
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  }
  
  /**
   * Get user context and preferences
   */
  private async getUserContext(userId: string, workspaceId: string): Promise<UserContext> {
    // Simplified user context - actual tables use different structure
    const { data: user, error } = await this.supabase
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .single();
    
    if (error || !user) {
      this.logger.error('Failed to get user context', error);
      return {
        id: userId,
        email: 'unknown',
        role: 'member',
        recentDatabases: [],
        recentPages: [],
        preferences: {}
      };
    }
    
    // Get user's recent activity
    const { data: recentPages } = await this.supabase
      .from('pages')
      .select('id, title')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(5);
    
    return {
      id: userId,
      email: user?.email || 'unknown',
      role: 'member', // Default role
      recentDatabases: [], // TODO: Track user's recent database access
      recentPages: recentPages?.map(p => p.id) || [],
      preferences: {} // TODO: Store user preferences
    };
  }
  
  /**
   * Get session history for context
   */
  private async getSessionHistory(
    userId: string,
    workspaceId: string
  ): Promise<SessionContext[]> {
    // TODO: Implement session tracking
    // For now, return empty array
    return [];
  }
  
  /**
   * Match extracted entities to actual resources
   */
  private async matchEntities(
    entities: Entity[],
    workspaceId: string
  ): Promise<ExtractedEntity[]> {
    const matched: ExtractedEntity[] = [];
    
    for (const entity of entities) {
      let matchedEntity: ExtractedEntity = {
        type: entity.type,
        value: entity.value,
        confidence: entity.confidence
      };
      
      // Try to match entity to actual resources
      if (entity.type === 'database') {
        const { data } = await this.supabase
          .from('database_blocks')
          .select('id, schema')
          .eq('pages.workspace_id', workspaceId)
          .ilike('schema->>name', `%${entity.value}%`)
          .limit(1)
          .single();
        
        if (data) {
          matchedEntity.matchedResourceId = data.id;
          matchedEntity.matchedResourceType = 'database';
          matchedEntity.confidence = 1.0;
        }
      } else if (entity.type === 'page' || entity.type === 'project') {
        const { data } = await this.supabase
          .from('pages')
          .select('id, title')
          .eq('workspace_id', workspaceId)
          .ilike('title', `%${entity.value}%`)
          .limit(1)
          .single();
        
        if (data) {
          matchedEntity.matchedResourceId = data.id;
          matchedEntity.matchedResourceType = 'page';
          matchedEntity.confidence = 1.0;
        }
      }
      
      matched.push(matchedEntity);
    }
    
    return matched;
  }
  
  /**
   * Enrich context with additional metadata
   */
  async enrichContext(
    context: QueryContext,
    classification: IntentClassification
  ): Promise<QueryContext> {
    // Add computed fields based on intent
    if (classification.intent === 'analytics') {
      // Find databases with numeric columns for analytics
      context.databases = context.databases.filter(db =>
        db.columns.some(col => 
          ['number', 'currency', 'percent', 'rating'].includes(col.type)
        )
      );
    }
    
    if (classification.intent === 'data_query') {
      // Prioritize databases with matching column names
      const queryTerms = classification.entities.map(e => e.value.toLowerCase());
      context.databases.forEach(db => {
        const matchingColumns = db.columns.filter(col =>
          queryTerms.some(term => col.name.toLowerCase().includes(term))
        );
        if (matchingColumns.length > 0) {
          db.relevanceScore += matchingColumns.length * 5;
        }
      });
      
      // Re-sort by updated relevance
      context.databases.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
    
    return context;
  }
  
  // Cache management
  private getFromCache(key: string): any {
    return this.contextCache.get(key);
  }
  
  private addToCache(key: string, value: any): void {
    this.contextCache.set(key, value);
    setTimeout(() => {
      this.contextCache.delete(key);
    }, this.CACHE_TTL);
  }
}