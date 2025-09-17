import type { FileSchema } from '~/services/file-processing.server';

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
  // Token limits for different models
  private static readonly MODEL_LIMITS = {
    'gpt-4-turbo': 128000,
    'gpt-4': 8192,
    'gpt-3.5-turbo': 16384,
    'claude-3': 200000,
  };
  
  private static readonly RESPONSE_RESERVE = 4000;
  
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
    return dataFiles.filter(file => {
      const filename = file.filename.toLowerCase();
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      
      return lowerQuery.includes(filename) || 
             lowerQuery.includes(nameWithoutExt) ||
             lowerQuery.includes(file.schema.columns[0]?.name?.toLowerCase());
    });
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
}