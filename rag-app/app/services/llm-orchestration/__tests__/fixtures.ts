/**
 * Test fixtures and data factories for comprehensive testing
 */

import type { IntentClassification } from '../intent-classifier.server';
import type { QueryContext } from '../context-extractor.server';
import type { RouteDecision } from '../query-router.server';
import type { QueryResponse } from '../route-handlers.server';
import type { StructuredResponse } from '../structured-output.server';

// Sample queries for different intents
export const testQueries = {
  dataQuery: [
    'show my tasks',
    'list all pending items',
    'what tasks are assigned to me?',
    'show completed tasks from last week'
  ],
  contentSearch: [
    'find documentation about authentication',
    'search for API reference',
    'where is the setup guide?',
    'find meeting notes from yesterday'
  ],
  analytics: [
    'show revenue by month',
    'what is the average task completion time?',
    'trend analysis for user growth',
    'compare this quarter to last quarter'
  ],
  summary: [
    'summarize project status',
    'what happened this week?',
    'give me an overview of the workspace',
    'summarize recent changes'
  ],
  action: [
    'create a new task for bug fixing',
    'add a column to the database',
    'update the project description',
    'delete completed tasks'
  ],
  navigation: [
    'go to settings',
    'open project dashboard',
    'navigate to workspace',
    'show me the home page'
  ],
  help: [
    'how do I create a database?',
    'what can you do?',
    'help me with formulas',
    'explain how permissions work'
  ],
  ambiguous: [
    'stuff',
    'things about that',
    'the one from before',
    'do it'
  ]
};

// Factory for creating IntentClassification
export function createIntentClassification(
  overrides?: Partial<IntentClassification>
): IntentClassification {
  return {
    intent: 'data_query' as any,
    confidence: 0.9,
    suggestedFormat: 'table' as any,
    entities: [],
    timeRange: null,
    aggregations: [],
    filters: {},
    explanation: 'Test classification',
    ...overrides
  };
}

// Factory for creating QueryContext
export function createQueryContext(overrides?: Partial<QueryContext>): QueryContext {
  return {
    workspace: {
      id: 'test-workspace-id',
      name: 'Test Workspace',
      memberCount: 5,
      recentActivity: ['Page 1', 'Page 2']
    },
    databases: [
      {
        id: 'db-1',
        name: 'Tasks',
        columnCount: 4,
        rowCount: 100,
        columns: [
          { name: 'Title', type: 'text' },
          { name: 'Status', type: 'select' },
          { name: 'Priority', type: 'number' }
        ],
        recentlyAccessed: true,
        relevanceScore: 10
      }
    ],
    pages: [
      {
        id: 'page-1',
        title: 'Documentation',
        lastModified: new Date(),
        blockCount: 50,
        hasDatabase: false,
        relevanceScore: 8
      }
    ],
    user: {
      id: 'user-1',
      email: 'test@example.com',
      role: 'member',
      recentDatabases: ['db-1'],
      recentPages: ['page-1'],
      preferences: {}
    },
    sessionHistory: [],
    extractedEntities: [
      {
        type: 'database',
        value: 'tasks',
        matchedResourceId: 'db-1',
        matchedResourceType: 'database',
        confidence: 0.95
      }
    ],
    ...overrides
  };
}

// Factory for creating RouteDecision
export function createRouteDecision(overrides?: Partial<RouteDecision>): RouteDecision {
  return {
    primary: 'database_query' as any,
    confidence: 0.9,
    reasoning: 'Test routing decision',
    parameters: {
      databaseIds: ['db-1'],
      limit: 100
    },
    ...overrides
  };
}

// Factory for creating QueryResponse
export function createQueryResponse(overrides?: Partial<QueryResponse>): QueryResponse {
  return {
    type: 'data',
    data: {
      results: [
        { id: '1', title: 'Task 1', status: 'pending' },
        { id: '2', title: 'Task 2', status: 'done' }
      ]
    },
    metadata: {
      source: 'database',
      confidence: 0.95,
      processingTime: 150,
      rowCount: 2
    },
    ...overrides
  };
}

// Factory for creating StructuredResponse
export function createStructuredResponse(
  overrides?: Partial<StructuredResponse>
): StructuredResponse {
  return {
    blocks: [
      {
        type: 'table',
        columns: [
          { id: 'id', name: 'ID', type: 'text' },
          { id: 'title', name: 'Title', type: 'text' },
          { id: 'status', name: 'Status', type: 'select' }
        ],
        rows: [
          { id: '1', title: 'Task 1', status: 'pending' },
          { id: '2', title: 'Task 2', status: 'done' }
        ]
      }
    ],
    metadata: {
      confidence: 0.95,
      dataSources: ['database'],
      suggestions: ['Filter by status', 'Sort by date'],
      followUpQuestions: ['Show only pending tasks?']
    },
    ...overrides
  };
}

// Performance test data
export function generateLargeDataset(size: number) {
  const rows = [];
  for (let i = 0; i < size; i++) {
    rows.push({
      id: `row-${i}`,
      title: `Item ${i}`,
      status: i % 3 === 0 ? 'done' : i % 2 === 0 ? 'in-progress' : 'pending',
      priority: (i % 5) + 1,
      created: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
    });
  }
  return rows;
}

// Error scenarios
export const errorScenarios = {
  invalidWorkspace: {
    workspaceId: 'non-existent-id',
    expectedError: 'Workspace not found'
  },
  malformedQuery: {
    query: '',
    expectedError: 'Query cannot be empty'
  },
  timeout: {
    query: 'complex query that takes too long',
    maxResponseTime: 100,
    expectedError: 'Query processing timeout'
  },
  noPermissions: {
    userId: 'unauthorized-user',
    expectedError: 'Insufficient permissions'
  }
};

// Expected response patterns for validation
export const responsePatterns = {
  tableBlock: {
    type: 'table',
    requiredFields: ['columns', 'rows'],
    columnsMinLength: 1,
    rowsCanBeEmpty: true
  },
  chartBlock: {
    type: 'chart',
    requiredFields: ['chartType', 'data'],
    validChartTypes: ['bar', 'line', 'pie', 'scatter', 'area']
  },
  textBlock: {
    type: 'text',
    requiredFields: ['content'],
    contentMinLength: 1
  },
  insightBlock: {
    type: 'insight',
    requiredFields: ['title', 'content', 'severity'],
    validSeverities: ['info', 'success', 'warning', 'error']
  }
};

// Mock delay for async operations
export function mockDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Validate response structure
export function validateResponseStructure(response: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!response.blocks || !Array.isArray(response.blocks)) {
    errors.push('Response must have blocks array');
  }
  
  if (!response.metadata) {
    errors.push('Response must have metadata');
  } else {
    if (typeof response.metadata.confidence !== 'number') {
      errors.push('Metadata must have numeric confidence');
    }
    if (!Array.isArray(response.metadata.dataSources)) {
      errors.push('Metadata must have dataSources array');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}