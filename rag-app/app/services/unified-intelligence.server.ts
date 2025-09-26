/**
 * Unified Intelligence Service
 * Provides multi-dimensional analysis combining semantic understanding,
 * statistical analysis, and natural presentation for any content type
 */

import { openai } from './openai.server';
import type { QueryIntent } from './query-intent-analyzer.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('unified-intelligence');

export interface FileContext {
  id: string;
  filename: string;
  type: 'csv' | 'excel' | 'pdf' | 'unknown';
  schema?: any;
  rowCount?: number;
  data?: any[];
  metadata?: Record<string, any>;
  extractedContent?: any; // For PDFs
}

export interface SemanticAnalysis {
  summary: string;
  context: string;
  keyThemes: string[];
  entities: string[];
  relationships: string[];
}

export interface StatisticalAnalysis {
  metrics: Record<string, any>;
  aggregations: any[];
  distributions: any[];
  patterns: string[];
  outliers: any[];
}

export interface PresentationLayer {
  narrative: string;
  tables: TableData[];
  insights: string[];
  recommendations: string[];
  visualizationSuggestions: string[];
}

export interface TableData {
  title: string;
  headers: string[];
  rows: any[][];
  caption?: string;
}

export interface UnifiedResponse {
  semantic: SemanticAnalysis;
  statistical: StatisticalAnalysis;
  presentation: PresentationLayer;
  sql?: string;
  confidence: number;
  responseType: 'full' | 'table-only' | 'narrative-only' | 'specific-answer';
  metadata: {
    tokensUsed: number;
    processingTime: number;
    filesAnalyzed: string[];
  };
}

export interface ProcessOptions {
  includeSQL: boolean;
  includeSemantic: boolean;
  includeInsights: boolean;
  includeStatistics: boolean;
  formatPreference?: string;
  maxTokens?: number;
}

export class UnifiedIntelligenceService {
  /**
   * Process query with unified intelligence
   */
  public async process(params: {
    query: string;
    files: FileContext[];
    intent: QueryIntent;
    conversationHistory?: Array<{ role: string; content: string }>;
    options?: ProcessOptions;
  }): Promise<UnifiedResponse> {
    const startTime = Date.now();
    
    logger.trace('[UnifiedIntelligence] process() called', {
      hasParams: !!params,
      paramsKeys: params ? Object.keys(params) : []
    });
    
    const { query, files, intent, conversationHistory = [], options = {} } = params;
    
    logger.trace('[UnifiedIntelligence] Processing query with unified intelligence', {
      query,
      fileCount: files.length,
      fileTypes: files.map(f => f.type),
      fileNames: files.map(f => f.filename),
      intent: intent.queryType,
      format: intent.formatPreference,
      hasOptions: !!options,
      optionKeys: Object.keys(options)
    });

    // Step 1: Perform semantic analysis
    logger.trace('[UnifiedIntelligence] Starting semantic analysis...');
    const semantic = await this.performSemanticAnalysis(query, files, intent);
    logger.trace('[UnifiedIntelligence] Semantic analysis complete', {
      hasSummary: !!semantic.summary,
      keyThemesCount: semantic.keyThemes?.length || 0,
      entitiesCount: semantic.entities?.length || 0
    });
    
    // Step 2: Perform statistical analysis if needed
    logger.trace('[UnifiedIntelligence] Checking statistical analysis need', {
      needsDataAccess: intent.needsDataAccess
    });
    const statistical = intent.needsDataAccess 
      ? await this.performStatisticalAnalysis(query, files, intent)
      : this.getEmptyStatisticalAnalysis();
    logger.trace('[UnifiedIntelligence] Statistical analysis complete', {
      hasMetrics: !!statistical.metrics,
      patternsCount: statistical.patterns?.length || 0
    });
    
    // Step 3: Generate SQL if requested and applicable
    const shouldGenSQL = options.includeSQL && this.shouldGenerateSQL(intent, files);
    logger.trace('[UnifiedIntelligence] SQL generation check', {
      includeSQL: options.includeSQL,
      shouldGenerate: shouldGenSQL
    });
    const sql = shouldGenSQL
      ? await this.generateContextAwareSQL(query, files, semantic)
      : undefined;
    
    // Step 4: Compose presentation layer
    logger.trace('[UnifiedIntelligence] Composing presentation layer...');
    const presentation = await this.composePresentationLayer(
      query,
      semantic,
      statistical,
      intent,
      files
    );
    logger.trace('[UnifiedIntelligence] Presentation layer complete', {
      narrativeLength: presentation.narrative?.length || 0,
      tablesCount: presentation.tables?.length || 0
    });
    
    // Step 5: Calculate confidence
    const confidence = this.calculateResponseConfidence(semantic, statistical, intent);
    logger.trace('[UnifiedIntelligence] Confidence calculated', { confidence });
    
    const processingTime = Date.now() - startTime;
    
    const response = {
      semantic,
      statistical,
      presentation,
      sql,
      confidence,
      responseType: intent.formatPreference as any,
      metadata: {
        tokensUsed: 0, // Will be tracked by OpenAI calls
        processingTime,
        filesAnalyzed: files.map(f => f.filename)
      }
    };
    
    logger.trace('[UnifiedIntelligence] Response complete', {
      processingTime,
      responseType: response.responseType,
      hasSemanticSummary: !!response.semantic?.summary,
      hasPresentationNarrative: !!response.presentation?.narrative
    });
    
    return response;
  }

  /**
   * Perform semantic analysis on content
   */
  private async performSemanticAnalysis(
    query: string,
    files: FileContext[],
    intent: QueryIntent
  ): Promise<SemanticAnalysis> {
    // Build context from files
    const fileDescriptions = files.map(f => this.describeFile(f)).join('\n');
    
    const prompt = `
Analyze this content and query to provide semantic understanding:

Query: "${query}"

Content Overview:
${fileDescriptions}

Provide a semantic analysis including:
1. A natural summary of what this content represents
2. The context and domain (e.g., "sales data from retail operations")
3. Key themes or categories present
4. Important entities mentioned (people, products, locations, etc.)
5. Relationships between different elements

Format as JSON with keys: summary, context, keyThemes, entities, relationships
`;

    try {
      if (!openai) {
        // Fallback to basic analysis without AI
        return this.performBasicSemanticAnalysis(files);
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'You are a data analyst that understands both documents and datasets.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1000
      });

      const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
      
      // Ensure arrays are properly formatted
      const ensureArray = (value: any): string[] => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') return [value];
        if (typeof value === 'object' && value !== null) {
          // If it's an object, try to extract values
          return Object.values(value).filter(v => typeof v === 'string');
        }
        return [];
      };
      
      return {
        summary: result.summary || 'Content analysis unavailable',
        context: result.context || this.inferContext(files),
        keyThemes: ensureArray(result.keyThemes),
        entities: ensureArray(result.entities),
        relationships: ensureArray(result.relationships)
      };
    } catch (error) {
      logger.error('Semantic analysis failed', error);
      return this.performBasicSemanticAnalysis(files);
    }
  }

  /**
   * Perform statistical analysis on data
   */
  private async performStatisticalAnalysis(
    query: string,
    files: FileContext[],
    intent: QueryIntent
  ): Promise<StatisticalAnalysis> {
    const metrics: Record<string, any> = {};
    const aggregations: any[] = [];
    const patterns: string[] = [];
    
    for (const file of files) {
      if (file.data && file.data.length > 0) {
        // Calculate basic statistics
        metrics[`${file.filename}_rows`] = file.rowCount || file.data.length;
        
        // Analyze columns if schema is available
        if (file.schema?.columns) {
          for (const column of file.schema.columns) {
            if (column.type === 'number' && file.data.length > 0) {
              const values = file.data
                .map(row => row[column.name])
                .filter(v => v != null && !isNaN(v));
              
              if (values.length > 0) {
                const stats = this.calculateStatistics(values);
                metrics[`${column.name}_stats`] = stats;
                
                // Add to aggregations for presentation
                aggregations.push({
                  column: column.name,
                  ...stats
                });
              }
            }
          }
        }
        
        // Detect patterns
        patterns.push(...this.detectPatterns(file.data, file.schema));
      }
    }
    
    return {
      metrics,
      aggregations,
      distributions: [],
      patterns,
      outliers: []
    };
  }

  /**
   * Generate context-aware SQL
   */
  private async generateContextAwareSQL(
    query: string,
    files: FileContext[],
    semantic: SemanticAnalysis
  ): Promise<string> {
    // This will be enhanced by the api.chat-query.tsx endpoint
    // For now, return empty as SQL generation is handled separately
    return '';
  }

  /**
   * Compose the presentation layer
   */
  private async composePresentationLayer(
    query: string,
    semantic: SemanticAnalysis,
    statistical: StatisticalAnalysis,
    intent: QueryIntent,
    files: FileContext[]
  ): Promise<PresentationLayer> {
    // Generate narrative based on intent
    const narrative = await this.generateNarrative(
      query,
      semantic,
      statistical,
      intent,
      files
    );
    
    // Create tables if appropriate
    const tables = this.shouldIncludeTables(intent)
      ? this.createPresentationTables(statistical, files)
      : [];
    
    // Extract insights
    const insights = this.extractInsights(semantic, statistical, files);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(
      semantic,
      statistical,
      intent
    );
    
    // Suggest visualizations
    const visualizationSuggestions = this.suggestVisualizations(
      statistical,
      intent
    );
    
    return {
      narrative,
      tables,
      insights,
      recommendations,
      visualizationSuggestions
    };
  }

  /**
   * Generate natural narrative
   */
  private async generateNarrative(
    query: string,
    semantic: SemanticAnalysis,
    statistical: StatisticalAnalysis,
    intent: QueryIntent,
    files: FileContext[]
  ): Promise<string> {
    // Handle specific format preferences
    if (intent.formatPreference === 'table-only') {
      return ''; // No narrative for table-only requests
    }
    
    if (intent.formatPreference === 'specific-answer') {
      // Return just the specific answer
      const answer = this.extractSpecificAnswer(query, statistical);
      if (answer) return answer;
    }
    
    // Build comprehensive narrative
    const parts: string[] = [];
    
    // Start with context
    parts.push(this.generateContextIntro(files, semantic));
    
    // Add key findings
    if (statistical.patterns.length > 0) {
      parts.push(this.narratePatterns(statistical.patterns));
    }
    
    // Weave in statistics naturally
    if (statistical.aggregations.length > 0) {
      parts.push(this.narrateStatistics(statistical.aggregations));
    }
    
    // Add thematic insights
    if (semantic.keyThemes.length > 0) {
      parts.push(this.narrateThemes(semantic.keyThemes));
    }
    
    return parts.filter(p => p).join('\n\n');
  }

  /**
   * Helper: Generate context introduction
   */
  private generateContextIntro(files: FileContext[], semantic: SemanticAnalysis): string {
    const fileTypes = [...new Set(files.map(f => f.type))];
    const totalRows = files.reduce((sum, f) => sum + (f.rowCount || 0), 0);
    
    if (fileTypes.includes('pdf')) {
      const pdfFile = files.find(f => f.type === 'pdf');
      return `This ${semantic.context || 'document'} ${semantic.summary || 'contains information'}.`;
    }
    
    if (fileTypes.includes('csv') || fileTypes.includes('excel')) {
      return `This dataset ${semantic.context ? `from ${semantic.context}` : ''} contains ${totalRows.toLocaleString()} records. ${semantic.summary || ''}`;
    }
    
    return semantic.summary || 'Analyzing the provided content...';
  }

  /**
   * Helper: Narrate patterns naturally
   */
  private narratePatterns(patterns: string[]): string {
    if (patterns.length === 0) return '';
    
    const intro = patterns.length === 1 
      ? 'The data shows'
      : 'The data reveals several patterns:';
    
    if (patterns.length === 1) {
      return `${intro} ${patterns[0]}.`;
    }
    
    return `${intro}\n${patterns.map(p => `• ${p}`).join('\n')}`;
  }

  /**
   * Helper: Narrate statistics naturally
   */
  private narrateStatistics(aggregations: any[]): string {
    if (aggregations.length === 0) return '';
    
    const keyStats = aggregations.slice(0, 3);
    const parts: string[] = [];
    
    for (const stat of keyStats) {
      if (stat.column && stat.mean != null) {
        parts.push(`The average ${this.humanizeColumnName(stat.column)} is ${this.formatNumber(stat.mean)}`);
      }
    }
    
    return parts.join(', ');
  }

  /**
   * Helper: Narrate themes
   */
  private narrateThemes(themes: string[]): string {
    // Ensure themes is an array
    const themeArray = Array.isArray(themes) ? themes : [];
    
    if (themeArray.length === 0) return '';
    
    return `Key themes include: ${themeArray.join(', ')}.`;
  }

  /**
   * Helper: Create presentation tables
   */
  private createPresentationTables(
    statistical: StatisticalAnalysis,
    files: FileContext[]
  ): TableData[] {
    const tables: TableData[] = [];
    
    // Create summary statistics table if we have aggregations
    if (statistical.aggregations.length > 0) {
      tables.push({
        title: 'Summary Statistics',
        headers: ['Metric', 'Value', 'Min', 'Max', 'Average'],
        rows: statistical.aggregations.map(agg => [
          this.humanizeColumnName(agg.column),
          this.formatNumber(agg.sum || agg.count),
          this.formatNumber(agg.min),
          this.formatNumber(agg.max),
          this.formatNumber(agg.mean)
        ])
      });
    }
    
    return tables;
  }

  /**
   * Helper: Extract insights
   */
  private extractInsights(
    semantic: SemanticAnalysis,
    statistical: StatisticalAnalysis,
    files: FileContext[]
  ): string[] {
    const insights: string[] = [];
    
    // Add pattern-based insights
    for (const pattern of statistical.patterns.slice(0, 3)) {
      insights.push(`📊 ${pattern}`);
    }
    
    // Add theme-based insights
    for (const theme of semantic.keyThemes.slice(0, 2)) {
      insights.push(`🎯 Focus area: ${theme}`);
    }
    
    return insights;
  }

  /**
   * Helper: Generate recommendations
   */
  private generateRecommendations(
    semantic: SemanticAnalysis,
    statistical: StatisticalAnalysis,
    intent: QueryIntent
  ): string[] {
    const recommendations: string[] = [];
    
    if (intent.queryType === 'summary') {
      recommendations.push('You might want to explore specific metrics or time periods for deeper insights.');
    }
    
    if (intent.queryType === 'analysis' && statistical.patterns.length > 0) {
      recommendations.push('Consider investigating the root causes of identified patterns.');
    }
    
    return recommendations;
  }

  /**
   * Helper: Suggest visualizations
   */
  private suggestVisualizations(
    statistical: StatisticalAnalysis,
    intent: QueryIntent
  ): string[] {
    const suggestions: string[] = [];
    
    if (statistical.aggregations.length > 0) {
      suggestions.push('Bar chart for comparing metrics');
    }
    
    if (statistical.distributions.length > 0) {
      suggestions.push('Histogram for distribution analysis');
    }
    
    return suggestions;
  }

  /**
   * Helper utilities
   */
  private describeFile(file: FileContext): string {
    const type = file.type === 'pdf' ? 'document' : 'dataset';
    const size = file.rowCount ? `${file.rowCount} rows` : '';
    
    // Include actual content for PDFs if available
    if (file.type === 'pdf' && file.content) {
      const contentPreview = typeof file.content === 'string' 
        ? file.content.slice(0, 10000) // Get first 10K chars
        : Array.isArray(file.content) 
          ? file.content.slice(0, 20).join('\n\n') // Get first 20 chunks
          : '';
      
      logger.trace('[describeFile] Including PDF content', {
        filename: file.filename,
        contentLength: contentPreview.length,
        hasContent: !!contentPreview
      });
      
      return `${file.filename} (${type}${size ? `, ${size}` : ''})\n\nContent:\n${contentPreview}`;
    }
    
    // Include sample data for CSV/Excel if available
    if ((file.type === 'csv' || file.type === 'excel') && file.sample) {
      return `${file.filename} (${type}${size ? `, ${size}` : ''})\n\nSample:\n${file.sample}`;
    }
    
    return `${file.filename} (${type}${size ? `, ${size}` : ''})`;
  }

  private inferContext(files: FileContext[]): string {
    // Infer context from filenames and content
    const names = files.map(f => f.filename.toLowerCase());
    
    if (names.some(n => n.includes('sales'))) return 'sales data';
    if (names.some(n => n.includes('customer'))) return 'customer information';
    if (names.some(n => n.includes('product'))) return 'product catalog';
    if (names.some(n => n.includes('financial'))) return 'financial records';
    
    return 'business data';
  }

  private performBasicSemanticAnalysis(files: FileContext[]): SemanticAnalysis {
    return {
      summary: `Analyzing ${files.length} file(s)`,
      context: this.inferContext(files),
      keyThemes: [],
      entities: [],
      relationships: []
    };
  }

  private getEmptyStatisticalAnalysis(): StatisticalAnalysis {
    return {
      metrics: {},
      aggregations: [],
      distributions: [],
      patterns: [],
      outliers: []
    };
  }

  private calculateStatistics(values: number[]): any {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    
    return {
      count: values.length,
      sum,
      mean,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)]
    };
  }

  private detectPatterns(data: any[], schema: any): string[] {
    const patterns: string[] = [];
    
    // Detect trends if there's a date column
    // Detect correlations between numeric columns
    // This would be enhanced with more sophisticated analysis
    
    return patterns;
  }

  private shouldGenerateSQL(intent: QueryIntent, files: FileContext[]): boolean {
    // Generate SQL for data files, not for PDFs (unless they have extracted tables)
    const hasData = files.some(f => f.type === 'csv' || f.type === 'excel' || (f.data && f.data.length > 0));
    return hasData && intent.needsDataAccess;
  }

  private shouldIncludeTables(intent: QueryIntent): boolean {
    return intent.formatPreference !== 'narrative-only';
  }

  private extractSpecificAnswer(query: string, statistical: StatisticalAnalysis): string | null {
    // Extract specific numeric answers
    // This would be enhanced based on the specific request
    return null;
  }

  private humanizeColumnName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  private formatNumber(value: any): string {
    if (value == null) return '-';
    if (typeof value !== 'number') return String(value);
    
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }
    
    return value.toFixed(2);
  }

  private calculateResponseConfidence(
    semantic: SemanticAnalysis,
    statistical: StatisticalAnalysis,
    intent: QueryIntent
  ): number {
    let confidence = intent.confidence;
    
    // Increase confidence if we have rich analysis
    if (semantic.keyThemes.length > 0) confidence += 0.1;
    if (statistical.patterns.length > 0) confidence += 0.1;
    
    return Math.min(1, confidence);
  }
}

// Export singleton instance
export const unifiedIntelligence = new UnifiedIntelligenceService();