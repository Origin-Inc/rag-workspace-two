/**
 * Query Result Chart Generator
 * Converts SQL query results into Recharts-compatible chart data
 */

import { enhancedChartSelector, type ChartRecommendation, type QueryResultMetadata } from './enhanced-chart-selector.server';
import type { ChartType } from './chart-generator.server';
import type { ChartData } from '~/components/blocks/ChartOutputBlock';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('query-result-chart-generator');

export interface ChartGenerationResult {
  shouldChart: boolean;
  chartData?: ChartData;
  chartType?: ChartType;
  chartTitle?: string;
  chartDescription?: string;
  confidence: number;
  reasoning: string;
}

export class QueryResultChartGenerator {
  /**
   * Analyze query results and generate chart if appropriate
   */
  async generateChartFromQueryResult(
    query: string,
    queryResults: {
      data: any[];
      columns?: string[];
      sql?: string;
      rowCount?: number;
    }
  ): Promise<ChartGenerationResult> {
    try {
      const { data, columns, rowCount } = queryResults;

      if (!data || data.length === 0) {
        return {
          shouldChart: false,
          confidence: 1.0,
          reasoning: 'No data to visualize'
        };
      }

      // Build metadata
      const metadata: QueryResultMetadata = {
        columns: columns || Object.keys(data[0]),
        sampleData: data.slice(0, 10),
        rowCount: rowCount || data.length,
        dataTypes: enhancedChartSelector.inferDataTypes(data)
      };

      // Check if we should visualize
      const shouldViz = await enhancedChartSelector.shouldVisualize(query, metadata);

      if (!shouldViz.should) {
        logger.trace('Skipping visualization', {
          query: query.slice(0, 100),
          reason: shouldViz.reason
        });

        return {
          shouldChart: false,
          confidence: shouldViz.confidence,
          reasoning: shouldViz.reason
        };
      }

      // Get AI recommendation for chart type
      const recommendation = await enhancedChartSelector.selectChartType(query, metadata);

      // Convert to Recharts format
      const chartData = this.convertToRechartsFormat(
        data,
        recommendation,
        metadata
      );

      logger.trace('Chart generated successfully', {
        query: query.slice(0, 100),
        chartType: recommendation.chartType,
        confidence: recommendation.confidence
      });

      return {
        shouldChart: true,
        chartData,
        chartType: recommendation.chartType,
        chartTitle: recommendation.title,
        chartDescription: recommendation.reasoning,
        confidence: recommendation.confidence,
        reasoning: recommendation.reasoning
      };
    } catch (error) {
      logger.error('Chart generation failed', error);
      return {
        shouldChart: false,
        confidence: 0,
        reasoning: `Chart generation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Convert query results to Recharts data format
   */
  private convertToRechartsFormat(
    data: any[],
    recommendation: ChartRecommendation,
    metadata: QueryResultMetadata
  ): ChartData {
    const { chartType, xAxis, yAxis } = recommendation;

    // For pie charts, format differently
    if (chartType === 'pie') {
      const pieData = data.map(row => ({
        name: String(row[xAxis] || 'Unknown'),
        value: Number(row[yAxis as string]) || 0
      }));

      return {
        datasets: [{
          label: String(yAxis),
          data: pieData
        }]
      };
    }

    // For other charts (bar, line, area, scatter, radar)
    const yAxes = Array.isArray(yAxis) ? yAxis : [yAxis];

    // Transform data for Recharts format
    const rechartsData = data.map(row => {
      const point: any = { name: String(row[xAxis] || '') };

      yAxes.forEach(yCol => {
        point[yCol] = Number(row[yCol]) || 0;
      });

      // Add groupBy/colorBy if specified
      if (recommendation.groupBy) {
        point.group = String(row[recommendation.groupBy] || '');
      }

      return point;
    });

    // Create datasets
    const datasets = yAxes.map(yCol => ({
      label: yCol,
      data: rechartsData.map(d => d[yCol]),
      backgroundColor: this.getChartColors(yAxes.length),
      borderColor: this.getChartColors(yAxes.length, 1.0)
    }));

    return {
      labels: rechartsData.map(d => d.name),
      datasets
    };
  }

  /**
   * Get chart colors for datasets
   */
  private getChartColors(count: number, opacity: number = 0.6): string[] {
    const colors = [
      `rgba(59, 130, 246, ${opacity})`,   // blue-500
      `rgba(239, 68, 68, ${opacity})`,    // red-500
      `rgba(34, 197, 94, ${opacity})`,    // green-500
      `rgba(234, 179, 8, ${opacity})`,    // yellow-500
      `rgba(168, 85, 247, ${opacity})`,   // purple-500
      `rgba(249, 115, 22, ${opacity})`,   // orange-500
      `rgba(20, 184, 166, ${opacity})`,   // teal-500
      `rgba(236, 72, 153, ${opacity})`    // pink-500
    ];

    return Array.from({ length: count }, (_, i) => colors[i % colors.length]);
  }

  /**
   * Generate chart markdown for embedding in chat responses
   */
  generateChartMarkdown(
    chartData: ChartData,
    chartType: ChartType,
    title?: string,
    description?: string
  ): string {
    const chartId = `chart_${Date.now()}`;

    let markdown = `\n\n### ${title || 'Data Visualization'}\n\n`;

    if (description) {
      markdown += `_${description}_\n\n`;
    }

    // Embed chart data as JSON in a code block with special marker
    // The frontend can detect this and render it as an actual chart
    markdown += `\`\`\`chart:${chartType}\n`;
    markdown += JSON.stringify({
      id: chartId,
      type: chartType,
      data: chartData,
      title,
      description
    }, null, 2);
    markdown += `\n\`\`\`\n`;

    return markdown;
  }
}

export const queryResultChartGenerator = new QueryResultChartGenerator();
