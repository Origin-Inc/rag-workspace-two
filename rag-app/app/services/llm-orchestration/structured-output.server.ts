import { openai } from '../openai.server';
import { DebugLogger } from '~/utils/debug-logger';
import { z } from 'zod';
import type { QueryResponse } from './route-handlers.server';

// Block format schemas for different response types
const TextBlockSchema = z.object({
  type: z.literal('text'),
  content: z.string(),
  formatting: z.object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    code: z.boolean().optional()
  }).optional()
});

const TableBlockSchema = z.object({
  type: z.literal('table'),
  columns: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    width: z.number().optional()
  })),
  rows: z.array(z.record(z.any())),
  metadata: z.object({
    sortColumn: z.string().optional(),
    sortDirection: z.enum(['asc', 'desc']).optional()
  }).optional()
});

const ChartBlockSchema = z.object({
  type: z.literal('chart'),
  chartType: z.enum(['bar', 'line', 'pie', 'scatter', 'area']),
  data: z.object({
    labels: z.array(z.string()),
    datasets: z.array(z.object({
      label: z.string(),
      data: z.array(z.number()),
      backgroundColor: z.string().optional(),
      borderColor: z.string().optional()
    }))
  }),
  options: z.object({
    title: z.string().optional(),
    xAxisLabel: z.string().optional(),
    yAxisLabel: z.string().optional()
  }).optional()
});

const ListBlockSchema = z.object({
  type: z.literal('list'),
  listType: z.enum(['bullet', 'numbered', 'checklist']),
  items: z.array(z.object({
    text: z.string(),
    checked: z.boolean().optional(),
    nested: z.array(z.string()).optional()
  }))
});

const InsightBlockSchema = z.object({
  type: z.literal('insight'),
  title: z.string(),
  content: z.string(),
  severity: z.enum(['info', 'success', 'warning', 'error']),
  icon: z.string().optional()
});

const StructuredResponseSchema = z.object({
  blocks: z.array(z.union([
    TextBlockSchema,
    TableBlockSchema,
    ChartBlockSchema,
    ListBlockSchema,
    InsightBlockSchema
  ])),
  metadata: z.object({
    confidence: z.number().min(0).max(1),
    dataSources: z.array(z.string()),
    suggestions: z.array(z.string()).optional(),
    followUpQuestions: z.array(z.string()).optional()
  })
});

export type StructuredResponse = z.infer<typeof StructuredResponseSchema>;
export type BlockType = StructuredResponse['blocks'][0];

export class StructuredOutputGenerator {
  private logger = new DebugLogger('StructuredOutputGenerator');
  
  /**
   * Generate structured output from query response
   */
  async generateStructuredOutput(
    query: string,
    response: QueryResponse,
    context?: any
  ): Promise<StructuredResponse> {
    this.logger.info('Generating structured output', {
      query,
      responseType: response.type,
      dataKeys: Object.keys(response.data)
    });
    
    try {
      // Build prompt based on response type
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(query, response, context);
      
      // Call OpenAI with structured output
      const completion = await openai!.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 3000
      });
      
      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }
      
      const parsed = JSON.parse(content);
      const structured = StructuredResponseSchema.parse(parsed);
      
      this.logger.info('Structured output generated', {
        blockCount: structured.blocks.length,
        blockTypes: structured.blocks.map(b => b.type)
      });
      
      return structured;
    } catch (error) {
      this.logger.error('Failed to generate structured output', error);
      
      // Fallback to simple text block
      return this.createFallbackResponse(query, response);
    }
  }
  
  /**
   * Build system prompt for structured output generation
   */
  private buildSystemPrompt(): string {
    return `You are a structured output generator for a Notion-like workspace application.

Convert query responses into structured blocks that can be rendered in the editor.

Available block types:
1. text - Plain or formatted text content
2. table - Tabular data with columns and rows
3. chart - Visual charts (bar, line, pie, scatter, area)
4. list - Bullet, numbered, or checklist
5. insight - Key insights or alerts with severity levels

Guidelines:
- Choose the most appropriate block type(s) for the data
- For numeric data with comparisons, prefer charts
- For structured data with multiple fields, use tables
- For key findings or alerts, use insight blocks
- Include helpful metadata like data sources and follow-up questions
- Ensure all data is accurate and not hallucinated

Return a JSON object matching this structure:
{
  "blocks": [
    {
      "type": "block_type",
      // block-specific fields
    }
  ],
  "metadata": {
    "confidence": 0.0-1.0,
    "dataSources": ["source1", "source2"],
    "suggestions": ["optional suggestions"],
    "followUpQuestions": ["optional follow-up questions"]
  }
}`;
  }
  
  /**
   * Build user prompt with response data
   */
  private buildUserPrompt(
    query: string,
    response: QueryResponse,
    context?: any
  ): string {
    let prompt = `User Query: "${query}"\n\n`;
    prompt += `Response Type: ${response.type}\n`;
    prompt += `Data Source: ${response.metadata.source}\n\n`;
    
    // Add response data
    prompt += 'Response Data:\n';
    prompt += JSON.stringify(response.data, null, 2).slice(0, 5000);
    
    if (context) {
      prompt += '\n\nAdditional Context:\n';
      prompt += JSON.stringify(context, null, 2).slice(0, 1000);
    }
    
    prompt += '\n\nGenerate structured blocks for this response.';
    return prompt;
  }
  
  /**
   * Create fallback response when structured generation fails
   */
  private createFallbackResponse(
    query: string,
    response: QueryResponse
  ): StructuredResponse {
    const blocks: BlockType[] = [];
    
    // Create appropriate blocks based on response type
    switch (response.type) {
      case 'data':
        if (Array.isArray(response.data) && response.data.length > 0) {
          const firstResult = response.data[0];
          if (firstResult.rows && firstResult.columns) {
            blocks.push({
              type: 'table',
              columns: firstResult.columns.map((col: any) => ({
                id: col.id || col.name,
                name: col.name,
                type: col.type || 'text'
              })),
              rows: firstResult.rows.slice(0, 50)
            });
          }
        }
        break;
        
      case 'content':
        blocks.push({
          type: 'text',
          content: response.data.context || response.data.message || 'No content available'
        });
        break;
        
      case 'chart':
        if (response.data.analytics && response.data.analytics.length > 0) {
          blocks.push({
            type: 'chart',
            chartType: response.data.chartType || 'bar',
            data: this.formatChartData(response.data.analytics),
            options: {
              title: 'Analytics Results'
            }
          });
        }
        break;
        
      default:
        blocks.push({
          type: 'text',
          content: JSON.stringify(response.data, null, 2).slice(0, 1000)
        });
    }
    
    // Add metadata
    return {
      blocks,
      metadata: {
        confidence: response.metadata.confidence || 0.5,
        dataSources: [response.metadata.source],
        suggestions: [],
        followUpQuestions: []
      }
    };
  }
  
  /**
   * Format analytics data for charts
   */
  private formatChartData(analytics: any[]): any {
    const labels = analytics.map(a => a.column || 'Unknown');
    const datasets = [];
    
    // Create datasets for different metrics
    if (analytics[0]?.sum !== undefined) {
      datasets.push({
        label: 'Sum',
        data: analytics.map(a => a.sum || 0),
        backgroundColor: 'rgba(59, 130, 246, 0.5)'
      });
    }
    
    if (analytics[0]?.average !== undefined) {
      datasets.push({
        label: 'Average',
        data: analytics.map(a => a.average || 0),
        backgroundColor: 'rgba(16, 185, 129, 0.5)'
      });
    }
    
    if (analytics[0]?.count !== undefined) {
      datasets.push({
        label: 'Count',
        data: analytics.map(a => a.count || 0),
        backgroundColor: 'rgba(251, 146, 60, 0.5)'
      });
    }
    
    return { labels, datasets };
  }
  
  /**
   * Validate structured response
   */
  validateResponse(response: StructuredResponse): boolean {
    try {
      StructuredResponseSchema.parse(response);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Optimize response for rendering
   */
  optimizeForRendering(response: StructuredResponse): StructuredResponse {
    // Limit table rows for performance
    response.blocks = response.blocks.map(block => {
      if (block.type === 'table' && block.rows.length > 100) {
        return {
          ...block,
          rows: block.rows.slice(0, 100),
          metadata: {
            ...block.metadata,
            truncated: true,
            totalRows: block.rows.length
          }
        };
      }
      return block;
    });
    
    // Limit chart data points
    response.blocks = response.blocks.map(block => {
      if (block.type === 'chart' && block.data.labels.length > 50) {
        return {
          ...block,
          data: {
            labels: block.data.labels.slice(0, 50),
            datasets: block.data.datasets.map(ds => ({
              ...ds,
              data: ds.data.slice(0, 50)
            }))
          }
        };
      }
      return block;
    });
    
    return response;
  }
}