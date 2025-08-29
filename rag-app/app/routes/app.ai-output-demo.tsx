import { useState } from 'react';
import { AIOutputBlock } from '~/components/blocks/AIOutputBlock';
import { ChartOutputBlock } from '~/components/blocks/ChartOutputBlock';
import { TableOutputBlock } from '~/components/blocks/TableOutputBlock';
import type { StructuredResponse } from '~/services/llm-orchestration/structured-output.server';
import { Sparkles, BarChart3, Table, FileText, TrendingUp } from 'lucide-react';

export default function AIOutputDemo() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [selectedDemo, setSelectedDemo] = useState<'revenue' | 'tasks' | 'mixed' | 'insights'>('revenue');
  
  // Demo data for revenue analytics
  const revenueResponse: StructuredResponse = {
    blocks: [
      {
        type: 'chart',
        chartType: 'bar',
        title: 'Monthly Revenue Comparison',
        description: 'Revenue breakdown by month for Q4 2024',
        data: {
          labels: ['October', 'November', 'December'],
          datasets: [
            {
              label: '2024',
              data: [125000, 145000, 168000],
              backgroundColor: '#3b82f6',
            },
            {
              label: '2023',
              data: [98000, 112000, 135000],
              backgroundColor: '#8b5cf6',
            },
          ],
        },
        options: {
          responsive: true,
          animations: true,
        },
      },
      {
        type: 'table',
        title: 'Detailed Revenue Breakdown',
        description: 'Product-wise revenue for December 2024',
        columns: [
          { id: 'product', name: 'Product', type: 'text' },
          { id: 'units', name: 'Units Sold', type: 'number' },
          { id: 'revenue', name: 'Revenue', type: 'currency' },
          { id: 'growth', name: 'Growth', type: 'percent' },
          { id: 'status', name: 'Status', type: 'text' },
        ],
        rows: [
          { product: 'Enterprise Plan', units: 45, revenue: 89000, growth: 0.23, status: 'Growing' },
          { product: 'Professional Plan', units: 128, revenue: 51200, growth: 0.15, status: 'Stable' },
          { product: 'Starter Plan', units: 312, revenue: 27800, growth: -0.05, status: 'Declining' },
        ],
        options: {
          sortable: true,
          filterable: true,
          exportable: true,
          conditionalFormatting: [
            {
              column: 'growth',
              condition: (value: number) => value > 0,
              className: 'text-green-600 font-semibold',
            },
            {
              column: 'growth',
              condition: (value: number) => value < 0,
              className: 'text-red-600',
            },
          ],
        },
      },
    ],
    metadata: {
      confidence: 0.95,
      dataSources: ['database', 'analytics'],
      suggestions: [
        'Compare with previous quarter',
        'Analyze customer segments',
        'Project next quarter revenue',
      ],
      followUpQuestions: [
        'What drove the December spike?',
        'Show customer acquisition cost',
        'Break down by region',
      ],
    },
  };
  
  // Demo data for task management
  const tasksResponse: StructuredResponse = {
    blocks: [
      {
        type: 'chart',
        chartType: 'pie',
        title: 'Task Distribution by Status',
        description: 'Current sprint task breakdown',
        data: [
          { name: 'Completed', value: 23 },
          { name: 'In Progress', value: 12 },
          { name: 'Pending', value: 8 },
          { name: 'Blocked', value: 3 },
        ],
      },
      {
        type: 'table',
        title: 'High Priority Tasks',
        columns: [
          { id: 'title', name: 'Task', type: 'text' },
          { id: 'assignee', name: 'Assignee', type: 'text' },
          { id: 'due', name: 'Due Date', type: 'date' },
          { id: 'priority', name: 'Priority', type: 'number' },
        ],
        rows: [
          { title: 'Fix authentication bug', assignee: 'Alice', due: '2024-01-20', priority: 1 },
          { title: 'Implement chart components', assignee: 'Bob', due: '2024-01-22', priority: 1 },
          { title: 'Database optimization', assignee: 'Charlie', due: '2024-01-25', priority: 2 },
        ],
      },
    ],
    metadata: {
      confidence: 0.92,
      dataSources: ['database'],
      suggestions: ['Review blocked tasks', 'Reassign overdue items'],
    },
  };
  
  // Demo data for mixed response
  const mixedResponse: StructuredResponse = {
    blocks: [
      {
        type: 'text',
        content: 'Based on your workspace data, here\'s a comprehensive analysis of your project status:',
        formatting: { style: 'paragraph' },
      },
      {
        type: 'insight',
        title: 'Key Finding',
        content: 'Your team velocity has increased by 25% this sprint, primarily due to improved task distribution.',
        severity: 'success',
      },
      {
        type: 'chart',
        chartType: 'line',
        title: 'Sprint Velocity Trend',
        data: {
          labels: ['Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4'],
          datasets: [
            {
              label: 'Story Points',
              data: [21, 24, 28, 35],
            },
          ],
        },
      },
      {
        type: 'list',
        items: [
          { text: 'Frontend development is ahead of schedule' },
          { text: 'Backend API integration is on track' },
          { text: 'Testing phase will begin next week' },
        ],
        style: 'bullet',
      },
    ],
    metadata: {
      confidence: 0.88,
      dataSources: ['database', 'content'],
    },
  };
  
  // Demo data for insights
  const insightsResponse: StructuredResponse = {
    blocks: [
      {
        type: 'insight',
        title: 'Performance Alert',
        content: 'Database query times have increased by 40% in the last hour. Consider scaling up resources.',
        severity: 'warning',
      },
      {
        type: 'chart',
        chartType: 'area',
        title: 'System Performance Metrics',
        data: {
          labels: ['12:00', '12:15', '12:30', '12:45', '13:00'],
          datasets: [
            {
              label: 'Response Time (ms)',
              data: [120, 135, 180, 210, 195],
            },
          ],
        },
      },
      {
        type: 'action_confirmation',
        action: 'Scale Database',
        description: 'Automatically scale database to handle increased load?',
        parameters: {
          currentSize: 'db.t3.medium',
          recommendedSize: 'db.t3.large',
          estimatedCost: '$0.20/hour',
        },
      },
    ],
    metadata: {
      confidence: 0.91,
      dataSources: ['monitoring', 'analytics'],
    },
  };
  
  const demos = {
    revenue: revenueResponse,
    tasks: tasksResponse,
    mixed: mixedResponse,
    insights: insightsResponse,
  };
  
  const handleInsert = (blockData: any) => {
    console.log('Inserting block:', blockData);
    alert(`Block would be inserted: ${JSON.stringify(blockData, null, 2)}`);
  };
  
  const handleRegenerate = () => {
    console.log('Regenerating response...');
    alert('Response would be regenerated with the LLM');
  };
  
  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            AI Output Blocks Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Beautiful, interactive visualizations for AI-generated content
          </p>
        </div>
        
        {/* Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            {/* Demo Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Demo:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setSelectedDemo('revenue')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    selectedDemo === 'revenue'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  Revenue Analytics
                </button>
                <button
                  onClick={() => setSelectedDemo('tasks')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    selectedDemo === 'tasks'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Table className="w-4 h-4" />
                  Task Management
                </button>
                <button
                  onClick={() => setSelectedDemo('mixed')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    selectedDemo === 'mixed'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Mixed Content
                </button>
                <button
                  onClick={() => setSelectedDemo('insights')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    selectedDemo === 'insights'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  Insights & Actions
                </button>
              </div>
            </div>
            
            {/* Theme Toggle */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme:</span>
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
              </button>
            </div>
          </div>
        </div>
        
        {/* AI Output Display */}
        <div className="space-y-6">
          <AIOutputBlock
            response={demos[selectedDemo]}
            onInsert={handleInsert}
            onRegenerate={handleRegenerate}
            theme={theme}
          />
        </div>
        
        {/* Individual Component Examples */}
        <div className="mt-12 space-y-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Individual Components
          </h2>
          
          {/* Standalone Chart */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Standalone Chart Component
            </h3>
            <ChartOutputBlock
              type="area"
              data={{
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                datasets: [
                  {
                    label: 'Page Views',
                    data: [3200, 4100, 3800, 5200, 4900],
                  },
                  {
                    label: 'Unique Visitors',
                    data: [1200, 1800, 1600, 2100, 2300],
                  },
                ],
              }}
              title="Website Analytics"
              description="Daily traffic for the current week"
              provenance={{
                isAIGenerated: true,
                confidence: 0.89,
                source: 'Google Analytics',
              }}
              onInsert={handleInsert}
              theme={theme}
            />
          </div>
          
          {/* Standalone Table */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Standalone Table Component
            </h3>
            <TableOutputBlock
              columns={[
                { id: 'name', name: 'Name', type: 'text' },
                { id: 'role', name: 'Role', type: 'text' },
                { id: 'performance', name: 'Performance', type: 'percent' },
                { id: 'salary', name: 'Salary', type: 'currency' },
              ]}
              rows={[
                { name: 'Alice Johnson', role: 'Senior Developer', performance: 0.92, salary: 120000 },
                { name: 'Bob Smith', role: 'Product Manager', performance: 0.88, salary: 110000 },
                { name: 'Charlie Brown', role: 'Designer', performance: 0.95, salary: 95000 },
                { name: 'Diana Prince', role: 'Data Scientist', performance: 0.91, salary: 130000 },
              ]}
              title="Team Performance Dashboard"
              description="Q4 2024 Performance Review"
              options={{
                sortable: true,
                filterable: true,
                searchable: true,
                exportable: true,
                paginated: true,
                pageSize: 3,
              }}
              provenance={{
                isAIGenerated: true,
                confidence: 0.94,
                source: 'HR Database',
                query: 'Show team performance metrics',
              }}
              onInsert={handleInsert}
              theme={theme}
            />
          </div>
        </div>
      </div>
    </div>
  );
}