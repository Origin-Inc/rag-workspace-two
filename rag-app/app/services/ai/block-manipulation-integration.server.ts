/**
 * Block Manipulation Integration Service
 * Connects AI block manipulation with existing editor services
 */

import { blockCommandService } from './block-commands.server';
import { blockManipulator } from './block-manipulator.server';
import { aiFeedbackService } from './ai-feedback.server';
import { chartGenerator } from './chart-generator.server';
import type { Block } from '~/components/editor/EnhancedBlockEditor';
import type { ParsedBlockCommand, BlockCommandContext } from './block-commands.server';
import { prisma } from '~/utils/db.server';
import { ragIndexingService } from '../rag/rag-indexing.service';

export interface IntegrationOptions {
  autoSave?: boolean;
  showPreview?: boolean;
  confirmThreshold?: number; // Confidence threshold below which to request confirmation
  enableUndo?: boolean;
  maxUndoHistory?: number;
}

export class BlockManipulationIntegration {
  private static instance: BlockManipulationIntegration;
  private commandHistory: ParsedBlockCommand[] = [];
  private readonly defaultOptions: IntegrationOptions = {
    autoSave: true,
    showPreview: true,
    confirmThreshold: 0.7,
    enableUndo: true,
    maxUndoHistory: 50
  };

  private constructor() {}

  static getInstance(): BlockManipulationIntegration {
    if (!BlockManipulationIntegration.instance) {
      BlockManipulationIntegration.instance = new BlockManipulationIntegration();
    }
    return BlockManipulationIntegration.instance;
  }

  /**
   * Process a natural language command with full integration
   */
  async processNaturalLanguageCommand(
    input: string,
    context: {
      blocks: Block[];
      selectedBlockId?: string;
      pageId: string;
      userId: string;
      workspaceId?: string;
    },
    options: IntegrationOptions = {}
  ): Promise<{
    success: boolean;
    blocks?: Block[];
    message?: string;
    requiresConfirmation?: boolean;
    preview?: any;
  }> {
    const opts = { ...this.defaultOptions, ...options };

    try {
      // Parse the command
      const parsedCommand = await blockCommandService.parseCommand(input, {
        blocks: context.blocks,
        selectedBlockId: context.selectedBlockId,
        cursorBlockId: context.selectedBlockId,
        pageId: context.pageId,
        userId: context.userId
      });

      // Check confidence threshold
      if (parsedCommand.confidence < opts.confirmThreshold!) {
        const clarification = await aiFeedbackService.requestClarification(
          parsedCommand,
          context.blocks
        );

        return {
          success: false,
          requiresConfirmation: true,
          message: clarification.message,
          preview: {
            command: parsedCommand,
            suggestions: clarification.suggestions
          }
        };
      }

      // Generate preview if requested
      if (opts.showPreview) {
        const previewResult = await this.generatePreview(parsedCommand, context.blocks);
        
        // Return preview for user confirmation
        return {
          success: false,
          requiresConfirmation: true,
          message: await aiFeedbackService.explainPreview(parsedCommand, previewResult.changes),
          preview: previewResult
        };
      }

      // Execute the command
      const result = await blockCommandService.executeCommand(parsedCommand, {
        blocks: context.blocks,
        selectedBlockId: context.selectedBlockId,
        cursorBlockId: context.selectedBlockId,
        pageId: context.pageId,
        userId: context.userId
      });

      if (!result.success) {
        return {
          success: false,
          message: result.message || result.error
        };
      }

      // Save to database if auto-save is enabled
      if (opts.autoSave && context.pageId) {
        await this.saveToDatabase(context.pageId, result.blocks, context.userId);
      }

      // Add to command history
      if (opts.enableUndo) {
        this.addToHistory(parsedCommand);
      }

      return {
        success: true,
        blocks: result.blocks,
        message: result.message
      };

    } catch (error) {
      console.error('Error processing natural language command:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to process command'
      };
    }
  }

  /**
   * Execute a confirmed command (after preview)
   */
  async executeConfirmedCommand(
    command: ParsedBlockCommand,
    context: {
      blocks: Block[];
      pageId: string;
      userId: string;
    },
    options: IntegrationOptions = {}
  ): Promise<{
    success: boolean;
    blocks?: Block[];
    message?: string;
  }> {
    const opts = { ...this.defaultOptions, ...options };

    try {
      const result = await blockManipulator.execute(command, context.blocks);

      if (!result.success) {
        return {
          success: false,
          message: await aiFeedbackService.generateErrorMessage(
            command,
            result.error || 'Execution failed'
          )
        };
      }

      // Save to database
      if (opts.autoSave) {
        await this.saveToDatabase(context.pageId, result.blocks, context.userId);
      }

      // Add to history
      if (opts.enableUndo) {
        this.addToHistory(command);
      }

      return {
        success: true,
        blocks: result.blocks,
        message: await aiFeedbackService.generateSuccessMessage(command, result)
      };

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to execute command'
      };
    }
  }

  /**
   * Generate preview of changes without executing
   */
  async generatePreview(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<{
    changes: any[];
    affectedBlocks: string[];
    newBlocks?: Block[];
  }> {
    // Simulate execution to get preview
    const tempResult = await blockManipulator.execute(command, blocks);
    
    return {
      changes: tempResult.changes,
      affectedBlocks: tempResult.affectedBlocks || [],
      newBlocks: tempResult.success ? tempResult.blocks : undefined
    };
  }

  /**
   * Process chart creation from data
   */
  async createChartFromData(
    sourceBlock: Block,
    chartType?: string,
    context?: {
      pageId: string;
      userId: string;
    }
  ): Promise<{
    success: boolean;
    chartBlock?: Block;
    message?: string;
  }> {
    try {
      const extractedData = await chartGenerator.extractDataFromBlock(sourceBlock);
      
      if (!extractedData) {
        return {
          success: false,
          message: 'Could not extract data from the selected block'
        };
      }

      const config = chartGenerator.generateChartConfig(
        extractedData,
        chartType as any
      );
      
      const chartBlock = chartGenerator.createChartBlock(config);

      if (context) {
        // Add chart block after source block
        const command: ParsedBlockCommand = {
          action: 'create',
          confidence: 1,
          target: {
            reference: { type: 'id', value: sourceBlock.id },
            blockIds: [sourceBlock.id]
          },
          parameters: {
            newType: 'chart',
            content: chartBlock.content,
            position: 'after'
          },
          naturalLanguage: `Create ${chartType || extractedData.suggestedChartType} chart from data`
        };

        const result = await this.executeConfirmedCommand(command, {
          blocks: await this.getPageBlocks(context.pageId),
          pageId: context.pageId,
          userId: context.userId
        });

        return {
          success: result.success,
          chartBlock,
          message: result.message
        };
      }

      return {
        success: true,
        chartBlock,
        message: `Created ${config.type} chart from data`
      };

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create chart'
      };
    }
  }

  /**
   * Get contextual help for a block type
   */
  async getBlockContextualHelp(blockType: string): Promise<string[]> {
    return aiFeedbackService.getContextualHelp(blockType);
  }

  /**
   * Undo last command
   */
  async undoLastCommand(
    pageId: string,
    userId: string
  ): Promise<{
    success: boolean;
    blocks?: Block[];
    message?: string;
  }> {
    const blocks = await blockManipulator.undo();
    
    if (!blocks) {
      return {
        success: false,
        message: 'Nothing to undo'
      };
    }

    await this.saveToDatabase(pageId, blocks, userId);
    
    return {
      success: true,
      blocks,
      message: 'Undid last action'
    };
  }

  /**
   * Get command history
   */
  getCommandHistory(): ParsedBlockCommand[] {
    return this.commandHistory;
  }

  /**
   * Clear command history
   */
  clearHistory(): void {
    this.commandHistory = [];
    blockManipulator.clearHistory();
  }

  /**
   * Save blocks to database
   */
  private async saveToDatabase(
    pageId: string,
    blocks: Block[],
    userId: string
  ): Promise<void> {
    try {
      // Serialize blocks for database storage
      const serializedBlocks = blocks.map((block, index) => ({
        id: block.id || `block-${index}`,
        type: block.type || 'paragraph',
        content: typeof block.content === 'string' 
          ? block.content 
          : JSON.stringify(block.content)
      }));

      // Update page in database
      await prisma.page.update({
        where: { id: pageId },
        data: {
          blocks: serializedBlocks as any,
          updatedAt: new Date(),
          lastEditedBy: userId
        }
      });

      // Queue for RAG indexing
      ragIndexingService.queueForIndexing(pageId).catch(error => {
        console.error('[Integration] Failed to queue for indexing:', error);
      });

    } catch (error) {
      console.error('[Integration] Failed to save to database:', error);
      throw error;
    }
  }

  /**
   * Get page blocks from database
   */
  private async getPageBlocks(pageId: string): Promise<Block[]> {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { blocks: true }
    });

    if (!page || !page.blocks) {
      return [];
    }

    // Deserialize blocks
    const blocks = page.blocks as any[];
    return blocks.map(block => ({
      id: block.id,
      type: block.type,
      content: typeof block.content === 'string' 
        ? block.content 
        : block.content
    }));
  }

  /**
   * Add command to history
   */
  private addToHistory(command: ParsedBlockCommand): void {
    this.commandHistory.push(command);
    
    // Limit history size
    const maxSize = this.defaultOptions.maxUndoHistory!;
    if (this.commandHistory.length > maxSize) {
      this.commandHistory = this.commandHistory.slice(-maxSize);
    }
  }
}

export const blockManipulationIntegration = BlockManipulationIntegration.getInstance();