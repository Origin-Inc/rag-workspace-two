import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SYSTEM_PROMPTS } from '../openai.server';

// Mock OpenAI module
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn()
        }
      },
      models: {
        list: vi.fn()
      }
    }))
  };
});

describe('OpenAI Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up a test API key for most tests
    process.env.OPENAI_API_KEY = 'test-api-key';
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  describe('parseDatabaseCommand', () => {
    it('should parse project task database command correctly', async () => {
      const mockResponse = {
        choices: [{
          message: {
            function_call: {
              name: 'create_database_schema',
              arguments: JSON.stringify({
                databaseName: 'Project Tasks',
                description: 'Track project tasks and assignments',
                columns: [
                  { name: 'Task Name', type: 'text', required: true },
                  { name: 'Status', type: 'select', options: ['Not Started', 'In Progress', 'Completed'] },
                  { name: 'Assignee', type: 'user' },
                  { name: 'Due Date', type: 'date' },
                  { name: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
                  { name: 'Progress', type: 'percent' },
                  { name: 'Created', type: 'created_time' },
                  { name: 'Updated', type: 'updated_time' }
                ],
                confidence: 0.95
              })
            }
          }
        }]
      };

      // Mock the createChatCompletion function
      const openaiModule = await import('../openai.server');
      vi.spyOn(openaiModule, 'createChatCompletion').mockResolvedValue(mockResponse as any);

      const result = await openaiModule.parseDatabaseCommand('Create a database to track project tasks');
      
      expect(result.databaseName).toBe('Project Tasks');
      expect(result.columns).toHaveLength(8);
      expect(result.columns[0]).toEqual({
        name: 'Task Name',
        type: 'text',
        required: true
      });
      expect(result.confidence).toBe(0.95);
    });

    it('should parse expense tracker database command correctly', async () => {
      const mockResponse = {
        choices: [{
          message: {
            function_call: {
              name: 'create_database_schema',
              arguments: JSON.stringify({
                databaseName: 'Expense Tracker',
                description: 'Track expenses and budgets',
                columns: [
                  { name: 'Date', type: 'date', required: true },
                  { name: 'Description', type: 'text', required: true },
                  { name: 'Amount', type: 'currency', required: true },
                  { name: 'Category', type: 'select', options: ['Food', 'Transport', 'Entertainment', 'Other'] },
                  { name: 'Payment Method', type: 'select', options: ['Cash', 'Credit Card', 'Debit Card'] },
                  { name: 'Receipt', type: 'url' },
                  { name: 'Notes', type: 'text' }
                ],
                confidence: 0.92
              })
            }
          }
        }]
      };

      const openaiModule = await import('../openai.server');
      vi.spyOn(openaiModule, 'createChatCompletion').mockResolvedValue(mockResponse as any);

      const result = await openaiModule.parseDatabaseCommand('I need an expense tracker database');
      
      expect(result.databaseName).toBe('Expense Tracker');
      expect(result.columns.find(c => c.name === 'Amount')?.type).toBe('currency');
      expect(result.columns.find(c => c.name === 'Category')?.options).toContain('Food');
    });

    it('should throw error when OpenAI is not configured', async () => {
      // Remove API key
      delete process.env.OPENAI_API_KEY;
      
      // Re-import to get unconfigured version
      vi.resetModules();
      const { parseDatabaseCommand: parseCmd } = await import('../openai.server');
      
      await expect(parseCmd('Create a database')).rejects.toThrow('OpenAI API is not configured');
    });
  });

  describe('parseFormulaCommand', () => {
    it('should parse formula for calculating days until due date', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'DAYS_UNTIL([Due Date])'
          }
        }]
      };

      const openaiModule = await import('../openai.server');
      vi.spyOn(openaiModule, 'createChatCompletion').mockResolvedValue(mockResponse as any);

      const result = await openaiModule.parseFormulaCommand(
        'Calculate days until due date',
        ['Due Date', 'Start Date', 'Status']
      );
      
      expect(result.formula).toBe('DAYS_UNTIL([Due Date])');
      expect(result.dependencies).toContain('Due Date');
    });

    it('should parse formula for calculating total from price and quantity', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '[Price] * [Quantity]'
          }
        }]
      };

      const openaiModule = await import('../openai.server');
      vi.spyOn(openaiModule, 'createChatCompletion').mockResolvedValue(mockResponse as any);

      const result = await openaiModule.parseFormulaCommand(
        'Calculate total from price and quantity',
        ['Price', 'Quantity', 'Discount']
      );
      
      expect(result.formula).toBe('[Price] * [Quantity]');
      expect(result.dependencies).toEqual(['Price', 'Quantity']);
    });
  });

  describe('retryWithBackoff', () => {
    it('should retry on transient errors', async () => {
      const { retryWithBackoff: retry } = await import('../openai.server');
      let attempts = 0;
      const fn = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Transient error');
        }
        return 'success';
      });

      const result = await retry(fn, 3, 10);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on authentication errors', async () => {
      const { retryWithBackoff: retry } = await import('../openai.server');
      const authError = { message: 'Unauthorized', status: 401 };
      const fn = vi.fn().mockRejectedValue(authError);

      await expect(retry(fn, 3, 10)).rejects.toEqual(authError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries', async () => {
      const { retryWithBackoff: retry } = await import('../openai.server');
      const fn = vi.fn().mockRejectedValue(new Error('Persistent error'));

      await expect(retry(fn, 2, 10)).rejects.toThrow('Persistent error');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('isOpenAIConfigured', () => {
    it('should return true when API key is set', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      vi.resetModules();
      
      const { isOpenAIConfigured } = await import('../openai.server');
      expect(isOpenAIConfigured()).toBe(true);
    });

    it('should return false when API key is not set', async () => {
      delete process.env.OPENAI_API_KEY;
      vi.resetModules();
      
      const { isOpenAIConfigured } = await import('../openai.server');
      expect(isOpenAIConfigured()).toBe(false);
    });
  });

  describe('validateAPIKey', () => {
    it('should return true for valid API key', async () => {
      const openaiModule = await import('../openai.server');
      if (openaiModule.openai) {
        vi.spyOn(openaiModule.openai.models, 'list').mockResolvedValue({ data: [] } as any);
      }
      const { validateAPIKey: validate } = openaiModule;
      const result = await validate();
      
      expect(result).toBe(true);
    });

    it('should return false for invalid API key', async () => {
      const openaiModule = await import('../openai.server');
      if (openaiModule.openai) {
        vi.spyOn(openaiModule.openai.models, 'list').mockRejectedValue(new Error('Invalid API key'));
      }
      const { validateAPIKey: validate } = openaiModule;
      const result = await validate();
      
      expect(result).toBe(false);
    });

    it('should return false when not configured', async () => {
      delete process.env.OPENAI_API_KEY;
      vi.resetModules();
      
      const { validateAPIKey: validate } = await import('../openai.server');
      const result = await validate();
      
      expect(result).toBe(false);
    });
  });

  describe('System Prompts', () => {
    it('should have comprehensive database parser prompt', () => {
      expect(SYSTEM_PROMPTS.DATABASE_PARSER).toContain('Project/Task tracking');
      expect(SYSTEM_PROMPTS.DATABASE_PARSER).toContain('Expense/Budget tracking');
      expect(SYSTEM_PROMPTS.DATABASE_PARSER).toContain('COLUMN TYPE SELECTION');
      expect(SYSTEM_PROMPTS.DATABASE_PARSER).toContain('FORMULA UNDERSTANDING');
    });

    it('should have command interpreter prompt', () => {
      expect(SYSTEM_PROMPTS.COMMAND_INTERPRETER).toContain('SUPPORTED ACTIONS');
      expect(SYSTEM_PROMPTS.COMMAND_INTERPRETER).toContain('Database Creation');
      expect(SYSTEM_PROMPTS.COMMAND_INTERPRETER).toContain('IMPORTANT RULES');
    });
  });
});