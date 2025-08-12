import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AIControllerService } from './ai-controller.server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '~/types/supabase';

// Integration tests for AI Controller
// These tests verify the complete flow with real database operations

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

describe('AIControllerService Integration Tests', () => {
  let aiController: AIControllerService;
  let testUserId: string;
  let testWorkspaceId: string;
  let createdResources: Array<{ table: string; id: string }> = [];

  beforeAll(async () => {
    // Setup test data
    aiController = new AIControllerService();
    testWorkspaceId = '550e8400-e29b-41d4-a716-446655440000';
    
    // Get or create a test user
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const testUser = users?.find(u => u.email === 'test@example.com') || users?.[0];
    
    if (!testUser) {
      throw new Error('No test user available');
    }
    
    testUserId = testUser.id;
  });

  afterAll(async () => {
    // Cleanup created resources
    for (const resource of createdResources) {
      await supabase.from(resource.table).delete().eq('id', resource.id);
    }
  });

  describe('Command Parsing', () => {
    it('should parse create database command', async () => {
      const command = 'Create a task tracker with columns for name, status, and due date';
      const result = await aiController.parseCommand(command, testWorkspaceId, testUserId);
      
      expect(result).toBeDefined();
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('create_database');
      expect(result.actions[0].columns).toBeDefined();
      expect(result.actions[0].columns.length).toBeGreaterThan(0);
    });

    it('should parse add column command', async () => {
      const command = 'Add a priority column with options low, medium, high';
      const result = await aiController.parseCommand(command, testWorkspaceId, testUserId);
      
      expect(result).toBeDefined();
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('add_column');
    });

    it('should parse formula command', async () => {
      const command = 'Create a formula to calculate days until due date';
      const result = await aiController.parseCommand(command, testWorkspaceId, testUserId);
      
      expect(result).toBeDefined();
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('create_formula');
    });
  });

  describe('Preview Generation', () => {
    it('should generate preview for create database action', async () => {
      const actions = [{
        type: 'create_database' as const,
        workspaceId: testWorkspaceId,
        userId: testUserId,
        name: 'Test Database',
        description: 'A test database',
        columns: [
          { name: 'Name', type: 'text' as const },
          { name: 'Status', type: 'select' as const, options: ['Active', 'Inactive'] }
        ]
      }];

      const preview = await aiController.generatePreview(actions, testWorkspaceId);
      
      expect(preview).toHaveLength(1);
      expect(preview[0].type).toBe('create_database');
      expect(preview[0].title).toContain('Test Database');
    });

    it('should handle empty actions array', async () => {
      const preview = await aiController.generatePreview([], testWorkspaceId);
      
      expect(preview).toHaveLength(1);
      expect(preview[0].type).toBe('info');
    });
  });

  describe('Action Execution', () => {
    it('should execute create database action', async () => {
      const command = 'Create a test database for integration testing';
      
      // Parse command
      const parseResult = await aiController.parseCommand(command, testWorkspaceId, testUserId);
      expect(parseResult.actions).toHaveLength(1);
      
      // Generate preview
      const preview = await aiController.generatePreview(parseResult.actions, testWorkspaceId);
      expect(preview).toHaveLength(1);
      
      // Store action log
      const actionLogId = await aiController.storeActionLog(
        command,
        parseResult,
        preview,
        testWorkspaceId,
        testUserId
      );
      expect(actionLogId).toBeDefined();
      createdResources.push({ table: 'action_logs', id: actionLogId });
      
      // Execute action
      const result = await aiController.executeActions(
        actionLogId,
        parseResult.actions,
        testWorkspaceId,
        testUserId
      );
      
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      
      // Verify the database was created
      const { data: dbBlock } = await supabase
        .from('db_blocks')
        .select('*')
        .eq('id', result.results[0].databaseBlockId)
        .single();
      
      expect(dbBlock).toBeDefined();
      if (dbBlock) {
        createdResources.push({ table: 'db_blocks', id: dbBlock.id });
      }
    });

    it('should handle execution errors gracefully', async () => {
      const invalidAction = {
        type: 'create_database' as const,
        workspaceId: 'invalid-uuid',
        userId: testUserId,
        name: 'Test',
        columns: []
      };

      await expect(
        aiController.executeActions('test-id', [invalidAction], 'invalid-uuid', testUserId)
      ).rejects.toThrow();
    });
  });

  describe('Status Management', () => {
    it('should confirm action', async () => {
      // Create a test action log
      const { data: actionLog } = await supabase
        .from('action_logs')
        .insert({
          workspace_id: testWorkspaceId,
          user_id: testUserId,
          command: 'Test command',
          parsed_action: { actions: [] },
          preview: [],
          status: 'pending'
        })
        .select()
        .single();
      
      if (actionLog) {
        createdResources.push({ table: 'action_logs', id: actionLog.id });
        
        // Confirm the action
        await aiController.confirmAction(actionLog.id);
        
        // Verify status was updated
        const { data: confirmed } = await supabase
          .from('action_logs')
          .select('status, preview_shown')
          .eq('id', actionLog.id)
          .single();
        
        expect(confirmed?.status).toBe('confirmed');
        expect(confirmed?.preview_shown).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing OpenAI API key gracefully', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      
      const controller = new AIControllerService();
      
      await expect(
        controller.parseCommand('test', testWorkspaceId, testUserId)
      ).rejects.toThrow();
      
      process.env.OPENAI_API_KEY = originalKey;
    });

    it('should handle database connection errors', async () => {
      // Create a controller with invalid supabase connection
      const badSupabase = createClient('http://invalid', 'invalid-key');
      const controller = new AIControllerService();
      (controller as any).supabase = badSupabase;
      
      await expect(
        controller.storeActionLog('test', { actions: [] } as any, [], testWorkspaceId, testUserId)
      ).rejects.toThrow();
    });
  });
});