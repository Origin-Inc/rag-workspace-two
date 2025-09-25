/**
 * Response Composer
 * Composes natural, human-like responses from multi-dimensional analysis
 * Blends narrative, data, and insights based on user intent
 */

import type { QueryIntent } from './query-intent-analyzer.server';
import type { UnifiedResponse, TableData } from './unified-intelligence.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('response-composer');

export interface CompositionOptions {
  prioritizeNarrative?: boolean;
  includeVisualization?: boolean;
  depth?: 'brief' | 'standard' | 'detailed';
  includeSQL?: boolean;
  includeTechnicalDetails?: boolean;
}

export interface QueryResult {
  success: boolean;
  data?: any[];
  columns?: string[];
  error?: string;
  executionTime?: number;
}

export class ResponseComposer {
  /**
   * Compose a complete response based on intent and analysis
   */
  public async compose(
    intent: QueryIntent,
    analysis: UnifiedResponse,
    queryResult?: QueryResult,
    options: CompositionOptions = {}
  ): Promise<string> {
    logger.trace('Composing response', {
      queryType: intent.queryType,
      formatPreference: intent.formatPreference,
      hasData: !!queryResult?.data,
      options
    });

    // Handle explicit format requests
    if (intent.formatPreference === 'table-only') {
      return this.composeTableOnlyResponse(analysis, queryResult);
    }

    if (intent.formatPreference === 'specific-answer') {
      return this.composeSpecificAnswer(analysis, queryResult, intent);
    }

    if (intent.formatPreference === 'narrative-only') {
      return this.composeNarrativeOnlyResponse(analysis, intent);
    }

    // Default: Compose rich, multi-format response
    return this.composeFullResponse(intent, analysis, queryResult, options);
  }

  /**
   * Compose a full, rich response with narrative and data
   */
  private composeFullResponse(
    intent: QueryIntent,
    analysis: UnifiedResponse,
    queryResult?: QueryResult,
    options: CompositionOptions = {}
  ): string {
    const sections: string[] = [];

    // 1. Start with natural context
    const contextIntro = this.createContextIntroduction(analysis, intent);
    if (contextIntro) sections.push(contextIntro);

    // 2. Add main insights woven with data
    const mainInsights = this.weaveInsightsWithData(analysis, queryResult);
    if (mainInsights) sections.push(mainInsights);

    // 3. Add supporting tables when they add value
    if (this.shouldIncludeTables(intent, analysis, queryResult)) {
      const tables = this.formatTablesSection(analysis, queryResult);
      if (tables) sections.push(tables);
    }

    // 4. Add patterns and deeper analysis
    if (options.depth === 'detailed' || intent.expectedDepth === 'detailed') {
      const deepAnalysis = this.createDeepAnalysis(analysis);
      if (deepAnalysis) sections.push(deepAnalysis);
    }

    // 5. Add recommendations and next steps
    const recommendations = this.createRecommendations(analysis, intent);
    if (recommendations) sections.push(recommendations);

    // 6. Add technical details if requested
    if (options.includeTechnicalDetails && queryResult) {
      const technical = this.createTechnicalDetails(queryResult, analysis);
      if (technical) sections.push(technical);
    }

    return sections.filter(s => s).join('\n\n');
  }

  /**
   * Create natural context introduction
   */
  private createContextIntroduction(analysis: UnifiedResponse, intent: QueryIntent): string {
    const { semantic, statistical, metadata } = analysis;
    
    // Different intros based on query type
    switch (intent.queryType) {
      case 'summary':
        return this.createSummaryIntro(semantic, statistical, metadata);
      
      case 'analysis':
        return this.createAnalysisIntro(semantic, statistical);
      
      case 'extraction':
        return this.createExtractionIntro(semantic, statistical);
      
      case 'calculation':
        return this.createCalculationIntro(semantic, statistical);
      
      default:
        return semantic.summary;
    }
  }

  /**
   * Create summary introduction
   */
  private createSummaryIntro(semantic: any, statistical: any, metadata: any): string {
    const fileCount = metadata.filesAnalyzed.length;
    const fileNames = metadata.filesAnalyzed.join(', ');
    
    // Handle different file types naturally
    if (fileNames.toLowerCase().includes('.pdf')) {
      return `This ${semantic.context || 'document'} ${semantic.summary}`;
    }
    
    const totalRecords = Object.entries(statistical.metrics)
      .filter(([key]) => key.endsWith('_rows'))
      .reduce((sum, [, value]) => sum + (value as number), 0);
    
    if (totalRecords > 0) {
      return `This ${semantic.context || 'dataset'} contains ${totalRecords.toLocaleString()} records. ${semantic.summary}`;
    }
    
    return semantic.summary;
  }

  /**
   * Create analysis introduction
   */
  private createAnalysisIntro(semantic: any, statistical: any): string {
    if (statistical.patterns.length > 0) {
      return `Analyzing the ${semantic.context}, I've identified ${statistical.patterns.length} key patterns.`;
    }
    
    return `Let me analyze this ${semantic.context} for you.`;
  }

  /**
   * Create extraction introduction  
   */
  private createExtractionIntro(semantic: any, statistical: any): string {
    return `Here's the requested data from ${semantic.context}:`;
  }

  /**
   * Create calculation introduction
   */
  private createCalculationIntro(semantic: any, statistical: any): string {
    return `I've calculated the requested metrics from ${semantic.context}:`;
  }

  /**
   * Weave insights with data naturally
   */
  private weaveInsightsWithData(analysis: UnifiedResponse, queryResult?: QueryResult): string {
    const parts: string[] = [];
    const { semantic, statistical, presentation } = analysis;

    // Combine themes with statistics
    if (semantic.keyThemes.length > 0 && statistical.aggregations.length > 0) {
      const narrative = this.createThematicNarrative(semantic.keyThemes, statistical.aggregations);
      if (narrative) parts.push(narrative);
    }

    // Add pattern insights
    if (statistical.patterns.length > 0) {
      const patternNarrative = this.narratePatterns(statistical.patterns);
      if (patternNarrative) parts.push(patternNarrative);
    }

    // Add key metrics in natural language
    if (statistical.aggregations.length > 0) {
      const metricsNarrative = this.narrateKeyMetrics(statistical.aggregations);
      if (metricsNarrative) parts.push(metricsNarrative);
    }

    // Add insights from presentation layer
    if (presentation.insights.length > 0) {
      parts.push(this.formatInsights(presentation.insights));
    }

    return parts.join('\n\n');
  }

  /**
   * Create thematic narrative combining themes and data
   */
  private createThematicNarrative(themes: string[], aggregations: any[]): string {
    const topThemes = themes.slice(0, 3);
    const relevantStats = aggregations.slice(0, 3);
    
    let narrative = `The data reveals key themes around ${this.naturalList(topThemes)}.`;
    
    if (relevantStats.length > 0) {
      const statDescriptions = relevantStats.map(stat => {
        if (stat.column && stat.mean != null) {
          return `${this.humanizeColumnName(stat.column)} averaging ${this.formatValue(stat.mean)}`;
        }
        return null;
      }).filter(Boolean);
      
      if (statDescriptions.length > 0) {
        narrative += ` Key metrics include ${this.naturalList(statDescriptions)}.`;
      }
    }
    
    return narrative;
  }

  /**
   * Narrate patterns in natural language
   */
  private narratePatterns(patterns: string[]): string {
    if (patterns.length === 0) return '';
    
    if (patterns.length === 1) {
      return `The data shows ${patterns[0]}.`;
    }
    
    const topPatterns = patterns.slice(0, 3);
    return `Notable patterns include:\n${topPatterns.map(p => `• ${p}`).join('\n')}`;
  }

  /**
   * Narrate key metrics naturally
   */
  private narrateKeyMetrics(aggregations: any[]): string {
    const significantMetrics = aggregations
      .filter(agg => agg.mean != null || agg.sum != null)
      .slice(0, 4);
    
    if (significantMetrics.length === 0) return '';
    
    const descriptions = significantMetrics.map(metric => {
      const name = this.humanizeColumnName(metric.column);
      
      if (metric.sum != null && metric.count > 1) {
        return `total ${name.toLowerCase()} of ${this.formatValue(metric.sum)}`;
      }
      
      if (metric.mean != null) {
        return `average ${name.toLowerCase()} of ${this.formatValue(metric.mean)}`;
      }
      
      return null;
    }).filter(Boolean);
    
    if (descriptions.length === 0) return '';
    
    return `The data shows ${this.naturalList(descriptions)}.`;
  }

  /**
   * Format insights section
   */
  private formatInsights(insights: string[]): string {
    if (insights.length === 0) return '';
    
    if (insights.length === 1) {
      return insights[0];
    }
    
    return `Key insights:\n${insights.map(i => `${i}`).join('\n')}`;
  }

  /**
   * Format tables section
   */
  private formatTablesSection(analysis: UnifiedResponse, queryResult?: QueryResult): string {
    const tables: string[] = [];
    
    // Add result data table if available
    if (queryResult?.success && queryResult.data && queryResult.data.length > 0) {
      const dataTable = this.formatQueryResultTable(queryResult);
      if (dataTable) tables.push(dataTable);
    }
    
    // Add presentation tables
    for (const table of analysis.presentation.tables) {
      const formatted = this.formatPresentationTable(table);
      if (formatted) tables.push(formatted);
    }
    
    return tables.join('\n\n');
  }

  /**
   * Format query result as table
   */
  private formatQueryResultTable(result: QueryResult): string {
    if (!result.data || result.data.length === 0) return '';
    
    const columns = result.columns || Object.keys(result.data[0]);
    const displayData = result.data.slice(0, 20); // Limit to 20 rows for display
    
    // Build markdown table
    let table = '| ' + columns.map(col => this.humanizeColumnName(col)).join(' | ') + ' |\n';
    table += '|' + columns.map(() => '---').join('|') + '|\n';
    
    displayData.forEach(row => {
      table += '| ' + columns.map(col => this.formatCellValue(row[col])).join(' | ') + ' |\n';
    });
    
    if (result.data.length > 20) {
      table += `\n*Showing first 20 of ${result.data.length.toLocaleString()} results*`;
    }
    
    if (result.executionTime) {
      table += `\n*Query executed in ${result.executionTime.toFixed(2)}ms*`;
    }
    
    return table;
  }

  /**
   * Format presentation table
   */
  private formatPresentationTable(table: TableData): string {
    if (!table.rows || table.rows.length === 0) return '';
    
    let formatted = '';
    
    if (table.title) {
      formatted += `**${table.title}**\n\n`;
    }
    
    // Build markdown table
    formatted += '| ' + table.headers.join(' | ') + ' |\n';
    formatted += '|' + table.headers.map(() => '---').join('|') + '|\n';
    
    table.rows.forEach(row => {
      formatted += '| ' + row.map(cell => this.formatCellValue(cell)).join(' | ') + ' |\n';
    });
    
    if (table.caption) {
      formatted += `\n*${table.caption}*`;
    }
    
    return formatted;
  }

  /**
   * Create deep analysis section
   */
  private createDeepAnalysis(analysis: UnifiedResponse): string {
    const parts: string[] = [];
    const { semantic, statistical } = analysis;
    
    // Add entity analysis
    if (semantic.entities.length > 0) {
      parts.push(`**Entities Identified:** ${this.naturalList(semantic.entities)}`);
    }
    
    // Add relationship analysis
    if (semantic.relationships.length > 0) {
      parts.push(`**Relationships:** ${semantic.relationships.join('; ')}`);
    }
    
    // Add distribution analysis
    if (statistical.distributions.length > 0) {
      parts.push(this.narrateDistributions(statistical.distributions));
    }
    
    return parts.join('\n\n');
  }

  /**
   * Create recommendations section
   */
  private createRecommendations(analysis: UnifiedResponse, intent: QueryIntent): string {
    const recommendations = analysis.presentation.recommendations;
    
    if (recommendations.length === 0) return '';
    
    if (intent.expectedDepth === 'brief') {
      // Just one recommendation for brief responses
      return `💡 ${recommendations[0]}`;
    }
    
    return `**Recommendations:**\n${recommendations.map(r => `• ${r}`).join('\n')}`;
  }

  /**
   * Create technical details section
   */
  private createTechnicalDetails(queryResult: QueryResult, analysis: UnifiedResponse): string {
    const details: string[] = [];
    
    if (queryResult.executionTime) {
      details.push(`Query Time: ${queryResult.executionTime.toFixed(2)}ms`);
    }
    
    if (analysis.metadata.processingTime) {
      details.push(`Processing Time: ${analysis.metadata.processingTime}ms`);
    }
    
    if (analysis.confidence) {
      details.push(`Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
    }
    
    if (details.length === 0) return '';
    
    return `\n---\n*Technical: ${details.join(' | ')}*`;
  }

  /**
   * Compose table-only response
   */
  private composeTableOnlyResponse(analysis: UnifiedResponse, queryResult?: QueryResult): string {
    const tables: string[] = [];
    
    // Priority to query results
    if (queryResult?.success && queryResult.data) {
      const table = this.formatQueryResultTable(queryResult);
      if (table) tables.push(table);
    }
    
    // Add any presentation tables
    for (const table of analysis.presentation.tables) {
      const formatted = this.formatPresentationTable(table);
      if (formatted) tables.push(formatted);
    }
    
    return tables.join('\n\n') || 'No tabular data available.';
  }

  /**
   * Compose specific answer response
   */
  private composeSpecificAnswer(
    analysis: UnifiedResponse,
    queryResult: QueryResult | undefined,
    intent: QueryIntent
  ): string {
    // Check if we have a single-value result
    if (queryResult?.data && queryResult.data.length === 1) {
      const row = queryResult.data[0];
      const values = Object.values(row);
      
      if (values.length === 1) {
        // Single value - just return it
        return this.formatValue(values[0]);
      }
    }
    
    // Check for specific metric in analysis
    const specificMetric = intent.specificRequests[0]?.metric;
    if (specificMetric && analysis.statistical.metrics[specificMetric]) {
      return this.formatValue(analysis.statistical.metrics[specificMetric]);
    }
    
    // Fall back to brief narrative
    return analysis.presentation.narrative.split('.')[0] + '.';
  }

  /**
   * Compose narrative-only response
   */
  private composeNarrativeOnlyResponse(analysis: UnifiedResponse, intent: QueryIntent): string {
    const parts: string[] = [];
    
    // Full narrative without tables
    parts.push(analysis.presentation.narrative);
    
    // Add insights as narrative
    if (analysis.presentation.insights.length > 0) {
      parts.push(analysis.presentation.insights.join(' '));
    }
    
    // Add recommendations if not brief
    if (intent.expectedDepth !== 'brief' && analysis.presentation.recommendations.length > 0) {
      parts.push(analysis.presentation.recommendations.join(' '));
    }
    
    return parts.filter(p => p).join('\n\n');
  }

  /**
   * Helper: Should include tables
   */
  private shouldIncludeTables(
    intent: QueryIntent,
    analysis: UnifiedResponse,
    queryResult?: QueryResult
  ): boolean {
    // Never include for narrative-only
    if (intent.formatPreference === 'narrative-only') return false;
    
    // Always include for table-only
    if (intent.formatPreference === 'table-only') return true;
    
    // Include if we have meaningful data
    const hasQueryData = queryResult?.success && queryResult?.data && queryResult.data.length > 0;
    const hasPresentationTables = analysis.presentation.tables.length > 0;
    
    return hasQueryData || hasPresentationTables;
  }

  /**
   * Utility functions
   */
  private humanizeColumnName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private formatValue(value: any): string {
    if (value == null) return '-';
    
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return value.toLocaleString();
      }
      
      // Check if it looks like currency
      if (Math.abs(value) >= 100) {
        return '$' + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      
      // Check if it looks like percentage
      if (Math.abs(value) <= 1) {
        return (value * 100).toFixed(1) + '%';
      }
      
      return value.toFixed(2);
    }
    
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    
    return String(value);
  }

  private formatCellValue(value: any): string {
    if (value == null) return '';
    
    const formatted = this.formatValue(value);
    
    // Escape pipe characters for markdown tables
    return formatted.replace(/\|/g, '\\|');
  }

  private naturalList(items: string[]): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  private narrateDistributions(distributions: any[]): string {
    if (distributions.length === 0) return '';
    
    const descriptions = distributions.map(dist => {
      return `${dist.column} distribution: ${dist.description}`;
    });
    
    return `**Data Distribution:**\n${descriptions.join('\n')}`;
  }
}

// Export singleton instance
export const responseComposer = new ResponseComposer();