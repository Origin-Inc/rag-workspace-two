/**
 * Block Manipulation Engine
 * Executes block operations with transaction support and rollback capability
 */

import type { Block } from '~/components/editor/EnhancedBlockEditor';
import type { ParsedBlockCommand } from './block-commands.server';
import { blockTransformer } from './block-transformer.server';
import { chartGenerator } from './chart-generator.server';
import { v4 as uuidv4 } from 'uuid';

export interface ExecutionResult {
  success: boolean;
  blocks: Block[];
  changes: BlockChange[];
  error?: string;
  affectedBlocks?: string[];
}

export interface BlockChange {
  type: 'create' | 'update' | 'delete' | 'move' | 'transform';
  blockId: string;
  previousState?: Block;
  newState?: Block;
  position?: number;
}

interface BlockTransaction {
  id: string;
  changes: BlockChange[];
  originalBlocks: Block[];
  timestamp: Date;
}

export class BlockManipulator {
  private static instance: BlockManipulator;
  private transactionHistory: BlockTransaction[] = [];
  private maxHistorySize = 100;

  private constructor() {}

  static getInstance(): BlockManipulator {
    if (!BlockManipulator.instance) {
      BlockManipulator.instance = new BlockManipulator();
    }
    return BlockManipulator.instance;
  }

  /**
   * Execute a parsed block command
   */
  async execute(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<ExecutionResult> {
    const transaction = this.beginTransaction(blocks);
    
    try {
      let result: ExecutionResult;
      
      switch (command.action) {
        case 'create':
          result = await this.createBlock(command, blocks);
          break;
        case 'delete':
          result = await this.deleteBlocks(command, blocks);
          break;
        case 'transform':
          result = await this.transformBlocks(command, blocks);
          break;
        case 'move':
          result = await this.moveBlocks(command, blocks);
          break;
        case 'edit':
          result = await this.editBlocks(command, blocks);
          break;
        case 'duplicate':
          result = await this.duplicateBlocks(command, blocks);
          break;
        case 'merge':
          result = await this.mergeBlocks(command, blocks);
          break;
        case 'split':
          result = await this.splitBlock(command, blocks);
          break;
        default:
          throw new Error(`Unsupported action: ${command.action}`);
      }
      
      if (result.success) {
        this.commitTransaction(transaction, result.changes);
      } else {
        this.rollbackTransaction(transaction);
      }
      
      return result;
    } catch (error) {
      this.rollbackTransaction(transaction);
      return {
        success: false,
        blocks,
        changes: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Create a new block
   */
  private async createBlock(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<ExecutionResult> {
    const newBlock: Block = {
      id: `block-${uuidv4()}`,
      type: command.parameters.newType || 'paragraph',
      content: command.parameters.content || ''
    };
    
    // Handle database creation
    if (newBlock.type === 'database' && command.parameters.databaseData) {
      console.log('[BlockManipulator] Creating database block with data:', command.parameters.databaseData);
      
      // Format the database content for the DatabaseTableWrapper component
      const columns = (command.parameters.databaseData.columns || [
        { id: 'col1', name: 'Column 1', type: 'text' },
        { id: 'col2', name: 'Column 2', type: 'text' }
      ]).map((col: any, index: number) => ({
        id: col.id || `col${index + 1}`,
        name: col.name || `Column ${index + 1}`,
        type: col.type || 'text',
        position: col.position !== undefined ? col.position : index,
        width: col.width || 200,
        options: col.options || undefined
      }));
      
      // Ensure rows have IDs and cells property matching column structure
      const rows = (command.parameters.databaseData.rows || []).map((row: any, index: number) => {
        // Create properly formatted row with cells property
        const formattedRow: any = {
          id: row.id || `row${index + 1}`,
          blockId: '',
          cells: {},
          position: index,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Copy cell data into cells property
        columns.forEach(col => {
          // Check if data exists in row object (either in cells or directly)
          if (row.cells && row.cells[col.id] !== undefined) {
            formattedRow.cells[col.id] = row.cells[col.id];
          } else if (row[col.id] !== undefined) {
            formattedRow.cells[col.id] = row[col.id];
          } else {
            formattedRow.cells[col.id] = '';
          }
        });
        
        return formattedRow;
      });
      
      // If no rows provided, create one empty row
      if (rows.length === 0) {
        const emptyRow: any = { 
          id: 'row1',
          blockId: '',
          cells: {},
          position: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        columns.forEach(col => {
          emptyRow.cells[col.id] = '';
        });
        rows.push(emptyRow);
      }
      
      newBlock.content = {
        columns,
        rows,
        title: command.parameters.title || 'Database Table'
      };
    } else if (newBlock.type === 'database') {
      // Default empty database if no data provided
      console.log('[BlockManipulator] Creating empty database block');
      newBlock.content = {
        columns: [
          { id: 'col1', name: 'Column 1', type: 'text', position: 0, width: 200 },
          { id: 'col2', name: 'Column 2', type: 'text', position: 1, width: 200 },
          { id: 'col3', name: 'Column 3', type: 'text', position: 2, width: 200 }
        ],
        rows: [
          { 
            id: 'row1', 
            blockId: '',
            cells: { col1: '', col2: '', col3: '' },
            position: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          { 
            id: 'row2',
            blockId: '',
            cells: { col1: '', col2: '', col3: '' },
            position: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        title: 'New Table'
      };
    }

    // Handle chart creation
    if (newBlock.type === 'chart') {
      console.log('[BlockManipulator] Creating chart block with parameters:', command.parameters);
      
      if (command.parameters.chartData) {
        // The chartData from AI already has the correct format
        // Just use it directly instead of trying to transform it
        const chartConfig = {
          type: command.parameters.chartType || 'bar',
          data: command.parameters.chartData,
          options: {
            responsive: true,
            plugins: {
              legend: {
                position: 'top' as const,
              },
              title: {
                display: !!command.parameters.title,
                text: command.parameters.title || 'Chart'
              }
            }
          }
        };
        
        newBlock.content = {
          title: command.parameters.title || 'Chart',
          config: chartConfig,
          createdAt: new Date().toISOString()
        };
        console.log('[BlockManipulator] Generated chart config:', chartConfig);
      } else {
        console.log('[BlockManipulator] No chartData provided, creating empty chart');
        newBlock.content = {
          title: command.parameters.title || 'Chart',
          config: {
            type: command.parameters.chartType || 'bar',
            data: { labels: [], datasets: [] }
          }
        };
      }
    }

    const position = command.parameters.position || 'after';
    const targetIds = command.target.blockIds || [];
    
    let newBlocks = [...blocks];
    let insertIndex = newBlocks.length;
    
    if (targetIds.length > 0) {
      const targetIndex = newBlocks.findIndex(b => b.id === targetIds[0]);
      if (targetIndex !== -1) {
        insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
      }
    }
    
    newBlocks.splice(insertIndex, 0, newBlock);
    
    return {
      success: true,
      blocks: newBlocks,
      changes: [{
        type: 'create',
        blockId: newBlock.id,
        newState: newBlock,
        position: insertIndex
      }],
      affectedBlocks: [newBlock.id]
    };
  }

  /**
   * Delete blocks
   */
  private async deleteBlocks(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<ExecutionResult> {
    const targetIds = command.target.blockIds || [];
    
    if (targetIds.length === 0) {
      return {
        success: false,
        blocks,
        changes: [],
        error: 'No blocks to delete'
      };
    }
    
    const changes: BlockChange[] = [];
    const newBlocks = blocks.filter(block => {
      if (targetIds.includes(block.id)) {
        changes.push({
          type: 'delete',
          blockId: block.id,
          previousState: block
        });
        return false;
      }
      return true;
    });
    
    return {
      success: true,
      blocks: newBlocks,
      changes,
      affectedBlocks: targetIds
    };
  }

  /**
   * Transform blocks to different types
   */
  private async transformBlocks(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<ExecutionResult> {
    const targetIds = command.target.blockIds || [];
    const newType = command.parameters.newType;
    
    if (!newType) {
      return {
        success: false,
        blocks,
        changes: [],
        error: 'No target type specified for transformation'
      };
    }
    
    const changes: BlockChange[] = [];
    const newBlocks = await Promise.all(blocks.map(async block => {
      if (targetIds.includes(block.id)) {
        const transformed = await blockTransformer.transform(block, newType);
        changes.push({
          type: 'transform',
          blockId: block.id,
          previousState: block,
          newState: transformed
        });
        return transformed;
      }
      return block;
    }));
    
    return {
      success: true,
      blocks: newBlocks,
      changes,
      affectedBlocks: targetIds
    };
  }

  /**
   * Move blocks to new positions
   */
  private async moveBlocks(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<ExecutionResult> {
    const sourceIds = command.target.blockIds || [];
    const position = command.parameters.position || 'after';
    const targetId = command.parameters.targetBlockId;
    
    if (sourceIds.length === 0) {
      return {
        success: false,
        blocks,
        changes: [],
        error: 'No blocks to move'
      };
    }
    
    let newBlocks = [...blocks];
    const changes: BlockChange[] = [];
    
    // Extract source blocks
    const sourceBlocks: Block[] = [];
    newBlocks = newBlocks.filter(block => {
      if (sourceIds.includes(block.id)) {
        sourceBlocks.push(block);
        changes.push({
          type: 'move',
          blockId: block.id,
          previousState: block
        });
        return false;
      }
      return true;
    });
    
    // Find insertion point
    let insertIndex = position === 'before' ? 0 : newBlocks.length;
    if (targetId) {
      const targetIndex = newBlocks.findIndex(b => b.id === targetId);
      if (targetIndex !== -1) {
        insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
      }
    }
    
    // Insert source blocks at new position
    newBlocks.splice(insertIndex, 0, ...sourceBlocks);
    
    // Update change records with new positions
    changes.forEach((change, index) => {
      change.position = insertIndex + index;
    });
    
    return {
      success: true,
      blocks: newBlocks,
      changes,
      affectedBlocks: sourceIds
    };
  }

  /**
   * Edit block content
   */
  private async editBlocks(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<ExecutionResult> {
    const targetIds = command.target.blockIds || [];
    const newContent = command.parameters.content;
    
    if (newContent === undefined) {
      return {
        success: false,
        blocks,
        changes: [],
        error: 'No content provided for edit'
      };
    }
    
    const changes: BlockChange[] = [];
    const newBlocks = blocks.map(block => {
      if (targetIds.includes(block.id)) {
        const updatedBlock = {
          ...block,
          content: newContent
        };
        changes.push({
          type: 'update',
          blockId: block.id,
          previousState: block,
          newState: updatedBlock
        });
        return updatedBlock;
      }
      return block;
    });
    
    return {
      success: true,
      blocks: newBlocks,
      changes,
      affectedBlocks: targetIds
    };
  }

  /**
   * Duplicate blocks
   */
  private async duplicateBlocks(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<ExecutionResult> {
    const sourceIds = command.target.blockIds || [];
    
    if (sourceIds.length === 0) {
      return {
        success: false,
        blocks,
        changes: [],
        error: 'No blocks to duplicate'
      };
    }
    
    const newBlocks = [...blocks];
    const changes: BlockChange[] = [];
    const affectedBlocks: string[] = [];
    
    sourceIds.forEach(sourceId => {
      const sourceIndex = newBlocks.findIndex(b => b.id === sourceId);
      if (sourceIndex !== -1) {
        const sourceBlock = newBlocks[sourceIndex];
        const duplicatedBlock: Block = {
          ...sourceBlock,
          id: `block-${uuidv4()}`,
          content: typeof sourceBlock.content === 'object' 
            ? { ...sourceBlock.content }
            : sourceBlock.content
        };
        
        newBlocks.splice(sourceIndex + 1, 0, duplicatedBlock);
        affectedBlocks.push(duplicatedBlock.id);
        
        changes.push({
          type: 'create',
          blockId: duplicatedBlock.id,
          newState: duplicatedBlock,
          position: sourceIndex + 1
        });
      }
    });
    
    return {
      success: true,
      blocks: newBlocks,
      changes,
      affectedBlocks
    };
  }

  /**
   * Merge multiple blocks into one
   */
  private async mergeBlocks(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<ExecutionResult> {
    const targetIds = command.target.blockIds || [];
    
    if (targetIds.length < 2) {
      return {
        success: false,
        blocks,
        changes: [],
        error: 'Need at least 2 blocks to merge'
      };
    }
    
    // Find blocks to merge
    const blocksToMerge = blocks.filter(b => targetIds.includes(b.id));
    if (blocksToMerge.length < 2) {
      return {
        success: false,
        blocks,
        changes: [],
        error: 'Could not find blocks to merge'
      };
    }
    
    // Merge content
    const mergedContent = blocksToMerge
      .map(b => {
        if (typeof b.content === 'string') return b.content;
        if (b.content?.text) return b.content.text;
        return JSON.stringify(b.content);
      })
      .join('\n\n');
    
    // Create merged block
    const mergedBlock: Block = {
      id: blocksToMerge[0].id,
      type: command.parameters.newType || blocksToMerge[0].type,
      content: mergedContent
    };
    
    // Remove old blocks and insert merged one
    const firstBlockIndex = blocks.findIndex(b => b.id === blocksToMerge[0].id);
    const newBlocks = blocks.filter(b => !targetIds.includes(b.id));
    newBlocks.splice(firstBlockIndex, 0, mergedBlock);
    
    const changes: BlockChange[] = [
      {
        type: 'update',
        blockId: mergedBlock.id,
        previousState: blocksToMerge[0],
        newState: mergedBlock
      },
      ...blocksToMerge.slice(1).map(b => ({
        type: 'delete' as const,
        blockId: b.id,
        previousState: b
      }))
    ];
    
    return {
      success: true,
      blocks: newBlocks,
      changes,
      affectedBlocks: [mergedBlock.id]
    };
  }

  /**
   * Split a block into multiple blocks
   */
  private async splitBlock(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<ExecutionResult> {
    const targetIds = command.target.blockIds || [];
    
    if (targetIds.length === 0) {
      return {
        success: false,
        blocks,
        changes: [],
        error: 'No block to split'
      };
    }
    
    const blockToSplit = blocks.find(b => b.id === targetIds[0]);
    if (!blockToSplit) {
      return {
        success: false,
        blocks,
        changes: [],
        error: 'Block not found'
      };
    }
    
    // Split content
    let parts: string[] = [];
    if (typeof blockToSplit.content === 'string') {
      // Split by double newline or paragraph markers
      parts = blockToSplit.content.split(/\n\n+/).filter(p => p.trim());
    } else {
      // For complex content, create a single part
      parts = [JSON.stringify(blockToSplit.content)];
    }
    
    if (parts.length <= 1) {
      return {
        success: false,
        blocks,
        changes: [],
        error: 'Cannot split block - no clear separation points found'
      };
    }
    
    // Create new blocks
    const newBlocks: Block[] = parts.map((part, index) => ({
      id: index === 0 ? blockToSplit.id : `block-${uuidv4()}`,
      type: blockToSplit.type,
      content: part.trim()
    }));
    
    // Replace original block with split blocks
    const blockIndex = blocks.findIndex(b => b.id === blockToSplit.id);
    const resultBlocks = [
      ...blocks.slice(0, blockIndex),
      ...newBlocks,
      ...blocks.slice(blockIndex + 1)
    ];
    
    const changes: BlockChange[] = [
      {
        type: 'update',
        blockId: newBlocks[0].id,
        previousState: blockToSplit,
        newState: newBlocks[0]
      },
      ...newBlocks.slice(1).map((block, index) => ({
        type: 'create' as const,
        blockId: block.id,
        newState: block,
        position: blockIndex + index + 1
      }))
    ];
    
    return {
      success: true,
      blocks: resultBlocks,
      changes,
      affectedBlocks: newBlocks.map(b => b.id)
    };
  }

  /**
   * Begin a new transaction
   */
  private beginTransaction(blocks: Block[]): BlockTransaction {
    return {
      id: uuidv4(),
      changes: [],
      originalBlocks: blocks.map(b => ({ ...b })),
      timestamp: new Date()
    };
  }

  /**
   * Commit a transaction
   */
  private commitTransaction(transaction: BlockTransaction, changes: BlockChange[]): void {
    transaction.changes = changes;
    this.transactionHistory.push(transaction);
    
    // Limit history size
    if (this.transactionHistory.length > this.maxHistorySize) {
      this.transactionHistory.shift();
    }
  }

  /**
   * Rollback a transaction
   */
  private rollbackTransaction(transaction: BlockTransaction): Block[] {
    return transaction.originalBlocks;
  }

  /**
   * Undo the last transaction
   */
  async undo(): Promise<Block[] | null> {
    const lastTransaction = this.transactionHistory.pop();
    if (!lastTransaction) return null;
    
    return lastTransaction.originalBlocks;
  }

  /**
   * Get transaction history
   */
  getHistory(): BlockTransaction[] {
    return this.transactionHistory;
  }

  /**
   * Clear transaction history
   */
  clearHistory(): void {
    this.transactionHistory = [];
  }
}

export const blockManipulator = BlockManipulator.getInstance();