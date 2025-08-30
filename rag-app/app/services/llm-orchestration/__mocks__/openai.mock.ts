/**
 * Mock OpenAI responses for testing
 */

export const mockOpenAIResponses = {
  // Intent classification responses
  intents: {
    dataQuery: {
      intent: 'data_query',
      confidence: 0.95,
      suggestedFormat: 'table',
      entities: [
        { type: 'database', value: 'tasks', confidence: 0.9 }
      ],
      timeRange: null,
      aggregations: [],
      filters: {},
      explanation: 'User wants to view task data'
    },
    contentSearch: {
      intent: 'content_search',
      confidence: 0.92,
      suggestedFormat: 'text',
      entities: [
        { type: 'page', value: 'documentation', confidence: 0.85 }
      ],
      timeRange: null,
      aggregations: [],
      filters: {},
      explanation: 'User searching for documentation'
    },
    analytics: {
      intent: 'analytics',
      confidence: 0.88,
      suggestedFormat: 'chart',
      entities: [
        { type: 'metric', value: 'revenue', confidence: 0.9 },
        { type: 'date_range', value: 'last quarter', confidence: 0.95 }
      ],
      timeRange: {
        start: null,
        end: null,
        relative: 'last quarter'
      },
      aggregations: ['sum', 'average'],
      filters: {},
      explanation: 'User wants analytics visualization'
    },
    summary: {
      intent: 'summary',
      confidence: 0.9,
      suggestedFormat: 'mixed',
      entities: [
        { type: 'project', value: 'current project', confidence: 0.8 }
      ],
      timeRange: null,
      aggregations: [],
      filters: {},
      explanation: 'User wants a summary'
    },
    action: {
      intent: 'action',
      confidence: 0.93,
      suggestedFormat: 'action_confirmation',
      entities: [
        { type: 'entity', value: 'task', confidence: 0.95 }
      ],
      timeRange: null,
      aggregations: [],
      filters: {},
      explanation: 'User wants to perform an action'
    }
  },
  
  // Structured output responses
  structuredOutputs: {
    tableBlock: {
      blocks: [
        {
          type: 'table',
          columns: [
            { id: 'id', name: 'ID', type: 'text' },
            { id: 'title', name: 'Title', type: 'text' },
            { id: 'status', name: 'Status', type: 'select' },
            { id: 'priority', name: 'Priority', type: 'number' }
          ],
          rows: [
            { id: '1', title: 'Task 1', status: 'pending', priority: 1 },
            { id: '2', title: 'Task 2', status: 'done', priority: 2 }
          ]
        }
      ],
      metadata: {
        confidence: 0.95,
        dataSources: ['database'],
        suggestions: ['You can filter by status', 'Sort by priority'],
        followUpQuestions: ['Show only pending tasks?', 'View task details?']
      }
    },
    chartBlock: {
      blocks: [
        {
          type: 'chart',
          chartType: 'bar',
          data: {
            labels: ['Jan', 'Feb', 'Mar'],
            datasets: [
              {
                label: 'Revenue',
                data: [10000, 15000, 12000],
                backgroundColor: 'rgba(59, 130, 246, 0.5)'
              }
            ]
          },
          options: {
            title: 'Revenue by Month',
            xAxisLabel: 'Month',
            yAxisLabel: 'Revenue ($)'
          }
        }
      ],
      metadata: {
        confidence: 0.9,
        dataSources: ['analytics'],
        suggestions: ['View detailed breakdown', 'Compare with last year']
      }
    },
    textBlock: {
      blocks: [
        {
          type: 'text',
          content: 'Here is the information you requested about the project.'
        }
      ],
      metadata: {
        confidence: 0.85,
        dataSources: ['content'],
        suggestions: []
      }
    },
    insightBlock: {
      blocks: [
        {
          type: 'insight',
          title: 'Key Finding',
          content: 'Task completion rate has increased by 25% this month.',
          severity: 'success',
          icon: '📈'
        }
      ],
      metadata: {
        confidence: 0.92,
        dataSources: ['analytics', 'database'],
        suggestions: ['View detailed metrics']
      }
    }
  }
};

export function getMockIntentResponse(query: string): any {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('task') || lowerQuery.includes('show') || lowerQuery.includes('list')) {
    return mockOpenAIResponses.intents.dataQuery;
  }
  if (lowerQuery.includes('find') || lowerQuery.includes('search') || lowerQuery.includes('documentation')) {
    return mockOpenAIResponses.intents.contentSearch;
  }
  if (lowerQuery.includes('revenue') || lowerQuery.includes('analytics') || lowerQuery.includes('trend')) {
    return mockOpenAIResponses.intents.analytics;
  }
  if (lowerQuery.includes('summarize') || lowerQuery.includes('summary')) {
    return mockOpenAIResponses.intents.summary;
  }
  if (lowerQuery.includes('create') || lowerQuery.includes('add') || lowerQuery.includes('update')) {
    return mockOpenAIResponses.intents.action;
  }
  
  return mockOpenAIResponses.intents.dataQuery;
}

export function getMockStructuredOutput(responseType: string): any {
  switch (responseType) {
    case 'data':
    case 'table':
      return mockOpenAIResponses.structuredOutputs.tableBlock;
    case 'chart':
    case 'analytics':
      return mockOpenAIResponses.structuredOutputs.chartBlock;
    case 'content':
    case 'text':
      return mockOpenAIResponses.structuredOutputs.textBlock;
    case 'insight':
      return mockOpenAIResponses.structuredOutputs.insightBlock;
    default:
      return mockOpenAIResponses.structuredOutputs.textBlock;
  }
}

export const createMockOpenAI = () => ({
  chat: {
    completions: {
      create: async ({ messages }: any) => {
        const userMessage = messages[messages.length - 1]?.content || '';
        
        // Determine if this is intent classification or structured output
        if (messages[0]?.content?.includes('intent classification')) {
          return {
            choices: [{
              message: {
                content: JSON.stringify(getMockIntentResponse(userMessage))
              }
            }]
          };
        }
        
        // Default to structured output
        return {
          choices: [{
            message: {
              content: JSON.stringify(getMockStructuredOutput('text'))
            }
          }]
        };
      }
    }
  }
});