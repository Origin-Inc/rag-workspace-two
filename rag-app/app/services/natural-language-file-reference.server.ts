import { z } from 'zod';
import type { DataFile } from '~/atoms/chat-atoms';

export interface FileReference {
  fileId: string;
  filename: string;
  tableName: string;
  confidence: number;
  matchedTokens: string[];
}

export class NaturalLanguageFileReferenceParser {
  private static readonly FILE_INDICATORS = [
    'file', 'table', 'data', 'dataset', 'csv', 'excel', 'spreadsheet',
    'from', 'in', 'using', 'analyze', 'show', 'query', 'select'
  ];
  
  private static readonly EXCLUSION_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'with', 'for', 'to', 'of',
    'me', 'all', 'some', 'any', 'what', 'where', 'when', 'how'
  ]);

  /**
   * Parses a natural language query to identify file references
   */
  static parseFileReferences(
    query: string,
    availableFiles: Array<{ id: string; filename: string; tableName: string }>
  ): FileReference[] {
    const normalizedQuery = query.toLowerCase();
    const references: FileReference[] = [];
    
    for (const file of availableFiles) {
      const confidence = this.calculateFileMatchConfidence(
        normalizedQuery,
        file.filename,
        file.tableName
      );
      
      if (confidence > 0.3) {
        references.push({
          fileId: file.id,
          filename: file.filename,
          tableName: file.tableName,
          confidence,
          matchedTokens: this.getMatchedTokens(normalizedQuery, file.filename, file.tableName)
        });
      }
    }
    
    // Sort by confidence descending
    return references.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate confidence score for a file match
   */
  private static calculateFileMatchConfidence(
    query: string,
    filename: string,
    tableName: string
  ): number {
    let score = 0;
    const queryTokens = this.tokenize(query);
    const filenameTokens = this.tokenize(filename);
    const tableTokens = this.tokenize(tableName);
    
    // Direct filename match (without extension)
    const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '').toLowerCase();
    if (query.includes(filenameWithoutExt)) {
      score += 0.8;
    }
    
    // Direct table name match
    if (query.includes(tableName.toLowerCase())) {
      score += 0.7;
    }
    
    // Token-based matching
    for (const queryToken of queryTokens) {
      if (this.EXCLUSION_WORDS.has(queryToken)) continue;
      
      // Check filename tokens
      for (const fileToken of filenameTokens) {
        if (queryToken === fileToken) {
          score += 0.3;
        } else if (queryToken.includes(fileToken) || fileToken.includes(queryToken)) {
          score += 0.15;
        }
      }
      
      // Check table name tokens
      for (const tableToken of tableTokens) {
        if (queryToken === tableToken) {
          score += 0.25;
        } else if (queryToken.includes(tableToken) || tableToken.includes(queryToken)) {
          score += 0.1;
        }
      }
    }
    
    // Check for file indicators in proximity
    const hasFileIndicator = this.FILE_INDICATORS.some(indicator => 
      query.includes(indicator)
    );
    if (hasFileIndicator) {
      score += 0.1;
    }
    
    // Normalize score to 0-1 range
    return Math.min(1, score);
  }

  /**
   * Tokenize a string into meaningful parts
   */
  private static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0 && !this.EXCLUSION_WORDS.has(token));
  }

  /**
   * Get the tokens that matched between query and file
   */
  private static getMatchedTokens(
    query: string,
    filename: string,
    tableName: string
  ): string[] {
    const queryTokens = new Set(this.tokenize(query));
    const fileTokens = this.tokenize(filename + ' ' + tableName);
    
    return fileTokens.filter(token => queryTokens.has(token));
  }

  /**
   * Enhanced query rewriting to include file context
   */
  static rewriteQueryWithFileContext(
    query: string,
    fileReferences: FileReference[]
  ): string {
    if (fileReferences.length === 0) return query;
    
    // Get the most confident reference
    const primaryFile = fileReferences[0];
    
    // Check if query already mentions the table
    if (query.toLowerCase().includes(primaryFile.tableName.toLowerCase())) {
      return query;
    }
    
    // Rewrite common patterns
    const patterns = [
      { 
        match: /show\s+(?:me\s+)?(?:the\s+)?data/i,
        replace: `SELECT * FROM ${primaryFile.tableName}`
      },
      {
        match: /how\s+many\s+(\w+)/i,
        replace: (match: string, entity: string) => 
          `SELECT COUNT(*) as count FROM ${primaryFile.tableName}`
      },
      {
        match: /average\s+(?:of\s+)?(\w+)/i,
        replace: (match: string, column: string) => 
          `SELECT AVG(${column}) as average FROM ${primaryFile.tableName}`
      },
      {
        match: /sum\s+(?:of\s+)?(\w+)/i,
        replace: (match: string, column: string) => 
          `SELECT SUM(${column}) as total FROM ${primaryFile.tableName}`
      },
      {
        match: /group\s+by\s+(\w+)/i,
        replace: (match: string, column: string) => 
          `SELECT ${column}, COUNT(*) FROM ${primaryFile.tableName} GROUP BY ${column}`
      }
    ];
    
    // Apply pattern replacements
    for (const pattern of patterns) {
      if (pattern.match.test(query)) {
        return query.replace(pattern.match, pattern.replace as any);
      }
    }
    
    // Default: Add table context as a hint
    return `${query} (using table: ${primaryFile.tableName})`;
  }

  /**
   * Extract column references from a query
   */
  static extractColumnReferences(
    query: string,
    schema: Array<{ name: string; type: string }>
  ): string[] {
    const normalizedQuery = query.toLowerCase();
    const columnNames: string[] = [];
    
    for (const column of schema) {
      const columnNameLower = column.name.toLowerCase();
      
      // Check for exact matches
      if (normalizedQuery.includes(columnNameLower)) {
        columnNames.push(column.name);
        continue;
      }
      
      // Check for partial matches (e.g., "customer" matches "customer_id")
      const tokens = this.tokenize(normalizedQuery);
      for (const token of tokens) {
        if (columnNameLower.includes(token) || token.includes(columnNameLower)) {
          columnNames.push(column.name);
          break;
        }
      }
    }
    
    return [...new Set(columnNames)]; // Remove duplicates
  }

  /**
   * Determine the intent of a query
   */
  static classifyQueryIntent(query: string): {
    intent: 'select' | 'aggregate' | 'filter' | 'join' | 'visualization' | 'unknown';
    confidence: number;
  } {
    const normalizedQuery = query.toLowerCase();
    
    // Visualization keywords
    if (/(?:chart|graph|plot|visuali[sz]e|show\s+me\s+a\s+(?:bar|line|pie))/i.test(normalizedQuery)) {
      return { intent: 'visualization', confidence: 0.9 };
    }
    
    // Aggregate keywords
    if (/(?:sum|total|average|avg|mean|count|max|min|group\s+by)/i.test(normalizedQuery)) {
      return { intent: 'aggregate', confidence: 0.85 };
    }
    
    // Join keywords
    if (/(?:join|combine|merge|relate|between\s+\w+\s+and\s+\w+)/i.test(normalizedQuery)) {
      return { intent: 'join', confidence: 0.8 };
    }
    
    // Filter keywords
    if (/(?:where|filter|only|greater|less|equal|between|contains)/i.test(normalizedQuery)) {
      return { intent: 'filter', confidence: 0.75 };
    }
    
    // Select keywords
    if (/(?:show|display|list|select|get|find|all)/i.test(normalizedQuery)) {
      return { intent: 'select', confidence: 0.7 };
    }
    
    return { intent: 'unknown', confidence: 0.3 };
  }

  /**
   * Validate if a query references available files
   */
  static validateFileReferences(
    query: string,
    availableFiles: Array<{ id: string; filename: string; tableName: string }>
  ): {
    isValid: boolean;
    missingFiles: string[];
    suggestions: string[];
  } {
    const references = this.parseFileReferences(query, availableFiles);
    
    // If no files mentioned but files are available
    if (references.length === 0 && availableFiles.length > 0) {
      const intent = this.classifyQueryIntent(query);
      
      // If query seems to need data but no file is referenced
      if (intent.intent !== 'unknown' && intent.confidence > 0.5) {
        return {
          isValid: false,
          missingFiles: [],
          suggestions: availableFiles.slice(0, 3).map(f => f.filename)
        };
      }
    }
    
    return {
      isValid: true,
      missingFiles: [],
      suggestions: []
    };
  }
}

// Export validation schemas
export const FileReferenceSchema = z.object({
  fileId: z.string(),
  filename: z.string(),
  tableName: z.string(),
  confidence: z.number().min(0).max(1),
  matchedTokens: z.array(z.string())
});

export const QueryIntentSchema = z.object({
  intent: z.enum(['select', 'aggregate', 'filter', 'join', 'visualization', 'unknown']),
  confidence: z.number().min(0).max(1)
});