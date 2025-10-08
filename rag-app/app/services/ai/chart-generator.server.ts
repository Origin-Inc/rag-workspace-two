/**
 * Chart Generation Service
 * Intelligently creates charts from text, tables, and data blocks
 */

import { openai, isOpenAIConfigured } from '../openai.server';
import { aiModelConfig } from '../ai-model-config.server';
import type { Block } from '~/components/editor/EnhancedBlockEditor';

export type ChartType = 
  | 'bar'
  | 'line'
  | 'pie'
  | 'scatter'
  | 'area'
  | 'radar'
  | 'doughnut';

export interface ChartConfig {
  type: ChartType;
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string | string[];
      borderWidth?: number;
    }[];
  };
  options: {
    responsive: boolean;
    plugins?: {
      legend?: {
        display: boolean;
        position?: 'top' | 'bottom' | 'left' | 'right';
      };
      title?: {
        display: boolean;
        text?: string;
      };
    };
    scales?: any;
  };
}

export interface ExtractedData {
  headers: string[];
  rows: (string | number)[][];
  dataType: 'numeric' | 'mixed' | 'categorical';
  suggestedChartType: ChartType;
}

export class ChartGenerator {
  private static instance: ChartGenerator;

  private constructor() {}

  static getInstance(): ChartGenerator {
    if (!ChartGenerator.instance) {
      ChartGenerator.instance = new ChartGenerator();
    }
    return ChartGenerator.instance;
  }

  /**
   * Extract data from various block types
   */
  async extractDataFromBlock(block: Block): Promise<ExtractedData | null> {
    switch (block.type) {
      case 'table':
        return this.extractFromTable(block);
      case 'paragraph':
      case 'text':
        return this.extractFromText(block.content);
      case 'list':
        return this.extractFromList(block);
      case 'code':
        return this.extractFromCode(block.content);
      default:
        return null;
    }
  }

  /**
   * Extract data from table block
   */
  private extractFromTable(block: Block): ExtractedData {
    const content = block.content;
    let headers: string[] = [];
    let rows: (string | number)[][] = [];

    if (typeof content === 'object' && content.rows) {
      // Extract headers
      if (content.headers) {
        headers = content.headers;
      } else if (content.rows.length > 0) {
        headers = Object.keys(content.rows[0]);
      }

      // Extract row data
      rows = content.rows.map((row: any) => {
        return headers.map(header => {
          const value = row[header];
          // Try to parse as number
          const num = parseFloat(value);
          return isNaN(num) ? value : num;
        });
      });
    }

    const dataType = this.analyzeDataType(rows);
    const suggestedChartType = this.suggestChartType(headers, rows, dataType);

    return {
      headers,
      rows,
      dataType,
      suggestedChartType
    };
  }

  /**
   * Extract data from text using AI
   */
  private async extractFromText(text: string): Promise<ExtractedData | null> {
    if (!isOpenAIConfigured()) {
      return this.extractFromTextFallback(text);
    }

    try {
      const apiParams = aiModelConfig.buildAPIParameters({
        messages: [
          {
            role: 'system',
            content: `Extract structured data from text for chart generation.
Return JSON with:
- headers: array of column names
- rows: 2D array of data values (numbers where applicable)
- dataType: "numeric", "mixed", or "categorical"
- suggestedChartType: "bar", "line", "pie", "scatter", "area", "radar", or "doughnut"`
          },
          {
            role: 'user',
            content: text
          }
        ],
        jsonResponse: true,
        queryType: 'analysis'
      });

      const response = await openai.chat.completions.create(apiParams);

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result as ExtractedData;
    } catch (error) {
      console.error('Failed to extract data from text:', error);
      return this.extractFromTextFallback(text);
    }
  }

  /**
   * Fallback text extraction without AI
   */
  private extractFromTextFallback(text: string): ExtractedData | null {
    // Look for common data patterns
    const lines = text.split('\n').filter(line => line.trim());
    
    // Try to find number patterns
    const numberPattern = /(\d+(?:\.\d+)?)/g;
    const hasNumbers = lines.some(line => numberPattern.test(line));
    
    if (!hasNumbers) return null;

    // Extract simple data
    const data: (string | number)[][] = [];
    const headers: string[] = ['Category', 'Value'];
    
    lines.forEach(line => {
      const numbers = line.match(numberPattern);
      if (numbers && numbers.length > 0) {
        const label = line.replace(numberPattern, '').trim() || `Item ${data.length + 1}`;
        data.push([label, parseFloat(numbers[0])]);
      }
    });

    if (data.length === 0) return null;

    return {
      headers,
      rows: data,
      dataType: 'mixed',
      suggestedChartType: 'bar'
    };
  }

  /**
   * Extract data from list block
   */
  private extractFromList(block: Block): ExtractedData | null {
    const items = block.content?.items || [];
    if (items.length === 0) return null;

    const data: (string | number)[][] = [];
    const headers = ['Item', 'Value'];

    items.forEach((item: string) => {
      // Try to extract number from item
      const numberMatch = item.match(/(\d+(?:\.\d+)?)/);
      if (numberMatch) {
        const label = item.replace(/(\d+(?:\.\d+)?)/g, '').trim();
        data.push([label || `Item ${data.length + 1}`, parseFloat(numberMatch[1])]);
      }
    });

    if (data.length === 0) return null;

    return {
      headers,
      rows: data,
      dataType: 'mixed',
      suggestedChartType: 'bar'
    };
  }

  /**
   * Extract data from code block (JSON, CSV, etc.)
   */
  private extractFromCode(content: string): ExtractedData | null {
    try {
      // Try parsing as JSON
      const jsonData = JSON.parse(content);
      if (Array.isArray(jsonData) && jsonData.length > 0) {
        const headers = Object.keys(jsonData[0]);
        const rows = jsonData.map(item => 
          headers.map(header => item[header])
        );
        
        const dataType = this.analyzeDataType(rows);
        return {
          headers,
          rows,
          dataType,
          suggestedChartType: this.suggestChartType(headers, rows, dataType)
        };
      }
    } catch {
      // Try parsing as CSV
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length > 1) {
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1).map(line => 
          line.split(',').map(cell => {
            const trimmed = cell.trim();
            const num = parseFloat(trimmed);
            return isNaN(num) ? trimmed : num;
          })
        );
        
        const dataType = this.analyzeDataType(rows);
        return {
          headers,
          rows,
          dataType,
          suggestedChartType: this.suggestChartType(headers, rows, dataType)
        };
      }
    }
    
    return null;
  }

  /**
   * Analyze data type
   */
  private analyzeDataType(rows: (string | number)[][]): 'numeric' | 'mixed' | 'categorical' {
    if (rows.length === 0) return 'categorical';
    
    let numericCount = 0;
    let totalCount = 0;
    
    rows.forEach(row => {
      row.forEach(cell => {
        if (typeof cell === 'number') numericCount++;
        totalCount++;
      });
    });
    
    const numericRatio = numericCount / totalCount;
    if (numericRatio > 0.8) return 'numeric';
    if (numericRatio > 0.2) return 'mixed';
    return 'categorical';
  }

  /**
   * Suggest best chart type based on data
   */
  private suggestChartType(
    headers: string[], 
    rows: (string | number)[][], 
    dataType: 'numeric' | 'mixed' | 'categorical'
  ): ChartType {
    // Simple heuristics for chart type selection
    const rowCount = rows.length;
    const columnCount = headers.length;
    
    // For time series data
    if (headers.some(h => /date|time|year|month|day/i.test(h))) {
      return 'line';
    }
    
    // For proportional data
    if (rowCount <= 6 && columnCount === 2 && dataType === 'mixed') {
      return 'pie';
    }
    
    // For comparative data
    if (rowCount <= 10 && dataType === 'mixed') {
      return 'bar';
    }
    
    // For correlation data
    if (columnCount >= 3 && dataType === 'numeric') {
      return 'scatter';
    }
    
    // For multi-dimensional comparison
    if (columnCount >= 4 && rowCount <= 5) {
      return 'radar';
    }
    
    // Default
    return 'bar';
  }

  /**
   * Generate chart configuration
   */
  generateChartConfig(data: ExtractedData, type?: ChartType): ChartConfig {
    const chartType = type || data.suggestedChartType;
    
    // Prepare data for Chart.js format
    const labels = data.rows.map((row, index) => 
      row[0]?.toString() || `Item ${index + 1}`
    );
    
    const datasets = [];
    
    // Create datasets for numeric columns
    for (let colIndex = 1; colIndex < data.headers.length; colIndex++) {
      const columnData = data.rows.map(row => {
        const value = row[colIndex];
        return typeof value === 'number' ? value : 0;
      });
      
      datasets.push({
        label: data.headers[colIndex],
        data: columnData,
        backgroundColor: this.getColor(colIndex - 1, 0.6),
        borderColor: this.getColor(colIndex - 1, 1),
        borderWidth: 2
      });
    }
    
    // If no numeric columns, use row count as data
    if (datasets.length === 0) {
      datasets.push({
        label: 'Count',
        data: data.rows.map(() => 1),
        backgroundColor: this.getColor(0, 0.6),
        borderColor: this.getColor(0, 1),
        borderWidth: 2
      });
    }
    
    return {
      type: chartType,
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          title: {
            display: false
          }
        },
        scales: chartType === 'pie' || chartType === 'doughnut' || chartType === 'radar' 
          ? undefined 
          : {
              y: {
                beginAtZero: true
              }
            }
      }
    };
  }

  /**
   * Get color for dataset
   */
  private getColor(index: number, opacity: number = 1): string {
    const colors = [
      `rgba(59, 130, 246, ${opacity})`,  // blue
      `rgba(239, 68, 68, ${opacity})`,   // red
      `rgba(34, 197, 94, ${opacity})`,   // green
      `rgba(234, 179, 8, ${opacity})`,   // yellow
      `rgba(168, 85, 247, ${opacity})`,  // purple
      `rgba(249, 115, 22, ${opacity})`,  // orange
      `rgba(20, 184, 166, ${opacity})`,  // teal
      `rgba(236, 72, 153, ${opacity})`   // pink
    ];
    
    return colors[index % colors.length];
  }

  /**
   * Create a chart block from configuration
   */
  createChartBlock(config: ChartConfig, title?: string): Block {
    return {
      id: `chart-${Date.now()}`,
      type: 'chart',
      content: {
        title: title || 'Chart',
        config,
        createdAt: new Date().toISOString()
      }
    };
  }
}

export const chartGenerator = ChartGenerator.getInstance();