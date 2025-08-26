import { z } from 'zod';
import type { DatabaseColumn, DatabaseRow } from '~/types/database-block';

// Query intent types
export type QueryIntent = 
  | 'aggregate'
  | 'filter'
  | 'compare'
  | 'trend'
  | 'list'
  | 'count';

// Aggregation types
export type AggregationType = 
  | 'sum'
  | 'count'
  | 'avg'
  | 'min'
  | 'max'
  | 'distinct';

// Date range types
export type DateRangeType =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'custom';

export interface ParsedQuery {
  intent: QueryIntent;
  aggregation?: AggregationType;
  column?: string;
  filters?: QueryFilter[];
  dateRange?: DateRange;
  groupBy?: string[];
  orderBy?: OrderBy;
  limit?: number;
  confidence: number;
  originalQuery: string;
}

export interface QueryFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'between';
  value: any;
}

export interface DateRange {
  type: DateRangeType;
  start?: Date;
  end?: Date;
}

export interface OrderBy {
  column: string;
  direction: 'asc' | 'desc';
}

export interface QueryResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    rowsAffected?: number;
    executionTime?: number;
    source?: {
      table?: string;
      columns?: string[];
    };
    cached?: boolean;
  };
}

/**
 * Natural Language Query Parser
 * Converts user questions into structured database queries
 */
export class QueryParser {
  // Keywords for detecting intent
  private static readonly AGGREGATION_KEYWORDS = {
    sum: ['total', 'sum', 'add up', 'combined', 'altogether'],
    count: ['count', 'how many', 'number of', 'quantity'],
    avg: ['average', 'avg', 'mean', 'typical'],
    min: ['minimum', 'min', 'lowest', 'smallest', 'least'],
    max: ['maximum', 'max', 'highest', 'largest', 'most', 'biggest'],
  };

  private static readonly DATE_KEYWORDS = {
    today: ['today', 'current day'],
    yesterday: ['yesterday'],
    this_week: ['this week', 'current week'],
    last_week: ['last week', 'previous week'],
    this_month: ['this month', 'current month'],
    last_month: ['last month', 'previous month'],
    this_quarter: ['this quarter', 'current quarter', 'q1', 'q2', 'q3', 'q4'],
    last_quarter: ['last quarter', 'previous quarter'],
    this_year: ['this year', 'current year', new Date().getFullYear().toString()],
    last_year: ['last year', 'previous year', (new Date().getFullYear() - 1).toString()],
  };

  private static readonly FILTER_KEYWORDS = {
    eq: ['is', 'equals', '=', 'equal to'],
    neq: ['is not', 'not equal', '!=', '<>'],
    gt: ['greater than', 'more than', '>', 'above', 'over'],
    gte: ['at least', '>=', 'greater than or equal'],
    lt: ['less than', 'under', '<', 'below'],
    lte: ['at most', '<=', 'less than or equal'],
    contains: ['contains', 'includes', 'has', 'with'],
    in: ['in', 'one of', 'among'],
  };

  /**
   * Parse natural language query into structured format
   */
  static parse(query: string, columns: DatabaseColumn[]): ParsedQuery {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Detect intent
    const intent = this.detectIntent(normalizedQuery);
    
    // Extract components based on intent
    const aggregation = this.detectAggregation(normalizedQuery);
    const targetColumn = this.detectTargetColumn(normalizedQuery, columns);
    const filters = this.extractFilters(normalizedQuery, columns);
    const dateRange = this.extractDateRange(normalizedQuery);
    const groupBy = this.extractGroupBy(normalizedQuery, columns);
    const orderBy = this.extractOrderBy(normalizedQuery, columns);
    const limit = this.extractLimit(normalizedQuery);
    
    // Calculate confidence based on how well we understood the query
    const confidence = this.calculateConfidence({
      intent,
      aggregation,
      targetColumn,
      filters,
      dateRange,
    });

    return {
      intent,
      aggregation,
      column: targetColumn,
      filters,
      dateRange,
      groupBy,
      orderBy,
      limit,
      confidence,
      originalQuery: query,
    };
  }

  /**
   * Detect the primary intent of the query
   */
  private static detectIntent(query: string): QueryIntent {
    if (this.hasAggregationKeywords(query)) {
      return 'aggregate';
    }
    if (query.includes('how many') || query.includes('count')) {
      return 'count';
    }
    if (query.includes('compare') || query.includes('vs') || query.includes('versus')) {
      return 'compare';
    }
    if (query.includes('trend') || query.includes('over time') || query.includes('growth')) {
      return 'trend';
    }
    if (query.includes('list') || query.includes('show') || query.includes('display')) {
      return 'list';
    }
    
    return 'filter';
  }

  /**
   * Check if query contains aggregation keywords
   */
  private static hasAggregationKeywords(query: string): boolean {
    for (const keywords of Object.values(this.AGGREGATION_KEYWORDS)) {
      if (keywords.some(k => query.includes(k))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Detect aggregation type from query
   */
  private static detectAggregation(query: string): AggregationType | undefined {
    for (const [type, keywords] of Object.entries(this.AGGREGATION_KEYWORDS)) {
      if (keywords.some(k => query.includes(k))) {
        return type as AggregationType;
      }
    }
    
    // Check for distinct
    if (query.includes('unique') || query.includes('distinct')) {
      return 'distinct';
    }
    
    return undefined;
  }

  /**
   * Detect target column from query
   */
  private static detectTargetColumn(query: string, columns: DatabaseColumn[]): string | undefined {
    // Look for column names in the query
    for (const column of columns) {
      const columnName = column.name.toLowerCase();
      const columnWords = columnName.split(/[\s_-]+/);
      
      // Check if column name or its parts appear in query
      if (query.includes(columnName) || 
          columnWords.some(word => word.length > 2 && query.includes(word))) {
        // For numeric operations, prefer numeric columns
        if (this.hasAggregationKeywords(query) && 
            ['number', 'currency', 'percent'].includes(column.type)) {
          return column.id;
        }
        return column.id;
      }
    }
    
    // Fallback: for aggregations, find first numeric column
    if (this.hasAggregationKeywords(query)) {
      const numericColumn = columns.find(col => 
        ['number', 'currency', 'percent'].includes(col.type)
      );
      if (numericColumn) {
        return numericColumn.id;
      }
    }
    
    return undefined;
  }

  /**
   * Extract filters from query
   */
  private static extractFilters(query: string, columns: DatabaseColumn[]): QueryFilter[] {
    const filters: QueryFilter[] = [];
    
    // Look for filter patterns
    for (const column of columns) {
      const columnName = column.name.toLowerCase();
      
      // Check for filter conditions related to this column
      for (const [operator, keywords] of Object.entries(this.FILTER_KEYWORDS)) {
        for (const keyword of keywords) {
          const pattern = new RegExp(`${columnName}\\s+${keyword}\\s+([\\w\\s]+)`);
          const match = query.match(pattern);
          
          if (match) {
            let value: any = match[1].trim();
            
            // Convert value based on column type
            if (column.type === 'number' || column.type === 'currency' || column.type === 'percent') {
              value = parseFloat(value.replace(/[^0-9.-]/g, ''));
            } else if (column.type === 'checkbox') {
              value = ['true', 'yes', '1'].includes(value.toLowerCase());
            }
            
            filters.push({
              column: column.id,
              operator: operator as QueryFilter['operator'],
              value,
            });
          }
        }
      }
    }
    
    return filters;
  }

  /**
   * Extract date range from query
   */
  private static extractDateRange(query: string): DateRange | undefined {
    for (const [type, keywords] of Object.entries(this.DATE_KEYWORDS)) {
      if (keywords.some(k => query.includes(k))) {
        const range = this.calculateDateRange(type as DateRangeType);
        return range;
      }
    }
    
    // Look for specific date patterns (MM/DD/YYYY, YYYY-MM-DD, etc.)
    const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g;
    const dates = query.match(datePattern);
    
    if (dates && dates.length > 0) {
      const parsedDates = dates.map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
      if (parsedDates.length > 0) {
        return {
          type: 'custom',
          start: parsedDates[0],
          end: parsedDates[parsedDates.length - 1] || parsedDates[0],
        };
      }
    }
    
    return undefined;
  }

  /**
   * Calculate actual date range from type
   */
  private static calculateDateRange(type: DateRangeType): DateRange {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (type) {
      case 'today':
        return { type, start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
      
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { type, start: yesterday, end: today };
      
      case 'this_week':
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        return { type, start: weekStart, end: new Date() };
      
      case 'last_week':
        const lastWeekEnd = new Date(today);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - lastWeekEnd.getDay());
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        return { type, start: lastWeekStart, end: lastWeekEnd };
      
      case 'this_month':
        return { 
          type, 
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: new Date()
        };
      
      case 'last_month':
        return {
          type,
          start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          end: new Date(now.getFullYear(), now.getMonth(), 0)
        };
      
      case 'this_quarter':
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        return {
          type,
          start: new Date(now.getFullYear(), quarterMonth, 1),
          end: new Date()
        };
      
      case 'last_quarter':
        const lastQuarterMonth = Math.floor(now.getMonth() / 3) * 3 - 3;
        return {
          type,
          start: new Date(now.getFullYear(), lastQuarterMonth, 1),
          end: new Date(now.getFullYear(), lastQuarterMonth + 3, 0)
        };
      
      case 'this_year':
        return {
          type,
          start: new Date(now.getFullYear(), 0, 1),
          end: new Date()
        };
      
      case 'last_year':
        return {
          type,
          start: new Date(now.getFullYear() - 1, 0, 1),
          end: new Date(now.getFullYear() - 1, 11, 31)
        };
      
      default:
        return { type: 'custom' };
    }
  }

  /**
   * Extract GROUP BY columns
   */
  private static extractGroupBy(query: string, columns: DatabaseColumn[]): string[] | undefined {
    if (!query.includes('by') && !query.includes('per') && !query.includes('each')) {
      return undefined;
    }
    
    const groupByColumns: string[] = [];
    
    // Look for patterns like "by category", "per month", "for each department"
    for (const column of columns) {
      const columnName = column.name.toLowerCase();
      const patterns = [
        new RegExp(`by\\s+${columnName}`),
        new RegExp(`per\\s+${columnName}`),
        new RegExp(`for\\s+each\\s+${columnName}`),
        new RegExp(`group\\s+by\\s+${columnName}`),
      ];
      
      if (patterns.some(p => p.test(query))) {
        groupByColumns.push(column.id);
      }
    }
    
    return groupByColumns.length > 0 ? groupByColumns : undefined;
  }

  /**
   * Extract ORDER BY clause
   */
  private static extractOrderBy(query: string, columns: DatabaseColumn[]): OrderBy | undefined {
    const orderKeywords = {
      asc: ['ascending', 'asc', 'lowest first', 'smallest first', 'earliest'],
      desc: ['descending', 'desc', 'highest first', 'largest first', 'latest', 'newest'],
    };
    
    for (const column of columns) {
      const columnName = column.name.toLowerCase();
      
      for (const [direction, keywords] of Object.entries(orderKeywords)) {
        if (keywords.some(k => query.includes(k))) {
          // Check if this column is mentioned near the order keyword
          if (query.includes(columnName)) {
            return {
              column: column.id,
              direction: direction as 'asc' | 'desc',
            };
          }
        }
      }
    }
    
    // Default ordering for aggregations
    if (query.includes('top') || query.includes('highest')) {
      return { column: '', direction: 'desc' };
    }
    if (query.includes('bottom') || query.includes('lowest')) {
      return { column: '', direction: 'asc' };
    }
    
    return undefined;
  }

  /**
   * Extract LIMIT clause
   */
  private static extractLimit(query: string): number | undefined {
    // Look for patterns like "top 10", "first 5", "limit 20"
    const patterns = [
      /top\s+(\d+)/,
      /first\s+(\d+)/,
      /last\s+(\d+)/,
      /limit\s+(\d+)/,
    ];
    
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    
    return undefined;
  }

  /**
   * Calculate confidence score
   */
  private static calculateConfidence(components: Partial<ParsedQuery>): number {
    let score = 0;
    let factors = 0;
    
    if (components.intent) {
      score += 20;
      factors++;
    }
    
    if (components.aggregation) {
      score += 20;
      factors++;
    }
    
    if (components.targetColumn) {
      score += 25;
      factors++;
    }
    
    if (components.filters && components.filters.length > 0) {
      score += 15;
      factors++;
    }
    
    if (components.dateRange) {
      score += 20;
      factors++;
    }
    
    // If we have at least intent and one other component, boost confidence
    if (factors >= 2) {
      score += 10;
    }
    
    return Math.min(score, 100);
  }
}