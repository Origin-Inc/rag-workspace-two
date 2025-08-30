import type { 
  DatabaseBlock, 
  DatabaseColumn, 
  DatabaseRow, 
  Filter, 
  Sort 
} from '~/types/database-block';

export interface DatabaseContext {
  blockId: string;
  blockName: string;
  description?: string;
  schema: DatabaseSchemaContext;
  dataAnalysis: DataAnalysisContext;
  filters?: Filter[];
  sorts?: Sort[];
  metadata: {
    rowCount: number;
    columnCount: number;
    createdAt: string;
    updatedAt: string;
  };
}

export interface DatabaseSchemaContext {
  columns: ColumnContext[];
}

export interface ColumnContext {
  name: string;
  type: string;
  isPrimary?: boolean;
  isRequired?: boolean;
  isUnique?: boolean;
  options?: any;
}

export interface DataAnalysisContext {
  sampleData: Record<string, any>[];
  columnStatistics: Record<string, ColumnStatistics>;
  dataTypes: Record<string, string>;
}

export interface ColumnStatistics {
  uniqueValues?: number;
  nullCount?: number;
  minValue?: any;
  maxValue?: any;
  avgValue?: number;
  mostCommon?: { value: any; count: number }[];
}

export class DatabaseContextExtractor {
  /**
   * Extract comprehensive context from a database block for AI analysis
   */
  static extractContext(
    databaseBlock: DatabaseBlock,
    columns: DatabaseColumn[],
    rows: DatabaseRow[],
    filters?: Filter[],
    sorts?: Sort[]
  ): DatabaseContext {
    const sampleRows = rows.slice(0, 10); // Get first 10 rows as sample
    
    const schema = this.extractSchema(columns);
    const dataAnalysis = this.analyzeData(columns, rows, sampleRows);
    
    return {
      blockId: databaseBlock.id,
      blockName: databaseBlock.name,
      description: databaseBlock.description,
      schema,
      dataAnalysis,
      filters,
      sorts,
      metadata: {
        rowCount: rows.length,
        columnCount: columns.length,
        createdAt: databaseBlock.createdAt,
        updatedAt: databaseBlock.updatedAt
      }
    };
  }

  /**
   * Extract schema information from columns
   */
  private static extractSchema(columns: DatabaseColumn[]): DatabaseSchemaContext {
    return {
      columns: columns.map(col => ({
        name: col.name,
        type: col.type,
        isPrimary: col.isPrimary,
        isRequired: col.isRequired,
        isUnique: col.isUnique,
        options: col.options
      }))
    };
  }

  /**
   * Analyze data to provide statistical context
   */
  private static analyzeData(
    columns: DatabaseColumn[],
    rows: DatabaseRow[],
    sampleRows: DatabaseRow[]
  ): DataAnalysisContext {
    const columnStatistics: Record<string, ColumnStatistics> = {};
    const dataTypes: Record<string, string> = {};
    
    // Analyze each column
    columns.forEach(column => {
      const columnId = column.columnId || column.id;
      const values = rows.map(row => row.data[columnId]).filter(v => v !== null && v !== undefined);
      
      dataTypes[column.name] = column.type;
      
      const stats: ColumnStatistics = {
        uniqueValues: new Set(values).size,
        nullCount: rows.length - values.length
      };
      
      // Type-specific analysis
      switch (column.type) {
        case 'number':
        case 'currency':
        case 'percent':
          const numbers = values.map(Number).filter(n => !isNaN(n));
          if (numbers.length > 0) {
            stats.minValue = Math.min(...numbers);
            stats.maxValue = Math.max(...numbers);
            stats.avgValue = numbers.reduce((a, b) => a + b, 0) / numbers.length;
          }
          break;
          
        case 'date':
        case 'datetime':
          const dates = values.map(v => new Date(v)).filter(d => !isNaN(d.getTime()));
          if (dates.length > 0) {
            stats.minValue = new Date(Math.min(...dates.map(d => d.getTime())));
            stats.maxValue = new Date(Math.max(...dates.map(d => d.getTime())));
          }
          break;
          
        case 'select':
        case 'multi_select':
        case 'text':
          // Find most common values
          const valueCounts = new Map<any, number>();
          values.forEach(value => {
            valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
          });
          
          stats.mostCommon = Array.from(valueCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([value, count]) => ({ value, count }));
          break;
      }
      
      columnStatistics[column.name] = stats;
    });
    
    // Convert sample rows to use column names instead of IDs
    const sampleData = sampleRows.map(row => {
      const namedRow: Record<string, any> = {};
      columns.forEach(column => {
        const columnId = column.columnId || column.id;
        namedRow[column.name] = row.data[columnId];
      });
      return namedRow;
    });
    
    return {
      sampleData,
      columnStatistics,
      dataTypes
    };
  }

  /**
   * Generate a natural language summary of the database context
   */
  static generateContextSummary(context: DatabaseContext): string {
    const { blockName, metadata, schema, dataAnalysis } = context;
    
    let summary = `Database "${blockName}" contains ${metadata.rowCount} rows and ${metadata.columnCount} columns. `;
    
    // Describe columns
    summary += `The columns are: ${schema.columns.map(c => `${c.name} (${c.type})`).join(', ')}. `;
    
    // Add filter information if present
    if (context.filters && context.filters.length > 0) {
      summary += `Currently filtered by ${context.filters.length} condition(s). `;
    }
    
    // Add sort information if present
    if (context.sorts && context.sorts.length > 0) {
      summary += `Sorted by ${context.sorts.map(s => `${s.columnId} ${s.direction}`).join(', ')}. `;
    }
    
    // Add some basic statistics
    const numericColumns = schema.columns.filter(c => 
      ['number', 'currency', 'percent'].includes(c.type)
    );
    
    if (numericColumns.length > 0) {
      summary += `Numeric columns available for analysis: ${numericColumns.map(c => c.name).join(', ')}. `;
    }
    
    return summary;
  }

  /**
   * Generate a structured prompt for AI analysis
   */
  static generateAIPrompt(context: DatabaseContext): string {
    const summary = this.generateContextSummary(context);
    
    return `You are analyzing a database with the following context:

${summary}

Database Schema:
${JSON.stringify(context.schema, null, 2)}

Sample Data (first 10 rows):
${JSON.stringify(context.dataAnalysis.sampleData, null, 2)}

Column Statistics:
${JSON.stringify(context.dataAnalysis.columnStatistics, null, 2)}

Please provide insights, patterns, and recommendations based on this data. Focus on:
1. Data quality and completeness
2. Interesting patterns or correlations
3. Potential visualizations that would be useful
4. Suggested analyses or queries
5. Any data anomalies or concerns`;
  }
}