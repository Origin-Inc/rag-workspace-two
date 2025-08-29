import { openai } from '../openai.server';
import { DebugLogger } from '~/utils/debug-logger';
import { z } from 'zod';

// Intent type definitions
export enum QueryIntent {
  DATA_QUERY = 'data_query',           // Queries about database data
  CONTENT_SEARCH = 'content_search',   // Searching through documents/pages
  ANALYTICS = 'analytics',             // Analytics and visualizations
  SUMMARY = 'summary',                 // Summaries of data or content
  ACTION = 'action',                   // Actions like create, update, delete
  NAVIGATION = 'navigation',           // Navigation queries
  HELP = 'help',                       // Help and documentation
  AMBIGUOUS = 'ambiguous'              // Cannot determine clear intent
}

// Response format types
export enum ResponseFormat {
  TEXT = 'text',
  TABLE = 'table',
  CHART = 'chart',
  LIST = 'list',
  MIXED = 'mixed',
  ACTION_CONFIRMATION = 'action_confirmation'
}

// Entity extraction schema
const EntitySchema = z.object({
  type: z.enum(['database', 'page', 'project', 'workspace', 'date_range', 'metric', 'entity']),
  value: z.string(),
  confidence: z.number().min(0).max(1)
});

// Intent classification result schema
const IntentClassificationSchema = z.object({
  intent: z.nativeEnum(QueryIntent),
  confidence: z.number().min(0).max(1),
  suggestedFormat: z.nativeEnum(ResponseFormat),
  entities: z.array(EntitySchema),
  timeRange: z.object({
    start: z.string().nullable().optional(),
    end: z.string().nullable().optional(),
    relative: z.string().nullable().optional() // e.g., "last month", "this year"
  }).nullable().optional(),
  aggregations: z.array(z.string()).optional(), // e.g., ["sum", "average", "count"]
  filters: z.record(z.any()).optional(),
  explanation: z.string()
});

export type IntentClassification = z.infer<typeof IntentClassificationSchema>;
export type Entity = z.infer<typeof EntitySchema>;

export class IntentClassificationService {
  private logger = new DebugLogger('IntentClassificationService');
  
  // Cache for recent classifications to improve performance
  private classificationCache = new Map<string, IntentClassification>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Classify user query intent using OpenAI with structured outputs
   */
  async classifyIntent(query: string, context?: {
    workspaceId?: string;
    currentPage?: string;
    recentActions?: string[];
  }): Promise<IntentClassification> {
    this.logger.info('Classifying intent', { query, context });
    
    // Check cache first
    const cacheKey = this.getCacheKey(query, context);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.logger.debug('Returning cached classification');
      return cached;
    }
    
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(query, context);
      
      const completion = await openai!.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1000
      });
      
      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }
      
      const parsed = JSON.parse(response);
      const classification = IntentClassificationSchema.parse(parsed);
      
      // Cache the result
      this.addToCache(cacheKey, classification);
      
      this.logger.info('Intent classified', {
        intent: classification.intent,
        confidence: classification.confidence,
        entitiesCount: classification.entities.length
      });
      
      return classification;
    } catch (error) {
      this.logger.error('Failed to classify intent', error);
      
      // Fallback classification
      return {
        intent: QueryIntent.AMBIGUOUS,
        confidence: 0,
        suggestedFormat: ResponseFormat.TEXT,
        entities: [],
        explanation: 'Failed to classify intent, using fallback'
      };
    }
  }
  
  /**
   * Build system prompt for intent classification
   */
  private buildSystemPrompt(): string {
    return `You are an intent classification system for a Notion-like workspace application.
    
Analyze user queries and classify them into one of these intents:
- data_query: Queries about data in databases (e.g., "show my tasks", "how many items are pending")
- content_search: Searching for content in documents/pages (e.g., "find documentation about auth")
- analytics: Requests for analytics or visualizations (e.g., "revenue by month", "task completion trends")
- summary: Requests for summaries (e.g., "summarize this page", "what's the status of project X")
- action: Actions to perform (e.g., "create a new task", "update the status")
- navigation: Navigation requests (e.g., "go to settings", "open project dashboard")
- help: Help and documentation requests (e.g., "how do I create a database")
- ambiguous: Cannot determine clear intent

Also determine the best response format:
- text: Plain text response
- table: Tabular data display
- chart: Visual chart/graph
- list: Bulleted or numbered list
- mixed: Combination of formats
- action_confirmation: Confirmation for an action

Extract entities from the query:
- database: References to databases
- page: References to pages
- project: References to projects
- workspace: References to workspaces
- date_range: Time periods mentioned
- metric: Metrics or measurements
- entity: Other named entities

Return a JSON object with:
{
  "intent": "the classified intent",
  "confidence": 0.0-1.0,
  "suggestedFormat": "the best response format",
  "entities": [
    {
      "type": "entity type",
      "value": "extracted value",
      "confidence": 0.0-1.0
    }
  ],
  "timeRange": {
    "start": "ISO date string or null",
    "end": "ISO date string or null",
    "relative": "relative time description or null"
  },
  "aggregations": ["sum", "average", etc.],
  "filters": { "key": "value" },
  "explanation": "Brief explanation of the classification"
}`;
  }
  
  /**
   * Build user prompt with query and context
   */
  private buildUserPrompt(query: string, context?: any): string {
    let prompt = `Query: "${query}"`;
    
    if (context) {
      if (context.currentPage) {
        prompt += `\nCurrent page: ${context.currentPage}`;
      }
      if (context.recentActions?.length) {
        prompt += `\nRecent actions: ${context.recentActions.join(', ')}`;
      }
    }
    
    prompt += '\n\nClassify this query and extract relevant information.';
    return prompt;
  }
  
  /**
   * Determine if query requires real-time data
   */
  isRealTimeQuery(classification: IntentClassification): boolean {
    // Data queries and analytics typically need real-time data
    if (classification.intent === QueryIntent.DATA_QUERY || 
        classification.intent === QueryIntent.ANALYTICS) {
      return true;
    }
    
    // Check for time-sensitive entities
    const hasCurrentTimeRef = classification.entities.some(e => 
      e.type === 'date_range' && 
      (e.value.includes('today') || e.value.includes('current') || e.value.includes('now'))
    );
    
    return hasCurrentTimeRef;
  }
  
  /**
   * Determine if query can be cached
   */
  isCacheable(classification: IntentClassification): boolean {
    // Don't cache real-time queries
    if (this.isRealTimeQuery(classification)) {
      return false;
    }
    
    // Don't cache action queries
    if (classification.intent === QueryIntent.ACTION) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Extract database references from classification
   */
  extractDatabaseReferences(classification: IntentClassification): string[] {
    return classification.entities
      .filter(e => e.type === 'database')
      .map(e => e.value);
  }
  
  /**
   * Extract time range for queries
   */
  extractTimeRange(classification: IntentClassification): {
    start: Date | null;
    end: Date | null;
  } {
    if (!classification.timeRange) {
      return { start: null, end: null };
    }
    
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    
    // Handle relative time ranges
    if (classification.timeRange.relative) {
      const relative = classification.timeRange.relative.toLowerCase();
      
      if (relative.includes('last month')) {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
      } else if (relative.includes('this month')) {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = now;
      } else if (relative.includes('last week')) {
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = now;
      } else if (relative.includes('today')) {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = now;
      } else if (relative.includes('yesterday')) {
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
        end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
      }
    }
    
    // Handle absolute dates if provided
    if (classification.timeRange.start) {
      start = new Date(classification.timeRange.start);
    }
    if (classification.timeRange.end) {
      end = new Date(classification.timeRange.end);
    }
    
    return { start, end };
  }
  
  // Cache management methods
  private getCacheKey(query: string, context?: any): string {
    return `${query}:${JSON.stringify(context || {})}`;
  }
  
  private getFromCache(key: string): IntentClassification | null {
    const cached = this.classificationCache.get(key);
    if (cached) {
      return cached;
    }
    return null;
  }
  
  private addToCache(key: string, classification: IntentClassification): void {
    this.classificationCache.set(key, classification);
    
    // Clean up old cache entries
    setTimeout(() => {
      this.classificationCache.delete(key);
    }, this.CACHE_TTL);
  }
}