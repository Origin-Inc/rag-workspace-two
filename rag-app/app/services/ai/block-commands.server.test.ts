/**
 * Tests for AI Block Command Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlockCommandService } from './block-commands.server';
import type { Block } from '~/components/editor/EnhancedBlockEditor';

// Mock OpenAI
vi.mock('../openai.server', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  },
  isOpenAIConfigured: vi.fn(() => true)
}));

describe('BlockCommandService', () => {
  let service: BlockCommandService;
  const mockBlocks: Block[] = [
    {
      id: 'block-1',
      type: 'paragraph',
      content: 'First paragraph content'
    },
    {
      id: 'block-2',
      type: 'heading',
      content: 'Test Heading'
    },
    {
      id: 'block-3',
      type: 'list',
      content: {
        items: ['Item 1', 'Item 2', 'Item 3']
      }
    }
  ];

  beforeEach(() => {
    service = BlockCommandService.getInstance();
    vi.clearAllMocks();
  });

  describe('parseCommand', () => {
    it('should parse a simple add command', async () => {
      const result = await service.parseCommand('Add a chart after this paragraph', {
        blocks: mockBlocks,
        selectedBlockId: 'block-1'
      });

      expect(result.action).toBe('create');
      expect(result.parameters.newType).toBe('chart');
      expect(result.parameters.position).toBe('after');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should parse a delete command', async () => {
      const result = await service.parseCommand('Delete the heading', {
        blocks: mockBlocks
      });

      expect(result.action).toBe('delete');
      expect(result.target.reference).toEqual({ type: 'type', value: 'heading' });
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should parse a transform command', async () => {
      const result = await service.parseCommand('Convert this list to a table', {
        blocks: mockBlocks,
        selectedBlockId: 'block-3'
      });

      expect(result.action).toBe('transform');
      expect(result.parameters.newType).toBe('table');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle ambiguous commands with lower confidence', async () => {
      const result = await service.parseCommand('Do something with blocks', {
        blocks: mockBlocks
      });

      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('executeCommand', () => {
    it('should add a new block after selected block', async () => {
      const command = {
        action: 'create' as const,
        confidence: 0.9,
        target: {
          reference: 'selected' as const,
          blockIds: ['block-1']
        },
        parameters: {
          newType: 'paragraph',
          content: 'New paragraph',
          position: 'after' as const
        },
        naturalLanguage: 'Add paragraph after'
      };

      const result = await service.executeCommand(command, {
        blocks: mockBlocks,
        selectedBlockId: 'block-1'
      });

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(4);
      expect(result.blocks[2].type).toBe('paragraph');
      expect(result.blocks[2].content).toBe('New paragraph');
    });

    it('should delete a block', async () => {
      const command = {
        action: 'delete' as const,
        confidence: 0.9,
        target: {
          reference: { type: 'id' as const, value: 'block-2' },
          blockIds: ['block-2']
        },
        parameters: {},
        naturalLanguage: 'Delete block'
      };

      const result = await service.executeCommand(command, {
        blocks: mockBlocks
      });

      expect(result.success).toBe(true);
      expect(result.blocks).toHaveLength(2);
      expect(result.blocks.find(b => b.id === 'block-2')).toBeUndefined();
    });

    it('should transform a block type', async () => {
      const command = {
        action: 'transform' as const,
        confidence: 0.9,
        target: {
          reference: { type: 'id' as const, value: 'block-3' },
          blockIds: ['block-3']
        },
        parameters: {
          newType: 'table'
        },
        naturalLanguage: 'Transform to table'
      };

      const result = await service.executeCommand(command, {
        blocks: mockBlocks
      });

      expect(result.success).toBe(true);
      expect(result.blocks[2].type).toBe('table');
      expect(result.blocks[2].id).toBe('block-3');
    });

    it('should handle invalid commands gracefully', async () => {
      const command = {
        action: 'invalid' as any,
        confidence: 0.9,
        target: {
          reference: 'all' as const
        },
        parameters: {},
        naturalLanguage: 'Invalid command'
      };

      const result = await service.executeCommand(command, {
        blocks: mockBlocks
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('identifyTargetBlocks', () => {
    it('should identify block by id', () => {
      const blocks = service['identifyTargetBlocks'](
        { type: 'id', value: 'block-2' },
        mockBlocks,
        {}
      );

      expect(blocks).toEqual(['block-2']);
    });

    it('should identify block by type', () => {
      const blocks = service['identifyTargetBlocks'](
        { type: 'type', value: 'heading' },
        mockBlocks,
        {}
      );

      expect(blocks).toEqual(['block-2']);
    });

    it('should identify selected block', () => {
      const blocks = service['identifyTargetBlocks'](
        'selected',
        mockBlocks,
        { selectedBlockId: 'block-1' }
      );

      expect(blocks).toEqual(['block-1']);
    });

    it('should identify all blocks', () => {
      const blocks = service['identifyTargetBlocks'](
        'all',
        mockBlocks,
        {}
      );

      expect(blocks).toEqual(['block-1', 'block-2', 'block-3']);
    });

    it('should identify first and last blocks', () => {
      const firstBlocks = service['identifyTargetBlocks'](
        'first',
        mockBlocks,
        {}
      );
      expect(firstBlocks).toEqual(['block-1']);

      const lastBlocks = service['identifyTargetBlocks'](
        'last',
        mockBlocks,
        {}
      );
      expect(lastBlocks).toEqual(['block-3']);
    });
  });
});