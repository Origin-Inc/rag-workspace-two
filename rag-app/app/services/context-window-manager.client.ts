import type { FileSchema } from '~/services/file-processing.client';
import { FuzzyFileMatcherClient } from './fuzzy-file-matcher.client';
import type { DataFile } from '~/stores/chat-store';

export interface ContextItem {
  type: 'system' | 'schema' | 'data' | 'message' | 'query';
  content: string;
  priority: number;
  tokens?: number;
  metadata?: {
    fileId?: string;
    filename?: string;
    rowRange?: [number, number];
  };
}

export interface ContextWindow {
  items: ContextItem[];
  totalTokens: number;
  maxTokens: number;
  hasMore: boolean;
}

export class ContextWindowManagerClient {
  // Token limits for different models (updated for latest models)
  private static readonly MODEL_LIMITS = {
    'gpt-4-turbo-preview': 128000,
    'gpt-4-turbo': 128000,
    'gpt-4': 8192,
    'gpt-3.5-turbo': 16384,
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
  };
  
  private static readonly RESPONSE_RESERVE = 4000;
  private static readonly TOKENS_PER_ROW_ESTIMATE = 50;
  
  /**
   * Estimate token count (client-side approximation)
   * Uses character count with adjustments for different content types
   */
  static estimateTokens(text: string): number {
    // Basic approximation: ~4 characters per token for English
    // Adjust for different content types
    let multiplier = 0.25; // Default: 1 token per 4 characters
    
    // JSON content tends to have more tokens
    if (text.includes('{') && text.includes('}')) {
      multiplier = 0.3;
    }
    
    // Code/SQL tends to have more tokens due to special characters
    if (text.match(/SELECT|FROM|WHERE|CREATE|INSERT/i)) {
      multiplier = 0.35;
    }
    
    return Math.ceil(text.length * multiplier);
  }
  
  /**
   * Build context from available data with smart truncation
   */
  static buildContext(
    currentQuery: string,
    dataFiles: Array<{
      id: string;
      filename: string;
      schema: FileSchema;
      sampleData?: any[];
    }>,
    recentMessages: Array<{ role: string; content: string }> = [],
    maxTokens: number = 100000
  ): {
    context: string;
    includedFiles: string[];
    truncated: boolean;
    tokenEstimate: number;
  } {
    const effectiveLimit = maxTokens - this.RESPONSE_RESERVE;
    const contextParts: string[] = [];
    const includedFiles: string[] = [];
    let totalTokens = 0;
    let truncated = false;
    
    // 1. Add current query context
    const queryContext = `Current query: ${currentQuery}`;
    contextParts.push(queryContext);
    totalTokens += this.estimateTokens(queryContext);
    
    // 2. Add file schemas (prioritize files mentioned in query)
    const mentionedFiles = this.identifyMentionedFiles(currentQuery, dataFiles);
    const sortedFiles = [
      ...mentionedFiles,
      ...dataFiles.filter(f => !mentionedFiles.includes(f))
    ];
    
    for (const file of sortedFiles) {
      const schemaText = this.formatFileSchema(file);
      const schemaTokens = this.estimateTokens(schemaText);
      
      if (totalTokens + schemaTokens > effectiveLimit) {
        truncated = true;
        break;
      }
      
      contextParts.push(schemaText);
      includedFiles.push(file.filename);
      totalTokens += schemaTokens;
      
      // Add sample data if available and space permits
      if (file.sampleData && file.sampleData.length > 0) {
        const sampleText = this.formatSampleData(file.sampleData, file.filename);
        const sampleTokens = this.estimateTokens(sampleText);
        
        if (totalTokens + sampleTokens <= effectiveLimit) {
          contextParts.push(sampleText);
          totalTokens += sampleTokens;
        }
      }
    }
    
    // 3. Add recent conversation context
    if (recentMessages.length > 0) {
      const conversationText = this.formatConversation(recentMessages);
      const conversationTokens = this.estimateTokens(conversationText);
      
      if (totalTokens + conversationTokens <= effectiveLimit) {
        contextParts.push(conversationText);
        totalTokens += conversationTokens;
      } else {
        truncated = true;
      }
    }
    
    return {
      context: contextParts.join('\n\n'),
      includedFiles,
      truncated,
      tokenEstimate: totalTokens
    };
  }
  
  /**
   * Identify files mentioned in the query
   */
  private static identifyMentionedFiles(
    query: string,
    dataFiles: Array<{ id: string; filename: string; schema: FileSchema }>
  ): Array<{ id: string; filename: string; schema: FileSchema }> {
    const lowerQuery = query.toLowerCase();
    
    // First try exact matching for backwards compatibility
    const exactMatches = dataFiles.filter(file => {
      const filename = file.filename.toLowerCase();
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      
      return lowerQuery.includes(filename) || 
             lowerQuery.includes(nameWithoutExt) ||
             lowerQuery.includes(file.schema.columns[0]?.name?.toLowerCase());
    });
    
    // If we have exact matches, return them
    if (exactMatches.length > 0) {
      return exactMatches;
    }
    
    // Otherwise, use fuzzy matching
    const dataFilesForMatching = dataFiles.map(f => ({
      id: f.id,
      filename: f.filename,
      tableName: f.filename.replace(/\.[^/.]+$/, ''),
      schema: f.schema.columns.map(c => ({ name: c.name, type: c.type })),
      rowCount: f.schema.rowCount,
      sizeBytes: 0,
      uploadedAt: new Date(),
      pageId: '',
    } as DataFile));
    
    const fuzzyMatches = FuzzyFileMatcherClient.matchFiles(
      query,
      dataFilesForMatching,
      {
        confidenceThreshold: 0.4,
        maxResults: 5,
        includeSemanticMatch: true,
        includeTemporalMatch: true
      }
    );
    
    // Return the original file objects for matched IDs
    const matchedIds = new Set(fuzzyMatches.map(m => m.file.id));
    return dataFiles.filter(f => matchedIds.has(f.id));
  }
  
  /**
   * Format file schema for context
   */
  private static formatFileSchema(file: {
    filename: string;
    schema: FileSchema;
  }): string {
    const columns = file.schema.columns
      .map(col => `  ${col.name} (${col.type})`)
      .join('\n');
    
    return `File: ${file.filename}
Columns:
${columns}
Rows: ${file.schema.rowCount}`;
  }
  
  /**
   * Format sample data for context
   */
  private static formatSampleData(data: any[], filename: string): string {
    const sample = data.slice(0, 3);
    return `Sample from ${filename}:
${JSON.stringify(sample, null, 2)}`;
  }
  
  /**
   * Format conversation history
   */
  private static formatConversation(messages: Array<{ role: string; content: string }>): string {
    const recent = messages.slice(-5); // Last 5 messages
    return 'Recent conversation:\n' + 
      recent.map(m => `${m.role}: ${m.content}`).join('\n');
  }
  
  /**
   * Smart data sampling based on query intent
   */
  static selectRelevantData(
    query: string,
    data: any[],
    schema: FileSchema,
    maxRows: number = 10
  ): any[] {
    // If query mentions specific values, prioritize rows with those values
    const tokens = query.toLowerCase().split(/\s+/);
    const relevantRows: any[] = [];
    const seenRows = new Set<number>();
    
    // First pass: find rows with exact matches
    for (let i = 0; i < data.length && relevantRows.length < maxRows; i++) {
      const row = data[i];
      const rowStr = JSON.stringify(row).toLowerCase();
      
      for (const token of tokens) {
        if (token.length > 2 && rowStr.includes(token)) {
          relevantRows.push(row);
          seenRows.add(i);
          break;
        }
      }
    }
    
    // Second pass: add diverse samples if needed
    if (relevantRows.length < maxRows) {
      const remaining = maxRows - relevantRows.length;
      const step = Math.floor(data.length / remaining);
      
      for (let i = 0; i < data.length && relevantRows.length < maxRows; i += step) {
        if (!seenRows.has(i)) {
          relevantRows.push(data[i]);
        }
      }
    }
    
    return relevantRows;
  }
  
  /**
   * Generate a summary of the data for compact context
   */
  static generateDataSummary(
    data: any[],
    schema: FileSchema
  ): string {
    const summary: string[] = [];
    
    // Basic statistics
    summary.push(`Total rows: ${data.length}`);
    
    // Numeric column statistics
    const numericColumns = schema.columns.filter(col => col.type === 'number');
    for (const col of numericColumns) {
      const values = data
        .map(row => row[col.name])
        .filter(v => v != null && !isNaN(v));
      
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        summary.push(`${col.name}: min=${min}, max=${max}, avg=${avg.toFixed(2)}`);
      }
    }
    
    // Categorical column unique counts
    const stringColumns = schema.columns.filter(col => col.type === 'string');
    for (const col of stringColumns.slice(0, 3)) { // Limit to first 3
      const uniqueValues = new Set(data.map(row => row[col.name]));
      summary.push(`${col.name}: ${uniqueValues.size} unique values`);
      
      // Show top 3 values if not too many
      if (uniqueValues.size <= 10) {
        const valueCounts = new Map<string, number>();
        for (const row of data) {
          const val = row[col.name];
          if (val != null) {
            valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
          }
        }
        
        const top3 = Array.from(valueCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([val, count]) => `${val}(${count})`)
          .join(', ');
        
        summary.push(`  Top values: ${top3}`);
      }
    }
    
    return summary.join('\n');
  }
  
  /**
   * Check if context is within acceptable limits
   */
  static isWithinTokenLimit(
    context: string,
    model: string = 'gpt-4-turbo'
  ): boolean {
    const limit = this.MODEL_LIMITS[model as keyof typeof this.MODEL_LIMITS] || 100000;
    const estimate = this.estimateTokens(context);
    return estimate < (limit - this.RESPONSE_RESERVE);
  }
  
  /**
   * Intelligently sample data based on column patterns
   */
  static smartColumnSample(
    data: any[],
    schema: FileSchema,
    query: string,
    maxRows: number = 10
  ): { sample: any[]; strategy: string } {
    if (data.length <= maxRows) {
      return { sample: data, strategy: 'complete' };
    }
    
    const lowerQuery = query.toLowerCase();
    
    // Check for aggregation keywords
    if (/\b(sum|avg|average|mean|count|total|min|max|group)\b/.test(lowerQuery)) {
      // For aggregations, sample diverse values
      return {
        sample: this.getDiverseSample(data, schema, maxRows),
        strategy: 'diverse',
      };
    }
    
    // Check for specific value mentions
    const valueMatches = this.findValueMatches(data, query, maxRows);
    if (valueMatches.length > 0) {
      return {
        sample: valueMatches,
        strategy: 'value-match',
      };
    }
    
    // Check for time-based queries
    if (/\b(recent|latest|last|newest|oldest|first)\b/.test(lowerQuery)) {
      const dateColumns = schema.columns.filter(c => 
        c.type === 'date' || c.type === 'datetime' || c.name.toLowerCase().includes('date')
      );
      
      if (dateColumns.length > 0) {
        return {
          sample: this.getTimeSample(data, dateColumns[0].name, lowerQuery.includes('oldest') || lowerQuery.includes('first'), maxRows),
          strategy: 'time-based',
        };
      }
    }
    
    // Default: stratified sampling
    return {
      sample: this.getStratifiedSample(data, maxRows),
      strategy: 'stratified',
    };
  }
  
  /**
   * Get diverse sample covering value ranges
   */
  private static getDiverseSample(data: any[], schema: FileSchema, maxRows: number): any[] {
    const numericColumns = schema.columns.filter(c => c.type === 'number');
    if (numericColumns.length === 0) {
      return this.getStratifiedSample(data, maxRows);
    }
    
    // Sort by first numeric column and take evenly spaced samples
    const sortColumn = numericColumns[0].name;
    const sorted = [...data].sort((a, b) => {
      const aVal = Number(a[sortColumn]) || 0;
      const bVal = Number(b[sortColumn]) || 0;
      return aVal - bVal;
    });
    
    const step = Math.floor(sorted.length / maxRows);
    const sample: any[] = [];
    
    for (let i = 0; i < sorted.length && sample.length < maxRows; i += step) {
      sample.push(sorted[i]);
    }
    
    return sample;
  }
  
  /**
   * Find rows matching specific values in query
   */
  private static findValueMatches(data: any[], query: string, maxRows: number): any[] {
    const matches: any[] = [];
    const lowerQuery = query.toLowerCase();
    
    for (const row of data) {
      const rowStr = JSON.stringify(row).toLowerCase();
      
      // Check if row contains query terms
      const queryTokens = lowerQuery.split(/\s+/).filter(t => t.length > 2);
      const hasMatch = queryTokens.some(token => rowStr.includes(token));
      
      if (hasMatch) {
        matches.push(row);
        if (matches.length >= maxRows) break;
      }
    }
    
    return matches;
  }
  
  /**
   * Get time-based sample
   */
  private static getTimeSample(data: any[], dateColumn: string, oldest: boolean, maxRows: number): any[] {
    const sorted = [...data].sort((a, b) => {
      const aDate = new Date(a[dateColumn]).getTime() || 0;
      const bDate = new Date(b[dateColumn]).getTime() || 0;
      return oldest ? aDate - bDate : bDate - aDate;
    });
    
    return sorted.slice(0, maxRows);
  }
  
  /**
   * Get stratified sample (evenly distributed)
   */
  private static getStratifiedSample(data: any[], maxRows: number): any[] {
    const step = Math.ceil(data.length / maxRows);
    const sample: any[] = [];
    
    for (let i = 0; i < data.length && sample.length < maxRows; i += step) {
      sample.push(data[i]);
    }
    
    return sample;
  }
  
  /**
   * Optimize data for context based on query intent
   */
  static optimizeDataForContext(
    data: any[],
    schema: FileSchema,
    query: string,
    availableTokens: number
  ): { data: any[]; metadata: any } {
    const tokensPerRow = this.TOKENS_PER_ROW_ESTIMATE;
    const maxRows = Math.floor(availableTokens / tokensPerRow);
    
    // Use smart sampling
    const { sample, strategy } = this.smartColumnSample(data, schema, query, maxRows);
    
    // Generate metadata about the sampling
    const metadata = {
      totalRows: data.length,
      sampledRows: sample.length,
      samplingStrategy: strategy,
      estimatedTokens: sample.length * tokensPerRow,
    };
    
    return { data: sample, metadata };
  }
}