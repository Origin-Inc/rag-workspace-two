/**
 * Production-ready command pattern implementation for undo/redo with coalescing
 * Supports operation grouping, debouncing, and memory-efficient history management
 */

export interface Command<T = any> {
  id: string;
  timestamp: number;
  execute: () => T | Promise<T>;
  undo: () => void | Promise<void>;
  redo?: () => void | Promise<void>;
  canCoalesce?: (other: Command) => boolean;
  coalesce?: (other: Command) => Command;
  metadata?: {
    type: string;
    description?: string;
    userId?: string;
    sessionId?: string;
  };
}

export interface CommandManagerOptions {
  maxHistorySize?: number;
  coalescingWindow?: number;
  autoSave?: boolean;
  onStateChange?: (state: CommandManagerState) => void;
}

export interface CommandManagerState {
  canUndo: boolean;
  canRedo: boolean;
  historySize: number;
  currentIndex: number;
  isDirty: boolean;
}

export class CommandManager {
  private history: Command[] = [];
  private currentIndex = -1;
  private coalescingTimer: NodeJS.Timeout | null = null;
  private lastCommand: Command | null = null;
  private readonly options: Required<CommandManagerOptions>;
  private savePoint = -1;
  private listeners = new Set<(state: CommandManagerState) => void>();

  constructor(options: CommandManagerOptions = {}) {
    this.options = {
      maxHistorySize: options.maxHistorySize ?? 100,
      coalescingWindow: options.coalescingWindow ?? 500,
      autoSave: options.autoSave ?? false,
      onStateChange: options.onStateChange ?? (() => {}),
    };
  }

  /**
   * Execute a command and add it to history
   */
  async execute<T>(command: Command<T>): Promise<T> {
    // Clear any pending coalescing timer
    if (this.coalescingTimer) {
      clearTimeout(this.coalescingTimer);
      this.coalescingTimer = null;
    }

    // Check if we can coalesce with the last command
    if (this.lastCommand && this.shouldCoalesce(this.lastCommand, command)) {
      const coalescedCommand = this.coalesceCommands(this.lastCommand, command);
      
      // Replace the last command with the coalesced version
      this.history[this.currentIndex] = coalescedCommand;
      this.lastCommand = coalescedCommand;
      
      // Execute only the new part
      const result = await command.execute();
      this.notifyStateChange();
      return result;
    }

    // Remove any commands after current index (for redo)
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Execute the command
    const result = await command.execute();

    // Add to history
    this.history.push(command);
    this.currentIndex++;

    // Maintain max history size
    if (this.history.length > this.options.maxHistorySize) {
      const overflow = this.history.length - this.options.maxHistorySize;
      this.history = this.history.slice(overflow);
      this.currentIndex -= overflow;
      if (this.savePoint >= 0) {
        this.savePoint -= overflow;
      }
    }

    // Set up coalescing window
    this.lastCommand = command;
    this.coalescingTimer = setTimeout(() => {
      this.lastCommand = null;
      this.coalescingTimer = null;
    }, this.options.coalescingWindow);

    this.notifyStateChange();
    return result;
  }

  /**
   * Undo the last command
   */
  async undo(): Promise<void> {
    if (!this.canUndo()) {
      throw new Error('Nothing to undo');
    }

    const command = this.history[this.currentIndex];
    await command.undo();
    this.currentIndex--;
    this.lastCommand = null;
    
    if (this.coalescingTimer) {
      clearTimeout(this.coalescingTimer);
      this.coalescingTimer = null;
    }

    this.notifyStateChange();
  }

  /**
   * Redo the next command
   */
  async redo(): Promise<void> {
    if (!this.canRedo()) {
      throw new Error('Nothing to redo');
    }

    this.currentIndex++;
    const command = this.history[this.currentIndex];
    
    if (command.redo) {
      await command.redo();
    } else {
      await command.execute();
    }

    this.lastCommand = null;
    this.notifyStateChange();
  }

  /**
   * Execute multiple commands as a single undoable operation
   */
  async executeGroup<T>(
    commands: Command[],
    metadata?: { type: string; description?: string }
  ): Promise<T[]> {
    const results: T[] = [];
    const groupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const groupCommand: Command<T[]> = {
      id: groupId,
      timestamp: Date.now(),
      metadata: metadata || { type: 'group' },
      
      execute: async () => {
        const groupResults: T[] = [];
        for (const cmd of commands) {
          groupResults.push(await cmd.execute());
        }
        return groupResults;
      },
      
      undo: async () => {
        // Undo in reverse order
        for (let i = commands.length - 1; i >= 0; i--) {
          await commands[i].undo();
        }
      },
      
      redo: async () => {
        const groupResults: T[] = [];
        for (const cmd of commands) {
          if (cmd.redo) {
            await cmd.redo();
          } else {
            groupResults.push(await cmd.execute());
          }
        }
        return groupResults;
      },
    };

    return this.execute(groupCommand);
  }

  /**
   * Mark current state as saved
   */
  markSavePoint(): void {
    this.savePoint = this.currentIndex;
    this.notifyStateChange();
  }

  /**
   * Check if there are unsaved changes
   */
  isDirty(): boolean {
    // If we've never saved, we're dirty if we have any history
    if (this.savePoint === -1 && this.currentIndex >= 0) {
      return true;
    }
    return this.savePoint !== this.currentIndex;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.savePoint = -1;
    this.lastCommand = null;
    
    if (this.coalescingTimer) {
      clearTimeout(this.coalescingTimer);
      this.coalescingTimer = null;
    }
    
    this.notifyStateChange();
  }

  /**
   * Get current state
   */
  getState(): CommandManagerState {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      historySize: this.history.length,
      currentIndex: this.currentIndex,
      isDirty: this.isDirty(),
    };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: CommandManagerState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get history for debugging/visualization
   */
  getHistory(): ReadonlyArray<Readonly<Command>> {
    return this.history;
  }

  /**
   * Check if two commands should be coalesced
   */
  private shouldCoalesce(cmd1: Command, cmd2: Command): boolean {
    // Don't coalesce if explicitly disabled
    if (!cmd1.canCoalesce || !cmd2.canCoalesce) {
      return false;
    }

    // Check if commands want to coalesce with each other
    return cmd1.canCoalesce(cmd2) || cmd2.canCoalesce(cmd1);
  }

  /**
   * Coalesce two commands into one
   */
  private coalesceCommands(cmd1: Command, cmd2: Command): Command {
    if (cmd1.coalesce) {
      return cmd1.coalesce(cmd2);
    } else if (cmd2.coalesce) {
      return cmd2.coalesce(cmd1);
    }
    
    // Default coalescing: create a group command
    return {
      id: `coalesced-${cmd1.id}-${cmd2.id}`,
      timestamp: cmd1.timestamp,
      metadata: {
        type: 'coalesced',
        description: `Coalesced: ${cmd1.metadata?.description || 'unknown'} + ${cmd2.metadata?.description || 'unknown'}`,
      },
      execute: async () => {
        await cmd1.execute();
        return cmd2.execute();
      },
      undo: async () => {
        await cmd2.undo();
        await cmd1.undo();
      },
      redo: async () => {
        if (cmd1.redo) await cmd1.redo();
        else await cmd1.execute();
        
        if (cmd2.redo) await cmd2.redo();
        else await cmd2.execute();
      },
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyStateChange(): void {
    const state = this.getState();
    this.options.onStateChange(state);
    this.listeners.forEach(listener => listener(state));
  }
}

/**
 * Factory for creating common editor commands
 */
export class EditorCommandFactory {
  /**
   * Create a text insertion command
   */
  static createTextCommand(
    blockId: string,
    oldText: string,
    newText: string,
    updateFn: (blockId: string, text: string) => void
  ): Command {
    return {
      id: `text-${blockId}-${Date.now()}`,
      timestamp: Date.now(),
      metadata: {
        type: 'text',
        description: `Edit text in block ${blockId}`,
      },
      execute: () => updateFn(blockId, newText),
      undo: () => updateFn(blockId, oldText),
      redo: () => updateFn(blockId, newText),
      canCoalesce: (other) => {
        return (
          other.metadata?.type === 'text' &&
          other.id.startsWith(`text-${blockId}-`)
        );
      },
      coalesce: (other) => {
        // When coalescing text edits, keep the original's old text
        // but use the new command's new text
        return EditorCommandFactory.createTextCommand(
          blockId,
          oldText,
          (other as any).newText || newText,
          updateFn
        );
      },
    };
  }

  /**
   * Create a block creation command
   */
  static createBlockCommand(
    block: any,
    addFn: (block: any) => void,
    removeFn: (blockId: string) => void
  ): Command {
    return {
      id: `create-block-${block.id}`,
      timestamp: Date.now(),
      metadata: {
        type: 'create-block',
        description: `Create ${block.type} block`,
      },
      execute: () => addFn(block),
      undo: () => removeFn(block.id),
      redo: () => addFn(block),
    };
  }

  /**
   * Create a block deletion command
   */
  static createDeleteCommand(
    block: any,
    removeFn: (blockId: string) => void,
    addFn: (block: any, index?: number) => void,
    index: number
  ): Command {
    return {
      id: `delete-block-${block.id}`,
      timestamp: Date.now(),
      metadata: {
        type: 'delete-block',
        description: `Delete ${block.type} block`,
      },
      execute: () => removeFn(block.id),
      undo: () => addFn(block, index),
      redo: () => removeFn(block.id),
    };
  }

  /**
   * Create a block move command
   */
  static createMoveCommand(
    blockId: string,
    fromIndex: number,
    toIndex: number,
    moveFn: (blockId: string, fromIndex: number, toIndex: number) => void
  ): Command {
    return {
      id: `move-block-${blockId}`,
      timestamp: Date.now(),
      metadata: {
        type: 'move-block',
        description: `Move block from ${fromIndex} to ${toIndex}`,
      },
      execute: () => moveFn(blockId, fromIndex, toIndex),
      undo: () => moveFn(blockId, toIndex, fromIndex),
      redo: () => moveFn(blockId, fromIndex, toIndex),
    };
  }
}