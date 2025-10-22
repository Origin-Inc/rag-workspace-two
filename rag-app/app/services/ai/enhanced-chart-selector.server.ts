/**
 * Enhanced AI-Powered Chart Type Selection Service
 * Uses GPT to intelligently select optimal chart types based on data structure and user intent
 */

import { openai, isOpenAIConfigured } from '../openai.server';
import { aiModelConfig } from '../ai-model-config.server';
import type { ChartType } from './chart-generator.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('enhanced-chart-selector');

export interface ChartRecommendation {
  chartType: ChartType;
  xAxis: string;
  yAxis: string | string[];
  groupBy?: string;
  colorBy?: string;
  confidence: number;
  reasoning: string;
  title?: string;
  alternativeTypes?: ChartType[];
}

export interface QueryResultMetadata {
  columns: string[];
  sampleData: any[];
  rowCount: number;
  dataTypes: Record<string, 'number' | 'string' | 'date' | 'boolean'>;
}

export class EnhancedChartSelector {
  /**
   * Determine if a query result should be visualized as a chart
   */
  async shouldVisualize(
    query: string,
    metadata: QueryResultMetadata
  ): Promise<{ should: boolean; confidence: number; reason: string }> {
    // Quick heuristics first
    const hasNumericData = Object.values(metadata.dataTypes).some(t => t === 'number');
    const hasReasonableRowCount = metadata.rowCount > 0 && metadata.rowCount <= 1000;
    const hasMultipleColumns = metadata.columns.length >= 2;

    if (!hasNumericData || !hasReasonableRowCount || !hasMultipleColumns) {
      return {
        should: false,
        confidence: 0.9,
        reason: hasNumericData ?
          'Too many rows for effective visualization' :
          'No numeric data to visualize'
      };
    }

    // Use keywords to detect visualization intent
    const visualizationKeywords = [
      'show', 'visualize', 'chart', 'graph', 'plot',
      'trend', 'distribution', 'comparison', 'over time',
      'breakdown', 'top', 'bottom', 'highest', 'lowest',
      'average', 'sum', 'count', 'growth', 'change'
    ];

    const queryLower = query.toLowerCase();
    const hasVisualizationIntent = visualizationKeywords.some(keyword =>
      queryLower.includes(keyword)
    );

    if (hasVisualizationIntent) {
      return {
        should: true,
        confidence: 0.95,
        reason: 'Query explicitly requests visualization'
      };
    }

    // For aggregation queries (single row), visualization is less useful
    if (metadata.rowCount === 1 && metadata.columns.length <= 3) {
      return {
        should: false,
        confidence: 0.7,
        reason: 'Single aggregation result - better as table'
      };
    }

    // Default: visualize if we have good data structure
    return {
      should: true,
      confidence: 0.6,
      reason: 'Data structure suitable for visualization'
    };
  }

  /**
   * Select optimal chart type using AI
   */
  async selectChartType(
    query: string,
    metadata: QueryResultMetadata
  ): Promise<ChartRecommendation> {
    // PERFORMANCE OPTIMIZATION: Check for explicit chart type mentions first
    // This avoids the slow OpenAI API call (11s+) when user explicitly requests a chart type
    const queryLower = query.toLowerCase();
    const explicitChartTypes: Array<{ keywords: string[]; type: ChartType }> = [
      { keywords: ['bar chart', 'bar graph', 'column chart'], type: 'bar' },
      { keywords: ['line chart', 'line graph', 'trend line'], type: 'line' },
      { keywords: ['pie chart', 'pie graph', 'donut chart'], type: 'pie' },
      { keywords: ['scatter plot', 'scatter chart', 'scatter graph'], type: 'scatter' },
      { keywords: ['area chart', 'area graph'], type: 'area' },
      { keywords: ['radar chart', 'radar graph', 'spider chart'], type: 'radar' }
    ];

    for (const { keywords, type } of explicitChartTypes) {
      if (keywords.some(keyword => queryLower.includes(keyword))) {
        logger.trace('Explicit chart type detected in query, skipping AI call', {
          query: query.slice(0, 100),
          detectedType: type
        });

        // Use fast fallback logic but override the chart type
        const fallback = this.fallbackSelection(metadata);
        return {
          ...fallback,
          chartType: type,
          confidence: 0.95, // High confidence since user explicitly requested it
          reasoning: `User explicitly requested a ${type} chart`
        };
      }
    }

    if (!isOpenAIConfigured()) {
      return this.fallbackSelection(metadata);
    }

    try {
      const prompt = this.buildSelectionPrompt(query, metadata);

      const response = await openai.chat.completions.create({
        model: await aiModelConfig.getModelName(),
        messages: [
          {
            role: 'system',
            content: `You are an expert data visualization consultant. Recommend the best chart type for displaying data based on the query and data structure.

Available chart types: bar, line, pie, scatter, area, radar

Consider:
- Data relationships (temporal, categorical, proportional, correlation)
- Number of data points
- User intent from the query
- Best practices for data visualization

Respond in JSON format with:
{
  "chartType": "bar|line|pie|scatter|area|radar",
  "xAxis": "column_name",
  "yAxis": "column_name" or ["col1", "col2"],
  "groupBy": "column_name" (optional),
  "colorBy": "column_name" (optional),
  "confidence": 0.0-1.0,
  "reasoning": "explanation",
  "title": "suggested chart title",
  "alternativeTypes": ["type1", "type2"] (optional)
}`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3 // Lower temperature for more deterministic recommendations
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      logger.trace('AI chart selection', {
        query: query.slice(0, 100),
        recommendation: result.chartType,
        confidence: result.confidence
      });

      return result as ChartRecommendation;
    } catch (error) {
      logger.error('AI chart selection failed, using fallback', error);
      return this.fallbackSelection(metadata);
    }
  }

  /**
   * Build prompt for AI chart selection
   */
  private buildSelectionPrompt(
    query: string,
    metadata: QueryResultMetadata
  ): string {
    const sample = metadata.sampleData.slice(0, 5);
    const dataTypesStr = Object.entries(metadata.dataTypes)
      .map(([col, type]) => `  ${col}: ${type}`)
      .join('\n');

    return `User Query: "${query}"

Data Structure:
- Total Rows: ${metadata.rowCount}
- Columns (${metadata.columns.length}):
${dataTypesStr}

Sample Data (first 5 rows):
${JSON.stringify(sample, null, 2)}

Recommend the best chart type and configuration.`;
  }

  /**
   * Fallback chart selection using heuristics (no AI)
   */
  private fallbackSelection(metadata: QueryResultMetadata): ChartRecommendation {
    const { columns, dataTypes, rowCount, sampleData } = metadata;

    // Find numeric and categorical columns
    const numericCols = columns.filter(c => dataTypes[c] === 'number');
    const dateCols = columns.filter(c => dataTypes[c] === 'date');
    const categoricalCols = columns.filter(c =>
      dataTypes[c] === 'string' && c !== 'id'
    );

    // Time series detection
    if (dateCols.length > 0 && numericCols.length > 0) {
      return {
        chartType: 'line',
        xAxis: dateCols[0],
        yAxis: numericCols[0],
        confidence: 0.8,
        reasoning: 'Detected time series data',
        title: `${numericCols[0]} over ${dateCols[0]}`
      };
    }

    // Pie chart for small categorical breakdowns
    if (rowCount <= 8 && categoricalCols.length > 0 && numericCols.length > 0) {
      return {
        chartType: 'pie',
        xAxis: categoricalCols[0],
        yAxis: numericCols[0],
        confidence: 0.7,
        reasoning: 'Small categorical breakdown suitable for pie chart',
        title: `Distribution of ${numericCols[0]} by ${categoricalCols[0]}`
      };
    }

    // Bar chart for categorical comparisons
    if (categoricalCols.length > 0 && numericCols.length > 0) {
      return {
        chartType: 'bar',
        xAxis: categoricalCols[0],
        yAxis: numericCols[0],
        confidence: 0.75,
        reasoning: 'Categorical data with numeric values - ideal for bar chart',
        title: `${numericCols[0]} by ${categoricalCols[0]}`
      };
    }

    // Scatter for correlation between two numeric variables
    if (numericCols.length >= 2) {
      return {
        chartType: 'scatter',
        xAxis: numericCols[0],
        yAxis: numericCols[1],
        confidence: 0.6,
        reasoning: 'Multiple numeric variables - checking for correlation',
        title: `${numericCols[1]} vs ${numericCols[0]}`
      };
    }

    // Default to bar chart
    return {
      chartType: 'bar',
      xAxis: columns[0],
      yAxis: numericCols[0] || columns[1],
      confidence: 0.5,
      reasoning: 'Default visualization choice',
      title: 'Data Visualization'
    };
  }

  /**
   * Infer data types from sample data
   */
  inferDataTypes(data: any[]): Record<string, 'number' | 'string' | 'date' | 'boolean'> {
    if (data.length === 0) return {};

    const columns = Object.keys(data[0]);
    const types: Record<string, 'number' | 'string' | 'date' | 'boolean'> = {};

    columns.forEach(col => {
      const values = data.slice(0, 10).map(row => row[col]).filter(v => v != null);

      if (values.length === 0) {
        types[col] = 'string';
        return;
      }

      // Check for booleans
      if (values.every(v => typeof v === 'boolean')) {
        types[col] = 'boolean';
        return;
      }

      // Check for numbers
      if (values.every(v => typeof v === 'number')) {
        types[col] = 'number';
        return;
      }

      // Check for dates
      const datePattern = /^\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/;
      if (values.every(v => typeof v === 'string' && datePattern.test(v))) {
        types[col] = 'date';
        return;
      }

      // Default to string
      types[col] = 'string';
    });

    return types;
  }
}

export const enhancedChartSelector = new EnhancedChartSelector();
