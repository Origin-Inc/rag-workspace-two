import { get_encoding, encoding_for_model, type TiktokenModel } from 'tiktoken';
import type { FileSchema } from '~/services/file-processing.server';

export interface ContextItem {
  type: 'system' | 'schema' | 'data' | 'message' | 'query';
  content: string;
  priority: number; // 1-10, higher is more important
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

export class ContextWindowManager {
  // Token limits based on model capabilities
  private static readonly MODEL_LIMITS = {
    'gpt-4-turbo-preview': 128000,
    'gpt-4': 8192,
    'gpt-3.5-turbo': 16384,
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
  };
  
  // Reserve tokens for response
  private static readonly RESPONSE_RESERVE = 4000;
  
  // Token counting cache
  private static tokenCache = new Map<string, number>();
  
  /**
   * Count tokens in a string using tiktoken
   */
  static countTokens(text: string, model: TiktokenModel = 'gpt-4'): number {
    // Check cache first
    const cacheKey = `${model}:${text.substring(0, 100)}:${text.length}`;
    if (this.tokenCache.has(cacheKey)) {
      return this.tokenCache.get(cacheKey)!;
    }
    
    try {
      const encoder = encoding_for_model(model);
      const tokens = encoder.encode(text).length;
      encoder.free();
      
      // Cache the result
      this.tokenCache.set(cacheKey, tokens);
      
      // Limit cache size
      if (this.tokenCache.size > 1000) {
        const firstKey = this.tokenCache.keys().next().value;
        this.tokenCache.delete(firstKey);
      }
      
      return tokens;
    } catch (error) {
      // Fallback to approximation if tiktoken fails
      return Math.ceil(text.length / 4);
    }
  }
  
  /**
   * Build an optimized context window for a chat session
   */
  static buildContextWindow(
    messages: Array<{ role: string; content: string }>,
    dataFiles: Array<{
      id: string;
      filename: string;
      schema: FileSchema;
      data?: any[];
    }>,
    options: {
      model?: string;
      maxTokens?: number;
      includeFullSchema?: boolean;
      includeDataSample?: boolean;
      priorityFileIds?: string[];
    } = {}
  ): ContextWindow {
    const {
      model = 'gpt-4-turbo-preview',
      maxTokens = this.MODEL_LIMITS[model as keyof typeof this.MODEL_LIMITS] || 100000,
      includeFullSchema = true,
      includeDataSample = true,
      priorityFileIds = []
    } = options;
    
    const effectiveLimit = maxTokens - this.RESPONSE_RESERVE;
    const items: ContextItem[] = [];
    let totalTokens = 0;
    
    // 1. Add system message (highest priority)
    const systemMessage = this.buildSystemMessage(dataFiles);
    const systemTokens = this.countTokens(systemMessage);
    items.push({
      type: 'system',
      content: systemMessage,
      priority: 10,
      tokens: systemTokens
    });
    totalTokens += systemTokens;
    
    // 2. Add file schemas (high priority)
    if (includeFullSchema && dataFiles.length > 0) {
      for (const file of dataFiles) {
        const isPriority = priorityFileIds.includes(file.id);
        const schemaContent = this.formatSchema(file.schema, file.filename);
        const schemaTokens = this.countTokens(schemaContent);
        
        if (totalTokens + schemaTokens <= effectiveLimit) {
          items.push({
            type: 'schema',
            content: schemaContent,
            priority: isPriority ? 9 : 7,
            tokens: schemaTokens,
            metadata: { fileId: file.id, filename: file.filename }
          });
          totalTokens += schemaTokens;
        }
      }
    }
    
    // 3. Add data samples (medium priority)
    if (includeDataSample && dataFiles.length > 0) {
      for (const file of dataFiles) {
        if (!file.data || file.data.length === 0) continue;
        
        const isPriority = priorityFileIds.includes(file.id);
        const sampleSize = this.calculateOptimalSampleSize(
          file.data.length,
          effectiveLimit - totalTokens
        );
        
        const sampleData = file.data.slice(0, sampleSize);
        const dataContent = this.formatDataSample(sampleData, file.filename);
        const dataTokens = this.countTokens(dataContent);
        
        if (totalTokens + dataTokens <= effectiveLimit) {
          items.push({
            type: 'data',
            content: dataContent,
            priority: isPriority ? 8 : 5,
            tokens: dataTokens,
            metadata: {
              fileId: file.id,
              filename: file.filename,
              rowRange: [0, sampleSize]
            }
          });
          totalTokens += dataTokens;
        }
      }
    }
    
    // 4. Add conversation history (variable priority based on recency)
    const recentMessages = messages.slice(-20); // Keep last 20 messages max
    for (let i = 0; i < recentMessages.length; i++) {
      const message = recentMessages[i];
      const messageContent = `${message.role}: ${message.content}`;
      const messageTokens = this.countTokens(messageContent);
      
      // More recent messages have higher priority
      const priority = 3 + (i / recentMessages.length) * 3;
      
      if (totalTokens + messageTokens <= effectiveLimit) {
        items.push({
          type: 'message',
          content: messageContent,
          priority,
          tokens: messageTokens
        });
        totalTokens += messageTokens;
      } else {
        // Stop adding messages if we're out of space
        break;
      }
    }
    
    // Sort by priority (highest first) for potential truncation
    items.sort((a, b) => b.priority - a.priority);
    
    return {
      items,
      totalTokens,
      maxTokens: effectiveLimit,
      hasMore: totalTokens >= effectiveLimit * 0.9
    };
  }
  
  /**
   * Build system message with context about available data
   */
  private static buildSystemMessage(dataFiles: Array<{ filename: string; schema: FileSchema }>): string {
    if (dataFiles.length === 0) {
      return `You are a data analysis assistant. No data files are currently loaded.
Help the user understand how to upload and analyze data files.`;
    }
    
    const fileList = dataFiles.map(f => 
      `- ${f.filename}: ${f.schema.rowCount} rows, ${f.schema.columns.length} columns`
    ).join('\n');
    
    return `You are a data analysis assistant with access to the following data files:
${fileList}

You can help users:
1. Query and analyze their data using SQL
2. Create visualizations and charts
3. Find patterns and insights
4. Perform calculations and aggregations

When writing SQL queries, use the exact table names provided in the schema.
Always validate column names against the schema before using them in queries.`;
  }
  
  /**
   * Format schema information concisely
   */
  private static formatSchema(schema: FileSchema, filename: string): string {
    const columns = schema.columns.map(col => 
      `  - ${col.name} (${col.type})${col.nullable ? ', nullable' : ''}`
    ).join('\n');
    
    return `Schema for "${filename}":
${columns}
Total rows: ${schema.rowCount}`;
  }
  
  /**
   * Format data sample efficiently
   */
  private static formatDataSample(data: any[], filename: string): string {
    if (data.length === 0) return '';
    
    // Use JSON for compact representation
    const sample = data.slice(0, 5);
    return `Sample data from "${filename}" (first ${sample.length} rows):
${JSON.stringify(sample, null, 2)}`;
  }
  
  /**
   * Calculate optimal sample size based on available token budget
   */
  private static calculateOptimalSampleSize(
    totalRows: number,
    remainingTokens: number
  ): number {
    // Estimate ~50 tokens per row on average
    const estimatedTokensPerRow = 50;
    const maxRowsByTokens = Math.floor(remainingTokens / estimatedTokensPerRow);
    
    // Use graduated sampling for large datasets
    if (totalRows <= 10) {
      return Math.min(totalRows, maxRowsByTokens);
    } else if (totalRows <= 100) {
      return Math.min(10, maxRowsByTokens);
    } else if (totalRows <= 1000) {
      return Math.min(5, maxRowsByTokens);
    } else {
      return Math.min(3, maxRowsByTokens);
    }
  }
  
  /**
   * Summarize data for inclusion in context
   */
  static summarizeData(
    data: any[],
    schema: FileSchema,
    options: {
      includeStats?: boolean;
      includeDistribution?: boolean;
      maxUniqueValues?: number;
    } = {}
  ): string {
    const {
      includeStats = true,
      includeDistribution = true,
      maxUniqueValues = 10
    } = options;
    
    const summary: string[] = [];
    
    // Basic info
    summary.push(`Dataset contains ${data.length} rows with ${schema.columns.length} columns.`);
    
    if (includeStats) {
      // Calculate stats for numeric columns
      const numericColumns = schema.columns.filter(col => col.type === 'number');
      for (const col of numericColumns) {
        const values = data.map(row => row[col.name]).filter(v => v != null);
        if (values.length > 0) {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          summary.push(`${col.name}: min=${min.toFixed(2)}, max=${max.toFixed(2)}, avg=${avg.toFixed(2)}`);
        }
      }
    }
    
    if (includeDistribution) {
      // Show distribution for categorical columns
      const categoricalColumns = schema.columns.filter(col => col.type === 'string');
      for (const col of categoricalColumns) {
        const valueCounts = new Map<string, number>();
        for (const row of data) {
          const value = row[col.name];
          if (value != null) {
            valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
          }
        }
        
        if (valueCounts.size <= maxUniqueValues) {
          const distribution = Array.from(valueCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([val, count]) => `${val}(${count})`)
            .join(', ');
          summary.push(`${col.name} distribution: ${distribution}`);
        } else {
          summary.push(`${col.name}: ${valueCounts.size} unique values`);
        }
      }
    }
    
    return summary.join('\n');
  }
  
  /**
   * Compress context by removing redundant information
   */
  static compressContext(context: string): string {
    // Remove excessive whitespace
    let compressed = context.replace(/\s+/g, ' ').trim();
    
    // Remove duplicate lines
    const lines = compressed.split('\n');
    const uniqueLines = [...new Set(lines)];
    
    // Remove very similar lines (edit distance < 5)
    const filtered: string[] = [];
    for (const line of uniqueLines) {
      const isDuplicate = filtered.some(existing => 
        this.levenshteinDistance(existing, line) < 5
      );
      if (!isDuplicate) {
        filtered.push(line);
      }
    }
    
    return filtered.join('\n');
  }
  
  /**
   * Identify files mentioned in a query for prioritization
   */
  static identifyMentionedFiles(
    query: string,
    dataFiles: Array<{ id: string; filename: string }>
  ): string[] {
    const lowerQuery = query.toLowerCase();
    const mentionedIds: string[] = [];
    
    for (const file of dataFiles) {
      const filename = file.filename.toLowerCase();
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      const tableName = filename.replace(/\.(csv|json|xlsx|txt)$/i, '');
      
      // Check various ways the file might be mentioned
      if (
        lowerQuery.includes(filename) ||
        lowerQuery.includes(nameWithoutExt) ||
        lowerQuery.includes(tableName) ||
        // Check for partial matches (e.g., "sales" matches "sales_data.csv")
        tableName.split(/[_-]/).some(part => 
          part.length > 3 && lowerQuery.includes(part)
        )
      ) {
        mentionedIds.push(file.id);
      }
    }
    
    return mentionedIds;
  }
  
  /**
   * Build context with query-aware prioritization
   */
  static buildQueryAwareContext(
    query: string,
    messages: Array<{ role: string; content: string }>,
    dataFiles: Array<{
      id: string;
      filename: string;
      schema: FileSchema;
      data?: any[];
    }>,
    options: {
      model?: string;
      maxTokens?: number;
    } = {}
  ): ContextWindow {
    // Identify files mentioned in the query
    const mentionedFileIds = this.identifyMentionedFiles(query, dataFiles);
    
    // Build context with prioritized files
    return this.buildContextWindow(messages, dataFiles, {
      ...options,
      priorityFileIds: mentionedFileIds,
      includeFullSchema: true,
      includeDataSample: true,
    });
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,    // deletion
            dp[i][j - 1] + 1,    // insertion
            dp[i - 1][j - 1] + 1 // substitution
          );
        }
      }
    }
    
    return dp[m][n];
  }
}