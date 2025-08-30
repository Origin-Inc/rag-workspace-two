import { faker } from '@faker-js/faker';
import { prisma } from '~/utils/db.server';
import { DatabaseColumn, DatabaseRow } from '~/types/database-block';

export interface SampleDataTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  columns: DatabaseColumn[];
  rowCount: number;
  aiQuestions: string[];
  insights: string[];
}

export const SAMPLE_DATA_TEMPLATES: SampleDataTemplate[] = [
  {
    id: 'sales-analytics',
    name: 'Sales Analytics Dashboard',
    description: 'E-commerce sales data with customer insights and revenue trends',
    icon: '💰',
    columns: [
      { id: 'customer_name', name: 'Customer Name', type: 'text' },
      { id: 'email', name: 'Email', type: 'email' },
      { id: 'product', name: 'Product', type: 'select', options: ['Laptop', 'Phone', 'Tablet', 'Headphones', 'Watch'] },
      { id: 'quantity', name: 'Quantity', type: 'number' },
      { id: 'price', name: 'Price', type: 'number' },
      { id: 'total', name: 'Total', type: 'formula', formula: 'quantity * price' },
      { id: 'date', name: 'Order Date', type: 'date' },
      { id: 'status', name: 'Status', type: 'select', options: ['Pending', 'Shipped', 'Delivered', 'Cancelled'] },
      { id: 'region', name: 'Region', type: 'select', options: ['North America', 'Europe', 'Asia', 'South America'] },
      { id: 'satisfaction', name: 'Satisfaction', type: 'rating' }
    ],
    rowCount: 100,
    aiQuestions: [
      'What are the top-selling products this month?',
      'Which region generates the most revenue?',
      'What is the average order value by customer segment?',
      'Show me the sales trend over the last 30 days',
      'Which products have the highest customer satisfaction?'
    ],
    insights: [
      'Revenue increased by 23% compared to last month',
      'Laptops account for 45% of total sales',
      'North America is the fastest-growing region',
      'Average customer satisfaction is 4.2/5 stars'
    ]
  },
  {
    id: 'customer-crm',
    name: 'Customer Relationship Manager',
    description: 'Track customer interactions, deals, and engagement metrics',
    icon: '👥',
    columns: [
      { id: 'company', name: 'Company', type: 'text' },
      { id: 'contact', name: 'Contact Person', type: 'text' },
      { id: 'email', name: 'Email', type: 'email' },
      { id: 'phone', name: 'Phone', type: 'phone' },
      { id: 'deal_value', name: 'Deal Value', type: 'number' },
      { id: 'stage', name: 'Stage', type: 'select', options: ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'] },
      { id: 'probability', name: 'Win Probability', type: 'percent' },
      { id: 'last_contact', name: 'Last Contact', type: 'date' },
      { id: 'next_action', name: 'Next Action', type: 'text' },
      { id: 'owner', name: 'Account Owner', type: 'person' }
    ],
    rowCount: 50,
    aiQuestions: [
      'Which deals are most likely to close this quarter?',
      'What is the total pipeline value?',
      'Show me all high-value opportunities in negotiation',
      'Which accounts need immediate attention?',
      'What is our win rate by deal size?'
    ],
    insights: [
      '$2.3M in pipeline this quarter',
      '68% average win probability',
      '15 deals need follow-up this week',
      'Enterprise deals have 40% higher close rate'
    ]
  },
  {
    id: 'project-tracker',
    name: 'Project Management Hub',
    description: 'Track projects, tasks, and team productivity',
    icon: '📊',
    columns: [
      { id: 'project_name', name: 'Project Name', type: 'text' },
      { id: 'description', name: 'Description', type: 'text' },
      { id: 'assignee', name: 'Assignee', type: 'person' },
      { id: 'priority', name: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'] },
      { id: 'status', name: 'Status', type: 'select', options: ['Not Started', 'In Progress', 'Review', 'Completed', 'On Hold'] },
      { id: 'start_date', name: 'Start Date', type: 'date' },
      { id: 'due_date', name: 'Due Date', type: 'date' },
      { id: 'progress', name: 'Progress', type: 'percent' },
      { id: 'budget', name: 'Budget', type: 'number' },
      { id: 'spent', name: 'Spent', type: 'number' }
    ],
    rowCount: 30,
    aiQuestions: [
      'Which projects are at risk of missing deadlines?',
      'What is the team workload distribution?',
      'Show me all critical priority items',
      'What is the budget utilization across projects?',
      'Which projects are over budget?'
    ],
    insights: [
      '3 projects at risk this sprint',
      '87% on-time delivery rate',
      'Team capacity at 92%',
      '$45K under budget overall'
    ]
  },
  {
    id: 'financial-metrics',
    name: 'Financial Performance Metrics',
    description: 'Revenue, expenses, and profitability analysis',
    icon: '📈',
    columns: [
      { id: 'month', name: 'Month', type: 'date' },
      { id: 'revenue', name: 'Revenue', type: 'number' },
      { id: 'expenses', name: 'Expenses', type: 'number' },
      { id: 'profit', name: 'Profit', type: 'formula', formula: 'revenue - expenses' },
      { id: 'margin', name: 'Profit Margin', type: 'formula', formula: '(profit / revenue) * 100' },
      { id: 'category', name: 'Category', type: 'select', options: ['Operations', 'Marketing', 'Sales', 'R&D', 'Support'] },
      { id: 'growth', name: 'YoY Growth', type: 'percent' },
      { id: 'forecast', name: 'Forecast', type: 'number' },
      { id: 'variance', name: 'Variance', type: 'formula', formula: 'revenue - forecast' }
    ],
    rowCount: 24,
    aiQuestions: [
      'What is our revenue trend over the last 12 months?',
      'Which category has the highest profit margin?',
      'Show me the variance between forecast and actual',
      'What is our average monthly burn rate?',
      'Project revenue for next quarter based on current trends'
    ],
    insights: [
      '18% YoY revenue growth',
      '32% average profit margin',
      'Marketing ROI increased by 45%',
      'Q4 forecast exceeded by 12%'
    ]
  }
];

export class SampleDataGenerator {
  /**
   * Generate sample data for a template
   */
  static async generateSampleData(
    templateId: string,
    workspaceId: string,
    projectId: string
  ): Promise<{ blockId: string; rowCount: number }> {
    const template = SAMPLE_DATA_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    // Create database block
    const block = await prisma.databaseBlock.create({
      data: {
        workspaceId,
        projectId,
        name: template.name,
        description: template.description,
        schema: {
          columns: template.columns,
          views: [
            { id: 'table', name: 'Table', type: 'table', isDefault: true },
            { id: 'gallery', name: 'Gallery', type: 'gallery' },
            { id: 'board', name: 'Board', type: 'board', groupBy: 'status' },
            { id: 'calendar', name: 'Calendar', type: 'calendar', dateField: 'date' }
          ]
        }
      }
    });
    
    // Generate rows
    const rows = this.generateRows(template);
    
    // Batch insert rows
    await prisma.databaseRow.createMany({
      data: rows.map(row => ({
        blockId: block.id,
        data: row.data,
        order: row.order
      }))
    });
    
    // Store AI questions and insights as metadata
    await prisma.databaseBlock.update({
      where: { id: block.id },
      data: {
        metadata: {
          aiQuestions: template.aiQuestions,
          insights: template.insights,
          templateId: template.id
        }
      }
    });
    
    return {
      blockId: block.id,
      rowCount: rows.length
    };
  }
  
  /**
   * Generate rows based on template
   */
  private static generateRows(template: SampleDataTemplate): any[] {
    const rows = [];
    
    for (let i = 0; i < template.rowCount; i++) {
      const row: any = {
        id: faker.string.uuid(),
        order: i,
        data: {}
      };
      
      // Generate data for each column
      for (const column of template.columns) {
        row.data[column.id] = this.generateCellValue(column, i);
      }
      
      // Calculate formula fields
      for (const column of template.columns) {
        if (column.type === 'formula' && column.formula) {
          row.data[column.id] = this.calculateFormula(column.formula, row.data);
        }
      }
      
      rows.push(row);
    }
    
    return rows;
  }
  
  /**
   * Generate cell value based on column type
   */
  private static generateCellValue(column: DatabaseColumn, index: number): any {
    switch (column.type) {
      case 'text':
        if (column.id.includes('name')) {
          return column.id.includes('customer') || column.id.includes('contact')
            ? faker.person.fullName()
            : column.id.includes('company')
            ? faker.company.name()
            : column.id.includes('project')
            ? faker.commerce.productName()
            : faker.lorem.words(3);
        }
        return faker.lorem.sentence();
        
      case 'email':
        return faker.internet.email();
        
      case 'phone':
        return faker.phone.number();
        
      case 'number':
        if (column.id.includes('price') || column.id.includes('value') || column.id.includes('budget')) {
          return faker.number.int({ min: 1000, max: 100000 });
        }
        if (column.id.includes('quantity')) {
          return faker.number.int({ min: 1, max: 20 });
        }
        return faker.number.int({ min: 0, max: 1000 });
        
      case 'date':
        const date = column.id.includes('start') || column.id.includes('last')
          ? faker.date.past()
          : column.id.includes('due') || column.id.includes('next')
          ? faker.date.future()
          : faker.date.recent();
        return date.toISOString();
        
      case 'select':
        return column.options ? faker.helpers.arrayElement(column.options) : null;
        
      case 'multi-select':
        return column.options 
          ? faker.helpers.arrayElements(column.options, { min: 1, max: 3 })
          : [];
          
      case 'person':
        return faker.person.fullName();
        
      case 'percent':
        return faker.number.int({ min: 0, max: 100 });
        
      case 'rating':
        return faker.number.int({ min: 1, max: 5 });
        
      case 'checkbox':
        return faker.datatype.boolean();
        
      case 'url':
        return faker.internet.url();
        
      default:
        return null;
    }
  }
  
  /**
   * Calculate formula value
   */
  private static calculateFormula(formula: string, data: any): number {
    try {
      // Simple formula evaluation (in production, use a proper expression parser)
      const expression = formula.replace(/[a-z_]+/gi, (match) => {
        return data[match] || 0;
      });
      
      // Safe evaluation for simple math operations
      const result = Function('"use strict"; return (' + expression + ')')();
      return Math.round(result * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      console.error('Formula calculation error:', error);
      return 0;
    }
  }
  
  /**
   * Get sample AI questions for a dataset
   */
  static getSampleQuestions(templateId: string): string[] {
    const template = SAMPLE_DATA_TEMPLATES.find(t => t.id === templateId);
    return template?.aiQuestions || [];
  }
  
  /**
   * Get sample insights for a dataset
   */
  static getSampleInsights(templateId: string): string[] {
    const template = SAMPLE_DATA_TEMPLATES.find(t => t.id === templateId);
    return template?.insights || [];
  }
}