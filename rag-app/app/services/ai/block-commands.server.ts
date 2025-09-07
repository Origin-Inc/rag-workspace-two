/**
 * AI-Powered Block Manipulation Service
 * Production-ready natural language command processing for block operations
 */

import { openai, isOpenAIConfigured } from '../openai.server';
import type { Block } from '~/components/editor/EnhancedBlockEditor';
import { v4 as uuidv4 } from 'uuid';
import { blockManipulator } from './block-manipulator.server';
import { aiFeedbackService } from './ai-feedback.server';

export type BlockReference = 
  | 'this' 
  | 'above' 
  | 'below' 
  | 'first' 
  | 'last' 
  | 'all'
  | 'selected'
  | { type: 'position', value: number }
  | { type: 'content', value: string }
  | { type: 'type', value: string }
  | { type: 'id', value: string };

export type BlockAction = 
  | 'create'
  | 'edit'
  | 'delete'
  | 'move'
  | 'transform'
  | 'duplicate'
  | 'merge'
  | 'split'
  | 'style';

export interface ParsedBlockCommand {
  action: BlockAction;
  confidence: number;
  target: {
    reference: BlockReference;
    blockIds?: string[];
  };
  parameters: {
    newType?: string;
    content?: any;
    position?: 'before' | 'after' | 'inside' | 'replace';
    style?: Record<string, any>;
    count?: number;
  };
  naturalLanguage: string;
}

export interface BlockCommandContext {
  blocks: Block[];
  selectedBlockId?: string;
  cursorBlockId?: string;
  pageId: string;
  userId: string;
}

export interface BlockCommandResult {
  success: boolean;
  blocks: Block[];
  changes: Array<{
    type: 'added' | 'modified' | 'deleted' | 'moved' | 'create' | 'update' | 'delete' | 'move' | 'transform';
    blockId: string;
    description?: string;
    previousState?: Block;
    newState?: Block;
    position?: number;
  }>;
  error?: string;
  message?: string;
  undoCommand?: () => Block[];
}

export class BlockCommandService {
  private static instance: BlockCommandService;

  static getInstance(): BlockCommandService {
    if (!this.instance) {
      this.instance = new BlockCommandService();
    }
    return this.instance;
  }

  /**
   * Parse natural language command into structured format
   */
  async parseCommand(
    command: string,
    context: BlockCommandContext
  ): Promise<ParsedBlockCommand> {
    if (!isOpenAIConfigured()) {
      throw new Error('OpenAI is not configured');
    }

    // Debug logging for selected block content
    if (context.selectedBlockId) {
      const selectedBlock = context.blocks.find(b => b.id === context.selectedBlockId);
      if (selectedBlock) {
        console.log('[BlockCommandService] Selected block found:', {
          id: selectedBlock.id,
          type: selectedBlock.type,
          content: typeof selectedBlock.content === 'string' 
            ? selectedBlock.content.substring(0, 100) 
            : JSON.stringify(selectedBlock.content).substring(0, 100)
        });
      } else {
        console.log('[BlockCommandService] Selected block ID provided but block not found:', context.selectedBlockId);
      }
    } else {
      console.log('[BlockCommandService] No selected block ID provided');
    }

    const systemPrompt = this.buildSystemPrompt(context);
    const functions = this.getCommandFunctions();

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: command }
        ],
        functions,
        function_call: { name: 'parse_block_command' },
        temperature: 0.3,
        max_tokens: 1000
      });

      const functionCall = completion.choices[0]?.message?.function_call;
      if (!functionCall) {
        throw new Error('Failed to parse command');
      }

      const parsed = JSON.parse(functionCall.arguments);
      
      // Ensure target has a reference
      if (!parsed.target || !parsed.target.reference) {
        parsed.target = {
          reference: parsed.action === 'create' ? 'after' : 'selected',
          ...parsed.target
        };
      }
      
      console.log('[BlockCommandService] Parsed command:', JSON.stringify(parsed, null, 2));
      
      return {
        ...parsed,
        naturalLanguage: command,
        confidence: this.calculateConfidence(parsed, command, context)
      };
    } catch (error) {
      console.error('[BlockCommandService] Error parsing command:', error);
      console.error('[BlockCommandService] Command was:', command);
      console.error('[BlockCommandService] Context blocks:', context.blocks.length);
      if (error instanceof Error) {
        console.error('[BlockCommandService] Error details:', error.message, error.stack);
      }
      throw new Error('Failed to understand command. Please try rephrasing.');
    }
  }

  /**
   * Execute a parsed command
   */
  async executeCommand(
    parsedCommand: ParsedBlockCommand,
    context: BlockCommandContext
  ): Promise<BlockCommandResult> {
    try {
      // Identify target blocks
      const targetBlocks = this.identifyTargetBlocks(
        parsedCommand.target.reference,
        context
      );

      // Set the identified block IDs in the command
      parsedCommand.target.blockIds = targetBlocks.map(b => b.id);

      // Use the block manipulator for execution
      const result = await blockManipulator.execute(parsedCommand, context.blocks);
      
      // Generate feedback message
      let feedbackMessage: string;
      if (result.success) {
        feedbackMessage = await aiFeedbackService.generateSuccessMessage(parsedCommand, result);
      } else {
        feedbackMessage = await aiFeedbackService.generateErrorMessage(
          parsedCommand, 
          result.error || 'Unknown error'
        );
      }

      return {
        success: result.success,
        blocks: result.blocks,
        changes: result.changes || [],
        error: result.error,
        message: feedbackMessage
      };
    } catch (error) {
      const errorMessage = await aiFeedbackService.generateErrorMessage(
        parsedCommand,
        error instanceof Error ? error.message : 'Command execution failed'
      );
      
      return {
        success: false,
        blocks: context.blocks,
        changes: [],
        error: error instanceof Error ? error.message : 'Command execution failed',
        message: errorMessage
      };
    }
  }

  /**
   * Identify target blocks based on reference
   */
  private identifyTargetBlocks(
    reference: BlockReference,
    context: BlockCommandContext
  ): Block[] {
    const { blocks, selectedBlockId, cursorBlockId } = context;

    if (reference === 'this' || reference === 'selected') {
      const id = selectedBlockId || cursorBlockId;
      return id ? blocks.filter(b => b.id === id) : [];
    }

    if (reference === 'all') {
      return blocks;
    }

    if (reference === 'first') {
      return blocks.length > 0 ? [blocks[0]] : [];
    }

    if (reference === 'last') {
      return blocks.length > 0 ? [blocks[blocks.length - 1]] : [];
    }

    if (reference === 'above' || reference === 'below') {
      const currentId = selectedBlockId || cursorBlockId;
      if (!currentId) return [];
      
      const currentIndex = blocks.findIndex(b => b.id === currentId);
      if (currentIndex === -1) return [];

      if (reference === 'above' && currentIndex > 0) {
        return [blocks[currentIndex - 1]];
      }
      if (reference === 'below' && currentIndex < blocks.length - 1) {
        return [blocks[currentIndex + 1]];
      }
      return [];
    }

    if (typeof reference === 'object') {
      switch (reference.type) {
        case 'position':
          const index = reference.value - 1; // Convert to 0-based
          return blocks[index] ? [blocks[index]] : [];
        
        case 'type':
          return blocks.filter(b => b.type === reference.value);
        
        case 'content':
          const searchTerm = reference.value.toLowerCase();
          return blocks.filter(b => {
            const content = typeof b.content === 'string' 
              ? b.content 
              : JSON.stringify(b.content);
            return content.toLowerCase().includes(searchTerm);
          });
        
        case 'id':
          return blocks.filter(b => b.id === reference.value);
        
        default:
          return [];
      }
    }

    return [];
  }

  /**
   * Execute create action
   */
  private executeCreate(
    command: ParsedBlockCommand,
    context: BlockCommandContext,
    referenceBlock?: Block
  ): BlockCommandResult {
    const newBlock: Block = {
      id: uuidv4(),
      type: (command.parameters.newType as any) || 'paragraph',
      content: command.parameters.content || '',
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };

    let newBlocks = [...context.blocks];
    let insertIndex = newBlocks.length;

    if (referenceBlock) {
      const refIndex = newBlocks.findIndex(b => b.id === referenceBlock.id);
      if (refIndex !== -1) {
        insertIndex = command.parameters.position === 'before' 
          ? refIndex 
          : refIndex + 1;
      }
    }

    newBlocks.splice(insertIndex, 0, newBlock);

    return {
      success: true,
      blocks: newBlocks,
      changes: [{
        type: 'added',
        blockId: newBlock.id,
        description: `Created new ${newBlock.type} block`
      }],
      undoCommand: () => context.blocks
    };
  }

  /**
   * Execute edit action
   */
  private executeEdit(
    command: ParsedBlockCommand,
    context: BlockCommandContext,
    targetBlocks: Block[]
  ): BlockCommandResult {
    const changes: BlockCommandResult['changes'] = [];
    const newBlocks = context.blocks.map(block => {
      const isTarget = targetBlocks.some(t => t.id === block.id);
      if (!isTarget) return block;

      const updatedBlock = {
        ...block,
        content: command.parameters.content !== undefined 
          ? command.parameters.content 
          : block.content,
        metadata: {
          ...block.metadata,
          updatedAt: new Date()
        }
      };

      changes.push({
        type: 'modified',
        blockId: block.id,
        description: `Edited ${block.type} block`
      });

      return updatedBlock;
    });

    return {
      success: true,
      blocks: newBlocks,
      changes,
      undoCommand: () => context.blocks
    };
  }

  /**
   * Execute delete action
   */
  private executeDelete(
    context: BlockCommandContext,
    targetBlocks: Block[]
  ): BlockCommandResult {
    const targetIds = new Set(targetBlocks.map(b => b.id));
    const newBlocks = context.blocks.filter(b => !targetIds.has(b.id));

    const changes: BlockCommandResult['changes'] = targetBlocks.map(block => ({
      type: 'deleted' as const,
      blockId: block.id,
      description: `Deleted ${block.type} block`
    }));

    return {
      success: true,
      blocks: newBlocks,
      changes,
      undoCommand: () => context.blocks
    };
  }

  /**
   * Execute move action
   */
  private executeMove(
    command: ParsedBlockCommand,
    context: BlockCommandContext,
    targetBlocks: Block[]
  ): BlockCommandResult {
    if (targetBlocks.length === 0) {
      return {
        success: false,
        blocks: context.blocks,
        changes: [],
        error: 'No blocks to move'
      };
    }

    const targetIds = new Set(targetBlocks.map(b => b.id));
    const remainingBlocks = context.blocks.filter(b => !targetIds.has(b.id));
    
    // Determine insertion point
    let insertIndex = command.parameters.position === 'before' ? 0 : remainingBlocks.length;
    
    // Insert the moved blocks
    const newBlocks = [
      ...remainingBlocks.slice(0, insertIndex),
      ...targetBlocks,
      ...remainingBlocks.slice(insertIndex)
    ];

    const changes: BlockCommandResult['changes'] = targetBlocks.map(block => ({
      type: 'moved' as const,
      blockId: block.id,
      description: `Moved ${block.type} block`
    }));

    return {
      success: true,
      blocks: newBlocks,
      changes,
      undoCommand: () => context.blocks
    };
  }

  /**
   * Execute transform action
   */
  private async executeTransform(
    command: ParsedBlockCommand,
    context: BlockCommandContext,
    targetBlocks: Block[]
  ): Promise<BlockCommandResult> {
    const transformer = (await import('./block-transformer.server')).BlockTransformer.getInstance();
    const changes: BlockCommandResult['changes'] = [];

    const newBlocks = await Promise.all(
      context.blocks.map(async (block) => {
        const isTarget = targetBlocks.some(t => t.id === block.id);
        if (!isTarget) return block;

        const newType = command.parameters.newType as any;
        if (!newType) return block;

        const transformed = await transformer.transform(block, newType);
        
        changes.push({
          type: 'modified',
          blockId: block.id,
          description: `Transformed ${block.type} to ${newType}`
        });

        return transformed;
      })
    );

    return {
      success: true,
      blocks: newBlocks,
      changes,
      undoCommand: () => context.blocks
    };
  }

  /**
   * Execute duplicate action
   */
  private executeDuplicate(
    command: ParsedBlockCommand,
    context: BlockCommandContext,
    targetBlocks: Block[]
  ): BlockCommandResult {
    const count = command.parameters.count || 1;
    const changes: BlockCommandResult['changes'] = [];
    let newBlocks = [...context.blocks];

    targetBlocks.forEach(targetBlock => {
      const targetIndex = newBlocks.findIndex(b => b.id === targetBlock.id);
      if (targetIndex === -1) return;

      const duplicates: Block[] = [];
      for (let i = 0; i < count; i++) {
        const duplicate: Block = {
          ...targetBlock,
          id: uuidv4(),
          metadata: {
            ...targetBlock.metadata,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        };
        duplicates.push(duplicate);
        
        changes.push({
          type: 'added',
          blockId: duplicate.id,
          description: `Duplicated ${targetBlock.type} block`
        });
      }

      newBlocks.splice(targetIndex + 1, 0, ...duplicates);
    });

    return {
      success: true,
      blocks: newBlocks,
      changes,
      undoCommand: () => context.blocks
    };
  }

  /**
   * Execute merge action
   */
  private executeMerge(
    context: BlockCommandContext,
    targetBlocks: Block[]
  ): BlockCommandResult {
    if (targetBlocks.length < 2) {
      return {
        success: false,
        blocks: context.blocks,
        changes: [],
        error: 'Need at least 2 blocks to merge'
      };
    }

    const targetIds = new Set(targetBlocks.map(b => b.id));
    const firstBlock = targetBlocks[0];
    
    // Merge content
    const mergedContent = targetBlocks
      .map(b => typeof b.content === 'string' ? b.content : JSON.stringify(b.content))
      .join('\n\n');

    const mergedBlock: Block = {
      ...firstBlock,
      content: mergedContent,
      metadata: {
        ...firstBlock.metadata,
        updatedAt: new Date()
      }
    };

    // Replace target blocks with merged block
    const newBlocks = context.blocks.map(block => {
      if (block.id === firstBlock.id) return mergedBlock;
      if (targetIds.has(block.id)) return null;
      return block;
    }).filter(Boolean) as Block[];

    return {
      success: true,
      blocks: newBlocks,
      changes: [{
        type: 'modified',
        blockId: firstBlock.id,
        description: `Merged ${targetBlocks.length} blocks`
      }],
      undoCommand: () => context.blocks
    };
  }

  /**
   * Execute split action
   */
  private executeSplit(
    command: ParsedBlockCommand,
    context: BlockCommandContext,
    targetBlocks: Block[]
  ): BlockCommandResult {
    if (targetBlocks.length === 0) {
      return {
        success: false,
        blocks: context.blocks,
        changes: [],
        error: 'No blocks to split'
      };
    }

    const changes: BlockCommandResult['changes'] = [];
    let newBlocks: Block[] = [];

    context.blocks.forEach(block => {
      const isTarget = targetBlocks.some(t => t.id === block.id);
      if (!isTarget) {
        newBlocks.push(block);
        return;
      }

      // Split logic based on content
      const content = typeof block.content === 'string' ? block.content : '';
      const parts = content.split('\n\n').filter(Boolean);

      if (parts.length <= 1) {
        newBlocks.push(block);
        return;
      }

      parts.forEach((part, index) => {
        const splitBlock: Block = {
          id: index === 0 ? block.id : uuidv4(),
          type: block.type,
          content: part,
          metadata: {
            ...block.metadata,
            updatedAt: new Date()
          }
        };
        newBlocks.push(splitBlock);

        if (index > 0) {
          changes.push({
            type: 'added',
            blockId: splitBlock.id,
            description: `Split from ${block.type} block`
          });
        }
      });

      changes.push({
        type: 'modified',
        blockId: block.id,
        description: `Split ${block.type} block into ${parts.length} parts`
      });
    });

    return {
      success: true,
      blocks: newBlocks,
      changes,
      undoCommand: () => context.blocks
    };
  }

  /**
   * Build system prompt for OpenAI
   */
  private buildSystemPrompt(context: BlockCommandContext): string {
    const blockSummary = context.blocks.map((b, i) => {
      const content = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
      const truncatedContent = content.length > 100 ? content.substring(0, 100) + '...' : content;
      const isSelected = context.selectedBlockId === b.id;
      return `${i + 1}. ${b.type} block${isSelected ? ' (SELECTED)' : ''}: "${truncatedContent}"`;
    }).join('\n');

    // Get full content of selected block if it exists
    let selectedBlockContent = '';
    if (context.selectedBlockId) {
      const selectedBlock = context.blocks.find(b => b.id === context.selectedBlockId);
      if (selectedBlock) {
        selectedBlockContent = typeof selectedBlock.content === 'string' 
          ? selectedBlock.content 
          : JSON.stringify(selectedBlock.content);
      }
    }

    return `You are an AI assistant that parses natural language commands for block manipulation in a document editor.

Current document has ${context.blocks.length} blocks:
${blockSummary}

${selectedBlockContent ? `CRITICAL CONTEXT - This is the FULL CONTENT of the SELECTED BLOCK that the user is referring to when they say "this", "it", or reference the selected block:
================
${selectedBlockContent}
================

WHEN THE USER SAYS "make this into a database/chart/table" or "turn this into X" or uses "this"/"it":
1. You MUST parse and extract the actual data from the selected block content above
2. Use that parsed data to populate the databaseData or chartData fields
3. DO NOT create generic placeholder data - use the ACTUAL content from above
4. The action should be "transform" (not "create") when changing an existing block
5. If creating a new block FROM selected content, still extract the data from the selected block
` : ''}

Available block types: paragraph, heading1, heading2, heading3, bulletList, numberedList, todoList, quote, code, divider, database, ai, image, video, table, chart

Parse the user's command to identify:
1. The action to perform:
   - "create": For adding NEW blocks (charts, tables, paragraphs, etc.)
   - "edit": For modifying content (shorten, expand, rewrite)
   - "transform": For changing an EXISTING block's type (paragraph to list, etc.)
   - "delete", "move", "duplicate", "merge", "split": As named
2. The target block(s) referenced
3. Any parameters needed for the action

IMPORTANT DISTINCTIONS:
- "make a chart", "create a chart", "add a chart" = action: "create", newType: "chart"
- "make a database", "create a table" = action: "create", newType: "database"
- "turn this into a chart", "convert to chart" = action: "transform", newType: "chart"

IMPORTANT: For content modification commands (shorten, expand, rewrite, etc.):
- The action should be "edit"
- You MUST generate the actual modified content based on the original content
- For "shorten": Create a concise version preserving key information
- For "expand": Add relevant details and elaboration
- For "rewrite": Rephrase while maintaining the same meaning
- Put the generated content in the parameters.content field

IMPORTANT: For chart creation commands:
- The action should be "create"
- Set parameters.newType to "chart"
- Parse the data from the command and structure it in parameters.chartData
- Example: "create a bar chart with dogs: 500 and cats: 700" should result in:
  - action: "create"
  - parameters.newType: "chart"
  - parameters.chartData: { labels: ["dogs", "cats"], datasets: [{ data: [500, 700] }] }
  - parameters.chartType: "bar"
  - parameters.title: (extract from command or generate appropriate title)

IMPORTANT: For database/table creation commands:
- The action should be "create"
- Set parameters.newType to "database"
- Parse and structure data from the command OR from selected block content

CRITICAL: When user says "create a database/table from this" or "turn this into a database":
- USE THE SELECTED BLOCK'S FULL CONTENT (provided above) to extract and structure data
- Parse the selected block content to identify columns and rows
- DO NOT create an empty database - extract actual data from the content

Data extraction patterns:
- CSV format: "name,age,city\nJohn,25,NYC\nJane,30,LA" → parse headers and rows
- List with delimiters: "John: 25, NYC" → extract columns from pattern
- Bullet points: Parse each bullet as a row, find common structure
- Numbered lists: Each item becomes a row
- Paragraphs with patterns: Extract structured data from text
- JSON/Object notation: Parse directly into columns and rows

CRITICAL EXAMPLES when user says "make this into a database":
1. If selected block contains: "Apple\nBanana\nOrange"
   → Create database with: 
   columns: [{id: "item", name: "Item", type: "text"}], 
   rows: [{item: "Apple"}, {item: "Banana"}, {item: "Orange"}]
   IMPORTANT: Row properties MUST match column IDs!
   
2. If selected block contains: "dogs: 45, cats: 30, birds: 15"
   → Create database with: 
   columns: [{id: "animal", name: "Animal", type: "text"}, {id: "count", name: "Count", type: "number"}], 
   rows: [{animal: "dogs", count: 45}, {animal: "cats", count: 30}, {animal: "birds", count: 15}]
   NOTE: Use "animal" and "count" as keys in rows because those are the column IDs!

3. If selected block contains CSV: "name,age\nJohn,25\nJane,30"
   → Parse and create: 
   columns: [{id: "name", name: "Name", type: "text"}, {id: "age", name: "Age", type: "number"}],
   rows: [{name: "John", age: 25}, {name: "Jane", age: 30}]

CRITICAL: The row object properties MUST match the column id values, not the column names!
NEVER create empty rows - always populate with actual data from the selected block content!
   - rows: [] // Empty since no data provided

2. "create table: John, 25, NYC | Jane, 30, LA" → Parse data:
   - columns: [{ id: "col1", name: "Name", type: "text" }, { id: "col2", name: "Age", type: "number" }, { id: "col3", name: "City", type: "text" }]
   - rows: [{ id: "row1", col1: "John", col2: 25, col3: "NYC" }, { id: "row2", col1: "Jane", col2: 30, col3: "LA" }]

3. "create a database from this" (with selected block containing "Apple: $2.50\nBanana: $1.20\nOrange: $3.00") → Extract:
   - columns: [{ id: "item", name: "Item", type: "text" }, { id: "price", name: "Price", type: "text" }]
   - rows: [{ id: "row1", item: "Apple", price: "$2.50" }, { id: "row2", item: "Banana", price: "$1.20" }, { id: "row3", item: "Orange", price: "$3.00" }]

ALWAYS populate parameters.databaseData with actual extracted data when content is available!

References can be:
- Positional: "first", "last", "second", "third"
- Relative: "this", "above", "below", "selected"
- Content-based: "the paragraph about X", "blocks containing Y"
- Type-based: "all tables", "the chart", "headings"`;
  }

  /**
   * Get OpenAI function definitions
   */
  private getCommandFunctions() {
    return [{
      name: 'parse_block_command',
      description: 'Parse a natural language block manipulation command',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'edit', 'delete', 'move', 'transform', 'duplicate', 'merge', 'split', 'style'],
            description: 'The action to perform'
          },
          target: {
            type: 'object',
            properties: {
              reference: {
                type: 'string',
                description: 'How the target block(s) are referenced. For create actions, use "selected" if adding to selected block, "last" to add at end, or "after" to add after current block.',
                default: 'selected'
              }
            },
            required: ['reference']
          },
          parameters: {
            type: 'object',
            properties: {
              newType: {
                type: 'string',
                description: 'For create/transform: the block type'
              },
              content: {
                type: 'string',
                description: 'For create/edit: the actual content to set. For commands like shorten/expand/rewrite, this should be the transformed version of the original content, not a placeholder.'
              },
              chartData: {
                type: 'object',
                description: 'For chart creation: MUST parse and extract data from the SELECTED BLOCK CONTENT when user says "this" or "it". Extract labels and values from the actual content.',
                properties: {
                  labels: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'Labels extracted from the selected block (e.g., if content has "dogs: 45", extract "dogs")'
                  },
                  datasets: { 
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        data: { 
                          type: 'array',
                          items: { type: 'number' }
                        }
                      }
                    },
                    description: 'Dataset with actual values parsed from the selected block content'
                  }
                }
              },
              chartType: {
                type: 'string',
                enum: ['bar', 'line', 'pie', 'doughnut', 'scatter'],
                description: 'Type of chart to create'
              },
              title: {
                type: 'string',
                description: 'Title for the chart or table'
              },
              databaseData: {
                type: 'object',
                description: 'For database/table creation: MUST parse and extract data from the SELECTED BLOCK CONTENT when user says "this" or "it". DO NOT create generic placeholder data.',
                properties: {
                  columns: {
                    type: 'array',
                    items: { 
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        type: { type: 'string', enum: ['text', 'number', 'date', 'boolean', 'select'] }
                      }
                    },
                    description: 'Column definitions extracted from the selected block content'
                  },
                  rows: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Array of row objects with actual data parsed from the selected block content'
                  }
                }
              },
              position: {
                type: 'string',
                enum: ['before', 'after', 'inside', 'replace'],
                description: 'Where to place the block'
              },
              count: {
                type: 'number',
                description: 'For duplicate: number of copies'
              }
            }
          }
        },
        required: ['action', 'target']
      }
    }];
  }

  /**
   * Calculate confidence score for parsed command
   */
  private calculateConfidence(
    parsed: any,
    originalCommand: string,
    context: BlockCommandContext
  ): number {
    let confidence = 0.5; // Base confidence

    // Check if action is clear
    if (parsed.action) confidence += 0.2;

    // Check if target is specific
    if (parsed.target?.reference && parsed.target.reference !== 'all') {
      confidence += 0.15;
    }

    // Check if we have required parameters
    if (parsed.action === 'create' && parsed.parameters?.newType) {
      confidence += 0.1;
    }

    // Check command clarity (shorter, specific commands are better)
    if (originalCommand.length < 50) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }
}

export const blockCommandService = BlockCommandService.getInstance();