import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIControllerService } from './ai-controller.server';

// Mock OpenAI
vi.mock('./openai.server', () => ({
  isOpenAIConfigured: vi.fn().mockReturnValue(true),
  openAIService: {
    parseCommand: vi.fn().mockResolvedValue({
      actions: [{
        type: 'create_database',
        name: 'Test Database',
        description: 'A test database',
        columns: [
          { name: 'Name', type: 'text' },
          { name: 'Status', type: 'select', options: ['Active', 'Inactive'] }
        ]
      }],
      explanation: 'Creating a test database'
    })
  }
}));

// Mock Supabase
const mockSupabase = {
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({
          data: { id: 'test-action-log-id' },
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
          data: { id: 'test-action-log-id', parsed_action: { actions: [] } },
          error: null
        }))
      })),
      order: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve({
          data: [],
          error: null
        }))
      }))
    }))
  }))
};

describe('AIControllerService', () => {
  let aiController: AIControllerService;

  beforeEach(() => {
    // Create instance with mocked Supabase
    aiController = new AIControllerService();
    (aiController as any).supabase = mockSupabase;
    vi.clearAllMocks();
  });

  describe('parseCommand', () => {
    it('should parse a database creation command', async () => {
      const result = await aiController.parseCommand(
        'Create a database for tasks',
        'test-workspace-id',
        'test-user-id'
      );

      expect(result).toHaveProperty('actions');
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('create_database');
    });

    it('should handle empty commands', async () => {
      const { openAIService } = await import('./openai.server');
      vi.mocked(openAIService.parseCommand).mockResolvedValueOnce({
        actions: [],
        explanation: 'No valid action found'
      });

      const result = await aiController.parseCommand(
        '',
        'test-workspace-id',
        'test-user-id'
      );

      expect(result.actions).toHaveLength(0);
    });
  });

  describe('generatePreview', () => {
    it('should generate preview for create_database action', async () => {
      const actions = [{
        type: 'create_database' as const,
        name: 'Test Database',
        description: 'A test database',
        columns: [
          { name: 'Name', type: 'text' as const },
          { name: 'Status', type: 'select' as const, options: ['Active', 'Inactive'] }
        ]
      }];

      const preview = await aiController.generatePreview(actions, 'test-workspace-id');

      expect(preview).toHaveLength(1);
      expect(preview[0].type).toBe('create_database');
      expect(preview[0].content).toContain('Test Database');
    });

    it('should generate preview for add_column action', async () => {
      const actions = [{
        type: 'add_column' as const,
        databaseId: 'test-db-id',
        column: {
          name: 'Priority',
          type: 'select' as const,
          options: ['Low', 'Medium', 'High']
        }
      }];

      const preview = await aiController.generatePreview(actions, 'test-workspace-id');

      expect(preview).toHaveLength(1);
      expect(preview[0].type).toBe('add_column');
      expect(preview[0].content).toContain('Priority');
    });

    it('should handle empty actions', async () => {
      const preview = await aiController.generatePreview([], 'test-workspace-id');
      
      expect(preview).toHaveLength(1);
      expect(preview[0].type).toBe('info');
      expect(preview[0].content).toContain('No actions');
    });
  });

  describe('storeActionLog', () => {
    it('should store action log successfully', async () => {
      const command = 'Create a test database';
      const parsedResult = {
        actions: [{
          type: 'create_database' as const,
          name: 'Test DB',
          description: 'Test',
          columns: []
        }],
        explanation: 'Creating database'
      };
      const preview = [{
        type: 'create_database' as const,
        content: 'Will create Test DB'
      }];

      const actionLogId = await aiController.storeActionLog(
        command,
        parsedResult,
        preview,
        'test-workspace-id',
        'test-user-id'
      );

      expect(actionLogId).toBe('test-action-log-id');
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
          { actions: [], explanation: '' },
          [],
          'workspace-id',
          'user-id'
        )
      ).rejects.toThrow('Failed to store action log');
    });
  });

  describe('confirmAction', () => {
    it('should confirm an action', async () => {
      await aiController.confirmAction('test-action-id');

      expect(mockSupabase.from).toHaveBeenCalledWith('action_logs');
      expect(mockSupabase.from().update).toHaveBeenCalled();
    });
  });

  describe('executeActions', () => {
    it('should execute create_database action', async () => {
      const actions = [{
        type: 'create_database' as const,
        name: 'Test Database',
        description: 'A test database',
        columns: []
      }];

      const result = await aiController.executeActions(
        'test-action-id',
        actions,
        'test-workspace-id',
        'test-user-id'
      );

      expect(result.executed).toHaveLength(1);
      expect(result.executed[0].success).toBe(true);
    });

    it('should handle execution errors gracefully', async () => {
      const actions = [{
        type: 'invalid_action' as any,
        name: 'Invalid'
      }];

      const result = await aiController.executeActions(
        'test-action-id',
        actions,
        'test-workspace-id',
        'test-user-id'
      );

      expect(result.executed).toHaveLength(1);
      expect(result.executed[0].success).toBe(false);
    });
  });
});