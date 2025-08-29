/**
 * Mock Supabase client for testing
 */

export const mockWorkspaces = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Test Workspace',
    slug: 'test-workspace',
    description: 'A test workspace for development',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  }
];

export const mockPages = [
  {
    id: 'page-1',
    title: 'Project Documentation',
    workspace_id: '550e8400-e29b-41d4-a716-446655440000',
    updated_at: '2024-01-15T10:00:00Z'
  },
  {
    id: 'page-2',
    title: 'Task List',
    workspace_id: '550e8400-e29b-41d4-a716-446655440000',
    updated_at: '2024-01-14T10:00:00Z'
  },
  {
    id: 'page-3',
    title: 'Meeting Notes',
    workspace_id: '550e8400-e29b-41d4-a716-446655440000',
    updated_at: '2024-01-13T10:00:00Z'
  }
];

export const mockDatabases = [
  {
    id: 'db-1',
    block_id: 'block-1',
    name: 'Tasks Database',
    description: 'Track project tasks',
    schema: [
      { id: 'title', name: 'Title', type: 'text' },
      { id: 'status', name: 'Status', type: 'select', options: ['pending', 'in-progress', 'done'] },
      { id: 'priority', name: 'Priority', type: 'number' },
      { id: 'due_date', name: 'Due Date', type: 'date' }
    ],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z'
  },
  {
    id: 'db-2',
    block_id: 'block-2',
    name: 'Expenses',
    description: 'Track expenses',
    schema: [
      { id: 'description', name: 'Description', type: 'text' },
      { id: 'amount', name: 'Amount', type: 'currency' },
      { id: 'category', name: 'Category', type: 'select' },
      { id: 'date', name: 'Date', type: 'date' }
    ],
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-14T00:00:00Z'
  }
];

export const mockDatabaseRows = {
  'db-1': [
    { id: 'row-1', title: 'Complete authentication', status: 'done', priority: 1, due_date: '2024-01-10' },
    { id: 'row-2', title: 'Implement dashboard', status: 'in-progress', priority: 2, due_date: '2024-01-20' },
    { id: 'row-3', title: 'Write tests', status: 'pending', priority: 3, due_date: '2024-01-25' }
  ],
  'db-2': [
    { id: 'row-4', description: 'Office supplies', amount: 150.00, category: 'supplies', date: '2024-01-10' },
    { id: 'row-5', description: 'Software license', amount: 99.00, category: 'software', date: '2024-01-12' }
  ]
};

export const mockUsers = [
  {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User'
  }
];

export const mockEmbeddings = [
  {
    id: 'emb-1',
    content: 'Authentication implementation details',
    similarity: 0.92,
    passage_id: 'pass-1',
    source_block_id: 'block-1',
    metadata: { page: 'Documentation' }
  },
  {
    id: 'emb-2',
    content: 'Dashboard design specifications',
    similarity: 0.85,
    passage_id: 'pass-2',
    source_block_id: 'block-2',
    metadata: { page: 'Design Docs' }
  }
];

export const createMockSupabase = () => {
  const mockChain = {
    select: (fields?: string) => mockChain,
    eq: (field: string, value: any) => mockChain,
    in: (field: string, values: any[]) => mockChain,
    ilike: (field: string, pattern: string) => mockChain,
    order: (field: string, options?: any) => mockChain,
    limit: (count: number) => mockChain,
    single: () => ({
      data: null,
      error: null
    })
  };
  
  return {
    from: (table: string) => {
      const chain = { ...mockChain };
      let eqFilter: any = {};
      
      // Track eq filters
      const originalEq = chain.eq;
      chain.eq = (field: string, value: any) => {
        eqFilter[field] = value;
        originalEq(field, value);
        return chain;
      };
      
      // Override single() for specific tables
      chain.single = () => {
        switch (table) {
          case 'workspaces':
            // Check if the workspace ID matches
            if (eqFilter.id === mockWorkspaces[0].id) {
              return { data: mockWorkspaces[0], error: null };
            }
            return { data: null, error: { message: 'Workspace not found' } };
          case 'users':
            return { data: mockUsers[0], error: null };
          case 'pages':
            return { data: mockPages[0], error: null };
          default:
            return { data: null, error: { message: 'Not found' } };
        }
      };
      
      // Handle data property for list queries
      if (table === 'pages') {
        return {
          ...chain,
          data: eqFilter.workspace_id ? 
            mockPages.filter(p => p.workspace_id === eqFilter.workspace_id) : 
            mockPages,
          error: null
        };
      }
      
      if (table === 'db_blocks') {
        return {
          ...chain,
          data: mockDatabases,
          error: null
        };
      }
      
      return chain;
    },
    
    rpc: (functionName: string, params: any) => {
      if (functionName === 'search_embeddings') {
        return Promise.resolve({ data: mockEmbeddings, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    }
  };
};