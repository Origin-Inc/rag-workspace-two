import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandManager, EditorCommandFactory, type Command } from './command-manager';

describe('CommandManager', () => {
  let manager: CommandManager;
  let stateChangeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stateChangeSpy = vi.fn();
    manager = new CommandManager({
      maxHistorySize: 10,
      coalescingWindow: 100,
      onStateChange: stateChangeSpy,
    });
  });

  describe('execute', () => {
    it('should execute a command and add it to history', async () => {
      const executeSpy = vi.fn(() => 'result');
      const undoSpy = vi.fn();
      
      const command: Command = {
        id: 'test-1',
        timestamp: Date.now(),
        execute: executeSpy,
        undo: undoSpy,
      };

      const result = await manager.execute(command);
      
      expect(result).toBe('result');
      expect(executeSpy).toHaveBeenCalledTimes(1);
      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(false);
    });

    it('should limit history size', async () => {
      const commands: Command[] = [];
      
      for (let i = 0; i < 15; i++) {
        commands.push({
          id: `test-${i}`,
          timestamp: Date.now(),
          execute: () => i,
          undo: () => {},
        });
      }

      for (const cmd of commands) {
        await manager.execute(cmd);
      }

      const history = manager.getHistory();
      expect(history.length).toBe(10); // Max history size
      expect(history[0].id).toBe('test-5'); // First 5 removed
    });
  });

  describe('undo/redo', () => {
    it('should undo and redo commands', async () => {
      const value = { current: 0 };
      
      const command: Command = {
        id: 'test-1',
        timestamp: Date.now(),
        execute: () => { value.current = 1; },
        undo: () => { value.current = 0; },
        redo: () => { value.current = 1; },
      };

      await manager.execute(command);
      expect(value.current).toBe(1);
      
      await manager.undo();
      expect(value.current).toBe(0);
      expect(manager.canUndo()).toBe(false);
      expect(manager.canRedo()).toBe(true);
      
      await manager.redo();
      expect(value.current).toBe(1);
      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(false);
    });

    it('should clear redo history on new command', async () => {
      const commands = [
        { id: '1', timestamp: Date.now(), execute: () => 1, undo: () => {} },
        { id: '2', timestamp: Date.now(), execute: () => 2, undo: () => {} },
        { id: '3', timestamp: Date.now(), execute: () => 3, undo: () => {} },
      ];

      for (const cmd of commands) {
        await manager.execute(cmd);
      }

      await manager.undo();
      await manager.undo();
      expect(manager.canRedo()).toBe(true);

      await manager.execute({
        id: 'new',
        timestamp: Date.now(),
        execute: () => 4,
        undo: () => {},
      });

      expect(manager.canRedo()).toBe(false);
    });
  });

  describe('coalescing', () => {
    it('should coalesce compatible commands', async () => {
      const updates: string[] = [];
      
      const createTextCommand = (text: string): Command => ({
        id: `text-${Date.now()}`,
        timestamp: Date.now(),
        execute: () => { updates.push(text); },
        undo: () => { updates.pop(); },
        canCoalesce: (other) => other.metadata?.type === 'text',
        coalesce: (other) => createTextCommand(text + (other as any).text),
        metadata: { type: 'text' },
        text, // Store text for coalescing
      } as any);

      const cmd1 = createTextCommand('Hello');
      const cmd2 = createTextCommand(' World');

      await manager.execute(cmd1);
      
      // Execute quickly for coalescing
      await manager.execute(cmd2);
      
      const history = manager.getHistory();
      expect(history.length).toBe(1); // Commands coalesced
      expect(updates).toEqual(['Hello', ' World']);
    });

    it('should not coalesce after timeout', async () => {
      const cmd1: Command = {
        id: 'test-1',
        timestamp: Date.now(),
        execute: () => 1,
        undo: () => {},
        canCoalesce: () => true,
      };

      const cmd2: Command = {
        id: 'test-2',
        timestamp: Date.now(),
        execute: () => 2,
        undo: () => {},
        canCoalesce: () => true,
      };

      await manager.execute(cmd1);
      
      // Wait for coalescing window to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      await manager.execute(cmd2);
      
      const history = manager.getHistory();
      expect(history.length).toBe(2); // Commands not coalesced
    });
  });

  describe('executeGroup', () => {
    it('should execute multiple commands as a single operation', async () => {
      const values: number[] = [];
      
      const commands: Command[] = [
        { id: '1', timestamp: Date.now(), execute: () => values.push(1), undo: () => values.pop() },
        { id: '2', timestamp: Date.now(), execute: () => values.push(2), undo: () => values.pop() },
        { id: '3', timestamp: Date.now(), execute: () => values.push(3), undo: () => values.pop() },
      ];

      await manager.executeGroup(commands, { type: 'batch', description: 'Batch operation' });
      
      expect(values).toEqual([1, 2, 3]);
      expect(manager.getHistory().length).toBe(1);
      
      await manager.undo();
      expect(values).toEqual([]);
      
      await manager.redo();
      expect(values).toEqual([1, 2, 3]);
    });
  });

  describe('save points', () => {
    it('should track dirty state with save points', async () => {
      expect(manager.isDirty()).toBe(false);
      
      await manager.execute({
        id: 'test',
        timestamp: Date.now(),
        execute: () => {},
        undo: () => {},
      });
      
      expect(manager.isDirty()).toBe(true);
      
      manager.markSavePoint();
      expect(manager.isDirty()).toBe(false);
      
      await manager.execute({
        id: 'test2',
        timestamp: Date.now(),
        execute: () => {},
        undo: () => {},
      });
      
      expect(manager.isDirty()).toBe(true);
      
      await manager.undo();
      expect(manager.isDirty()).toBe(false); // Back at save point
      
      await manager.undo();
      expect(manager.isDirty()).toBe(true); // Before save point
      
      await manager.redo();
      expect(manager.isDirty()).toBe(false); // Back at save point
    });
  });

  describe('state notifications', () => {
    it('should notify on state changes', async () => {
      const listener = vi.fn();
      const unsubscribe = manager.subscribe(listener);
      
      await manager.execute({
        id: 'test',
        timestamp: Date.now(),
        execute: () => {},
        undo: () => {},
      });
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          canUndo: true,
          canRedo: false,
          isDirty: true,
        })
      );
      
      await manager.undo();
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          canUndo: false,
          canRedo: true,
        })
      );
      
      unsubscribe();
      
      await manager.redo();
      expect(listener).toHaveBeenCalledTimes(2); // Not called after unsubscribe
    });
  });
});

describe('EditorCommandFactory', () => {
  describe('createTextCommand', () => {
    it('should create a coalesceable text command', () => {
      let currentText = 'initial';
      const updateFn = (id: string, text: string) => { currentText = text; };
      
      const cmd = EditorCommandFactory.createTextCommand(
        'block-1',
        'initial',
        'updated',
        updateFn
      );
      
      expect(cmd.metadata?.type).toBe('text');
      
      cmd.execute();
      expect(currentText).toBe('updated');
      
      cmd.undo();
      expect(currentText).toBe('initial');
      
      cmd.redo?.();
      expect(currentText).toBe('updated');
      
      // Test coalescing
      const cmd2 = EditorCommandFactory.createTextCommand(
        'block-1',
        'updated',
        'updated more',
        updateFn
      );
      
      expect(cmd.canCoalesce?.(cmd2)).toBe(true);
    });
  });

  describe('createBlockCommand', () => {
    it('should create a block creation command', () => {
      const blocks: any[] = [];
      const addFn = (block: any) => blocks.push(block);
      const removeFn = (id: string) => {
        const index = blocks.findIndex(b => b.id === id);
        if (index >= 0) blocks.splice(index, 1);
      };
      
      const block = { id: 'test-block', type: 'paragraph', content: 'Test' };
      const cmd = EditorCommandFactory.createBlockCommand(block, addFn, removeFn);
      
      cmd.execute();
      expect(blocks).toContainEqual(block);
      
      cmd.undo();
      expect(blocks).toEqual([]);
      
      cmd.redo?.();
      expect(blocks).toContainEqual(block);
    });
  });

  describe('createMoveCommand', () => {
    it('should create a move command', () => {
      const blocks = [
        { id: '1', position: 0 },
        { id: '2', position: 1 },
        { id: '3', position: 2 },
      ];
      
      const moveFn = (id: string, from: number, to: number) => {
        const block = blocks.splice(from, 1)[0];
        blocks.splice(to, 0, block);
        blocks.forEach((b, i) => b.position = i);
      };
      
      const cmd = EditorCommandFactory.createMoveCommand('2', 1, 0, moveFn);
      
      cmd.execute();
      expect(blocks[0].id).toBe('2');
      expect(blocks[1].id).toBe('1');
      
      cmd.undo();
      expect(blocks[0].id).toBe('1');
      expect(blocks[1].id).toBe('2');
    });
  });
});