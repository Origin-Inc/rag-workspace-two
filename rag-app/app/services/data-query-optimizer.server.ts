import type { DataFile } from '~/atoms/chat-atoms';
import type { QueryIntent } from './query-intent-analyzer.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('data-query-optimizer');

export interface OptimizedQueryResult {
  relevantRows: any[];
  totalRowsQueried: number;
  query: string;
  explanation: string;
  columns: string[];
  statistics?: {
    count: number;
    averages?: Record<string, number>;
    sums?: Record<string, number>;
    min?: Record<string, number>;
    max?: Record<string, number>;
  };
}

export class DataQueryOptimizer {
  /**
   * Analyze query and extract only relevant data instead of sending everything
   */
  static async optimizeDataQuery(
    userQuery: string,
    files: DataFile[],
    intent: QueryIntent
  ): Promise<OptimizedQueryResult> {
    const startTime = Date.now();
    
    logger.trace('[Optimizer] Starting query optimization', {
      query: userQuery,
      filesCount: files.length,
      intent: intent.queryType
    });
    
    // Find CSV/structured data files
    const dataFiles = files.filter(f => f.type === 'csv' || (f.data && Array.isArray(f.data)));
    
    if (dataFiles.length === 0) {
      return {
        relevantRows: [],
        totalRowsQueried: 0,
        query: '',
        explanation: 'No structured data files available for querying',
        columns: []
      };
    }
    
    const primaryFile = dataFiles[0];
    const data = primaryFile.data || primaryFile.sampleData || [];
    
    // Extract columns
    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    
    // Analyze query to determine what data is needed
    const queryAnalysis = this.analyzeQueryRequirements(userQuery, columns);
    
    // Extract relevant data based on query type
    let relevantData: any[] = [];
    let statistics: any = {};
    
    switch (queryAnalysis.type) {
      case 'aggregate':
        // For aggregations, calculate stats and return summary
        statistics = this.calculateStatistics(data, queryAnalysis.columns);
        relevantData = this.createStatisticsSummary(statistics, queryAnalysis.columns);
        break;
        
      case 'filter':
        // For filters, apply conditions and return matching rows
        relevantData = this.applyFilters(data, queryAnalysis.conditions);
        break;
        
      case 'sample':
        // For general queries, return a representative sample
        relevantData = this.getRepresentativeSample(data, 20);
        break;
        
      case 'top':
        // For top/bottom queries, sort and return relevant rows
        relevantData = this.getTopRows(data, queryAnalysis.sortBy, queryAnalysis.limit);
        break;
        
      default:
        // Default to first 10 rows
        relevantData = data.slice(0, 10);
    }
    
    const processingTime = Date.now() - startTime;
    
    logger.trace('[Optimizer] Query optimization complete', {
      originalRows: data.length,
      relevantRows: relevantData.length,
      processingTimeMs: processingTime,
      queryType: queryAnalysis.type
    });
    
    return {
      relevantRows: relevantData,
      totalRowsQueried: data.length,
      query: queryAnalysis.suggestedSQL || userQuery,
      explanation: queryAnalysis.explanation,
      columns,
      statistics: queryAnalysis.type === 'aggregate' ? statistics : undefined
    };
  }
  
  /**
   * Analyze what the query is asking for
   */
  private static analyzeQueryRequirements(query: string, columns: string[]) {
    const queryLower = query.toLowerCase();
    
    // Check for aggregation keywords
    if (/average|mean|sum|total|count|min|max|statistics/i.test(query)) {
      const numericColumns = this.identifyNumericColumns(columns);
      return {
        type: 'aggregate',
        columns: numericColumns,
        explanation: 'Calculating statistical summaries',
        suggestedSQL: `SELECT ${numericColumns.map(c => `AVG(${c}), SUM(${c}), MIN(${c}), MAX(${c})`).join(', ')} FROM data`
      };
    }
    
    // Check for filter conditions
    if (/where|filter|containing|matching|equals|greater|less|between/i.test(query)) {
      return {
        type: 'filter',
        conditions: this.extractFilterConditions(query, columns),
        explanation: 'Filtering data based on conditions',
        suggestedSQL: `SELECT * FROM data WHERE [conditions]`
      };
    }
    
    // Check for top/bottom queries
    if (/top|bottom|highest|lowest|most|least|first|last/i.test(query)) {
      const limit = this.extractLimit(query) || 10;
      return {
        type: 'top',
        sortBy: this.extractSortColumn(query, columns),
        limit,
        explanation: `Returning top ${limit} results`,
        suggestedSQL: `SELECT * FROM data ORDER BY [column] DESC LIMIT ${limit}`
      };
    }
    
    // Default to sample
    return {
      type: 'sample',
      explanation: 'Returning a representative sample of the data',
      suggestedSQL: 'SELECT * FROM data LIMIT 20'
    };
  }
  
  /**
   * Calculate statistics for numeric columns
   */
  private static calculateStatistics(data: any[], columns: string[]): any {
    const stats: any = {
      count: data.length,
      averages: {},
      sums: {},
      min: {},
      max: {}
    };
    
    // Only calculate for numeric columns
    const numericColumns = columns.filter(col => {
      const sampleValue = data[0]?.[col];
      return typeof sampleValue === 'number' || !isNaN(Number(sampleValue));
    });
    
    numericColumns.forEach(col => {
      const values = data.map(row => Number(row[col])).filter(v => !isNaN(v));
      
      if (values.length > 0) {
        stats.averages[col] = values.reduce((a, b) => a + b, 0) / values.length;
        stats.sums[col] = values.reduce((a, b) => a + b, 0);
        stats.min[col] = Math.min(...values);
        stats.max[col] = Math.max(...values);
      }
    });
    
    return stats;
  }
  
  /**
   * Create a summary table from statistics
   */
  private static createStatisticsSummary(stats: any, columns: string[]): any[] {
    const summary: any[] = [];
    
    // Create summary rows
    const metrics = ['averages', 'sums', 'min', 'max'];
    
    metrics.forEach(metric => {
      if (stats[metric] && Object.keys(stats[metric]).length > 0) {
        summary.push({
          metric: metric.charAt(0).toUpperCase() + metric.slice(1),
          ...stats[metric]
        });
      }
    });
    
    // Add total count
    summary.unshift({
      metric: 'Total Count',
      value: stats.count
    });
    
    return summary;
  }
  
  /**
   * Apply filters based on query conditions
   */
  private static applyFilters(data: any[], conditions: any): any[] {
    // For now, return first 50 rows as a simple implementation
    // In production, this would parse and apply actual conditions
    return data.slice(0, 50);
  }
  
  /**
   * Get a representative sample of data
   */
  private static getRepresentativeSample(data: any[], sampleSize: number): any[] {
    if (data.length <= sampleSize) {
      return data;
    }
    
    // Take evenly distributed samples
    const step = Math.floor(data.length / sampleSize);
    const sample: any[] = [];
    
    for (let i = 0; i < data.length && sample.length < sampleSize; i += step) {
      sample.push(data[i]);
    }
    
    return sample;
  }
  
  /**
   * Get top rows based on sorting
   */
  private static getTopRows(data: any[], sortBy: string | null, limit: number): any[] {
    if (!sortBy || !data[0]?.[sortBy]) {
      return data.slice(0, limit);
    }
    
    // Sort and return top rows
    const sorted = [...data].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return bVal - aVal; // Descending for numbers
      }
      
      return String(bVal).localeCompare(String(aVal));
    });
    
    return sorted.slice(0, limit);
  }
  
  // Helper methods
  
  private static identifyNumericColumns(columns: string[]): string[] {
    return columns.filter(col => 
      /amount|price|cost|value|count|quantity|total|sum|avg|mean/i.test(col)
    );
  }
  
  private static extractFilterConditions(query: string, columns: string[]): any {
    // Simple implementation - in production would use proper parsing
    return {};
  }
  
  private static extractLimit(query: string): number | null {
    const match = query.match(/top\s+(\d+)|first\s+(\d+)|last\s+(\d+)/i);
    if (match) {
      return parseInt(match[1] || match[2] || match[3]);
    }
    return null;
  }
  
  private static extractSortColumn(query: string, columns: string[]): string | null {
    // Look for column mentions in the query
    for (const col of columns) {
      if (query.toLowerCase().includes(col.toLowerCase())) {
        return col;
      }
    }
    return null;
  }
  
  /**
   * Format optimized data for AI consumption
   */
  static formatForAI(result: OptimizedQueryResult): string {
    let formatted = `Query Analysis: ${result.explanation}\n`;
    formatted += `Total Rows in Dataset: ${result.totalRowsQueried}\n`;
    formatted += `Relevant Rows Extracted: ${result.relevantRows.length}\n\n`;
    
    if (result.statistics) {
      formatted += 'Statistical Summary:\n';
      formatted += `- Total Count: ${result.statistics.count}\n`;
      
      if (result.statistics.averages && Object.keys(result.statistics.averages).length > 0) {
        formatted += '- Averages:\n';
        Object.entries(result.statistics.averages).forEach(([col, val]) => {
          formatted += `  - ${col}: ${val}\n`;
        });
      }
      
      formatted += '\n';
    }
    
    if (result.relevantRows.length > 0) {
      formatted += 'Data Sample:\n';
      formatted += this.tableToString(result.relevantRows);
    }
    
    return formatted;
  }
  
  private static tableToString(data: any[]): string {
    if (data.length === 0) return 'No data';
    
    const columns = Object.keys(data[0]);
    let table = columns.join(' | ') + '\n';
    table += columns.map(() => '---').join(' | ') + '\n';
    
    data.forEach(row => {
      table += columns.map(col => String(row[col] || '')).join(' | ') + '\n';
    });
    
    return table;
  }
}