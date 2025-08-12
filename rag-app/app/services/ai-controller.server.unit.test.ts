import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIControllerService } from './ai-controller.server';
import { createChatCompletion } from './openai.server';
import type { ActionPreview } from '~/types/ai-actions';

// Mock dependencies
vi.mock('./openai.server', () => ({
  isOpenAIConfigured: vi.fn().mockReturnValue(true),
  openAIService: {
    parseCommand: vi.fn()
  },
  createChatCompletion: vi.fn(),
  SYSTEM_PROMPTS: {
    COMMAND_INTERPRETER: 'You are an AI that parses database commands.'
  }
}));

// Mock Supabase
const mockSupabase = {
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({
          data: { id: 'test-id' },
          error: null
        }))
      }))
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null }))
    })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({
          data: { id: 'test-id', parsed_action: { actions: [] } },
          error: null
        }))
      })),
      order: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve({
          data: [],
          error: null
        }))
      }))
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null }))
    }))
  }))
};

describe('AIControllerService Unit Tests', () => {
  let aiController: AIControllerService;
  const testWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const testUserId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    vi.clearAllMocks();
    aiController = new AIControllerService();
    (aiController as any).supabase = mockSupabase;
  });

  describe('parseCommand', () => {
    it('should parse a simple database creation command', async () => {
      vi.mocked(createChatCompletion).mockResolvedValueOnce({
        choices: [{
          message: {
            function_call: {
              name: 'create_database',
              arguments: JSON.stringify({
                name: 'Tasks',
                description: 'Task tracker',
                columns: [
                  { name: 'Title', type: 'text' }
                ]
              })
            }
          }
        }]
      } as any);

      const result = await aiController.parseCommand(
        'Create a task database',
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(result).toHaveProperty('actions');
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('create_database');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle empty command', async () => {
      vi.mocked(createChatCompletion).mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'No valid action found'
          }
        }]
      } as any);

      const result = await aiController.parseCommand(
        '',
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(result.actions).toHaveLength(0);
    });

    it('should add intelligent column suggestions', async () => {
      vi.mocked(createChatCompletion).mockResolvedValueOnce({
        choices: [{
          message: {
            function_call: {
              name: 'create_database',
              arguments: JSON.stringify({
                name: 'Project Tasks',
                description: 'Track project tasks',
                columns: [
                  { name: 'Title', type: 'text' }
                ],
                suggestColumns: true
              })
            }
          }
        }]
      } as any);

      const result = await aiController.parseCommand(
        'Create a project task tracker',
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(result.actions[0].columns.length).toBeGreaterThan(1);
      // Should have added suggested columns like Status, Priority, etc.
      const columnNames = result.actions[0].columns.map((c: any) => c.name);
      expect(columnNames).toContain('Title');
    });
  });

  describe('generatePreview', () => {
    it('should generate preview for create_database action', async () => {
      const actions = [{
        type: 'create_database' as const,
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Test DB',
        description: 'Test database',
        columns: [
          { name: 'Title', type: 'text' as const }
        ]
      }];

      const preview = await aiController.generatePreview(actions, '550e8400-e29b-41d4-a716-446655440000');

      expect(preview).toHaveLength(1);
      expect(preview[0].type).toBe('create_database');
      expect(preview[0].title).toContain('Test DB');
      expect(preview[0].requiresConfirmation).toBe(true);
      expect(preview[0].reversible).toBe(true);
    });

    it('should generate preview for add_column action', async () => {
      const actions = [{
        type: 'add_column' as const,
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        databaseBlockId: 'db-123',
        column: {
          name: 'Priority',
          type: 'select' as const,
          options: ['Low', 'Medium', 'High']
        }
      }];

      const preview = await aiController.generatePreview(actions, '550e8400-e29b-41d4-a716-446655440000');

      expect(preview).toHaveLength(1);
      expect(preview[0].type).toBe('add_column');
      expect(preview[0].title).toContain('Priority');
    });

    it('should handle empty actions array', async () => {
      const preview = await aiController.generatePreview([], '550e8400-e29b-41d4-a716-446655440000');

      expect(preview).toHaveLength(0);
    });

    it('should generate preview for multiple actions', async () => {
      const actions = [
        {
          type: 'create_database' as const,
          workspaceId: '550e8400-e29b-41d4-a716-446655440000',
          userId: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Test DB',
          columns: []
        },
        {
          type: 'add_column' as const,
          workspaceId: '550e8400-e29b-41d4-a716-446655440000',
          userId: '550e8400-e29b-41d4-a716-446655440001',
          databaseBlockId: 'db-123',
          column: { name: 'Status', type: 'select' as const }
        }
      ];

      const preview = await aiController.generatePreview(actions, '550e8400-e29b-41d4-a716-446655440000');

      expect(preview).toHaveLength(2);
      expect(preview[0].type).toBe('create_database');
      expect(preview[1].type).toBe('add_column');
    });
  });

  describe('storeActionLog', () => {
    it('should store action log successfully', async () => {
      const command = 'Create test database';
      const parsedResult = {
        actions: [{
          type: 'create_database' as const,
          name: 'Test',
          columns: []
        }],
        explanation: 'Creating database'
      };
      const preview: ActionPreview[] = [{
        actionId: '123',
        type: 'create_database',
        title: 'Create Database: Test',
        description: 'Will create a new database',
        impact: { creates: ['database'] },
        preview: { after: {} },
        requiresConfirmation: true,
        reversible: true
      }];

      const actionLogId = await aiController.storeActionLog(
        command,
        parsedResult as any,
        preview,
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(actionLogId).toBe('test-id');
      expect(mockSupabase.from).toHaveBeenCalledWith('action_logs');
    });

    it('should handle storage errors', async () => {
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: null,
              error: { message: 'Database error' }
            }))
          }))
        }))
      });

      await expect(
        aiController.storeActionLog(
          'test',
          { actions: [], explanation: '' } as any,
          [],
          '550e8400-e29b-41d4-a716-446655440000',
          '550e8400-e29b-41d4-a716-446655440001'
        )
      ).rejects.toThrow('Failed to store action log');
    });
  });

  describe('confirmAction', () => {
    it('should update action status to confirmed', async () => {
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }));
      
      mockSupabase.from.mockReturnValueOnce({
        update: mockUpdate
      });
      
      await aiController.confirmAction('action-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('action_logs');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          preview_shown: true,
          status: 'confirmed'
        })
      );
    });

    it('should handle confirmation errors', async () => {
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            error: { message: 'Update failed' }
          }))
        }))
      });

      await expect(
        aiController.confirmAction('action-123')
      ).rejects.toThrow('Failed to confirm action');
    });
  });

  describe('executeActions', () => {
    it('should execute actions and update status to completed', async () => {
      const actions = [{
        type: 'create_database' as const,
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Test DB',
        columns: []
      }];

      // Mock successful database creation
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'db_blocks') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { id: 'db-block-123', name: 'Test DB' },
                  error: null
                }))
              }))
            }))
          };
        }
        // Default mock for action_logs update
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null }))
          }))
        };
      });

      const result = await aiController.executeActions(
        'action-123',
        actions,
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
    });

    it('should handle execution failures and update status to failed', async () => {
      const actions = [{
        type: 'create_database' as const,
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Test DB',
        columns: []
      }];

      // Mock database creation failure
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'db_blocks') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: null,
                  error: { message: 'Creation failed' }
                }))
              }))
            }))
          };
        }
        // Default mock for action_logs update
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null }))
          }))
        };
      });

      await expect(
        aiController.executeActions('action-123', actions, '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001')
      ).rejects.toThrow('Failed to create database block');
    });
  });

  describe('Action Type Support', () => {
    it('should support all defined action types', async () => {
      const actionTypes = [
        'create_database',
        'add_column',
        'create_formula',
        'create_block',
        'update_block',
        'delete_block',
        'move_block',
        'query_data'
      ];

      // Create a mock for db_blocks table insertion
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'db_blocks') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { id: 'test-db-id' },
                  error: null
                }))
              }))
            }))
          };
        }
        if (table === 'database_columns') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { id: 'test-col-id' },
                  error: null
                }))
              }))
            }))
          };
        }
        if (table === 'blocks') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { id: 'test-block-id' },
                  error: null
                }))
              }))
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null }))
            })),
            delete: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null }))
            }))
          };
        }
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null }))
          }))
        };
      });

      // Test that all action types can be executed without throwing
      for (const type of actionTypes) {
        const action = {
          type: type as any,
          workspaceId: '550e8400-e29b-41d4-a716-446655440000',
          userId: '550e8400-e29b-41d4-a716-446655440001',
          // Add type-specific required fields
          ...(type === 'create_database' ? { name: 'Test', columns: [] } : {}),
          ...(type === 'add_column' ? { databaseBlockId: 'db-123', column: { name: 'Test', type: 'text' } } : {}),
          ...(type === 'create_formula' ? { databaseBlockId: 'db-123', columnName: 'Test', formula: 'SUM()' } : {}),
          ...(type === 'create_block' ? { pageId: 'page-123', blockType: 'text', content: 'Test' } : {}),
          ...(type === 'update_block' ? { blockId: 'block-123', updates: {} } : {}),
          ...(type === 'delete_block' ? { blockId: 'block-123' } : {}),
          ...(type === 'move_block' ? { blockId: 'block-123', targetPosition: 0 } : {}),
          ...(type === 'query_data' ? { query: 'test query' } : {}),
        };

        try {
          const result = await aiController['executeAction'](action, '550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001');
          expect(result).toHaveProperty('success');
        } catch (error) {
          // query_data is expected to return a placeholder
          if (type === 'query_data') {
            expect(result).toBeDefined();
          } else {
            throw error;
          }
        }
      }
    });
  });
});