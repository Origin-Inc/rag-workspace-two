/**
 * File-to-SpreadsheetBlock Converter Service
 *
 * Transforms parsed file data into SpreadsheetBlock format.
 * Handles column mapping, position calculation, and block creation.
 */

import type { ParsedFileData, ColumnType } from '../file-parser.server';
import type { SpreadsheetBlockContent } from '~/types/blocks';
import type { CreateBlockInput } from '../block.server';
import type { Block, BlockType } from '~/types/supabase';
import { BlockService } from '../block.server';

export interface FileToSpreadsheetBlockOptions {
  pageId: string;
  userId: string;
  filename?: string;
  existingBlocks?: Block[];
}

export class FileToSpreadsheetBlockConverter {
  private blockService: BlockService;

  constructor() {
    this.blockService = new BlockService();
  }

  /**
   * Convert parsed file data to a SpreadsheetBlock
   */
  async convertToSpreadsheetBlock(
    parsedData: ParsedFileData,
    options: FileToSpreadsheetBlockOptions
  ): Promise<Block> {
    const { pageId, userId, filename, existingBlocks = [] } = options;

    // Transform parsed columns to SpreadsheetBlockContent format
    const columns = parsedData.columns.map((col) => ({
      id: col.id,
      name: col.name,
      type: this.mapDataTypeToColumnType(col.type),
      width: col.width || 150,
    }));

    // Format rows (already in correct format from parser)
    const rows = parsedData.rows;

    // Create spreadsheet content
    const content: SpreadsheetBlockContent = {
      tableName: this.generateTableName(filename || parsedData.filename),
      title: filename || parsedData.filename,
      columns,
      rows,
    };

    // Calculate next position
    const position = this.calculateNextPosition(existingBlocks);

    // Create block input
    const blockInput: CreateBlockInput = {
      pageId,
      type: 'spreadsheet',
      content,
      position,
      parentId: null,
      metadata: {
        source: 'file-upload',
        originalFilename: parsedData.filename,
        rowCount: parsedData.rowCount,
        columnCount: parsedData.columnCount,
        uploadedAt: new Date().toISOString(),
      },
      properties: {},
      createdBy: userId,
    };

    // Create the block
    return await this.blockService.createBlock(blockInput);
  }

  /**
   * Create multiple SpreadsheetBlocks from parsed files
   */
  async convertMultipleToSpreadsheetBlocks(
    parsedFiles: ParsedFileData[],
    options: FileToSpreadsheetBlockOptions
  ): Promise<Block[]> {
    const { pageId, userId, existingBlocks = [] } = options;

    const blocks: Block[] = [];
    let currentBlocks = [...existingBlocks];

    for (const parsedData of parsedFiles) {
      const block = await this.convertToSpreadsheetBlock(parsedData, {
        ...options,
        existingBlocks: currentBlocks,
      });

      blocks.push(block);
      currentBlocks.push(block);
    }

    return blocks;
  }

  /**
   * Map file parser data types to SpreadsheetBlock column types
   */
  private mapDataTypeToColumnType(dataType: ColumnType): 'text' | 'number' | 'boolean' | 'date' {
    // Direct mapping - types already match
    const typeMap: Record<ColumnType, 'text' | 'number' | 'boolean' | 'date'> = {
      text: 'text',
      number: 'number',
      boolean: 'boolean',
      date: 'date',
    };

    return typeMap[dataType] || 'text';
  }

  /**
   * Calculate the next block position based on existing blocks
   * Stacks new block below the last block
   */
  calculateNextPosition(existingBlocks: Block[]): { x: number; y: number; width: number; height: number } {
    if (!existingBlocks || existingBlocks.length === 0) {
      // First block on page
      return {
        x: 0,
        y: 0,
        width: 12, // Full width for spreadsheet
        height: 4, // Default spreadsheet height
      };
    }

    // Find the block with the highest y position
    const lastBlock = existingBlocks.reduce((prev, current) => {
      const prevY = (prev.position as any)?.y || 0;
      const prevHeight = (prev.position as any)?.height || 1;
      const currentY = (current.position as any)?.y || 0;
      const currentHeight = (current.position as any)?.height || 1;

      return prevY + prevHeight > currentY + currentHeight ? prev : current;
    });

    const lastY = (lastBlock.position as any)?.y || 0;
    const lastHeight = (lastBlock.position as any)?.height || 1;

    // Position new block below last block
    return {
      x: 0,
      y: lastY + lastHeight,
      width: 12, // Full width for spreadsheet
      height: 4, // Default spreadsheet height
    };
  }

  /**
   * Generate a valid table name from filename
   * Removes special characters and ensures uniqueness
   */
  private generateTableName(filename: string): string {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.(csv|xlsx|xls)$/i, '');

    // Replace spaces and special chars with underscores
    const sanitized = nameWithoutExt
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores

    // Add timestamp for uniqueness
    const timestamp = Date.now().toString(36);

    return `spreadsheet_${sanitized}_${timestamp}`;
  }

  /**
   * Create a skeleton/placeholder SpreadsheetBlock for optimistic UI
   * Returns block content that can be used while file is being processed
   */
  createSkeletonBlock(filename: string): SpreadsheetBlockContent {
    return {
      tableName: this.generateTableName(filename),
      title: filename,
      columns: [
        { id: 'col_1', name: 'Loading...', type: 'text', width: 150 },
      ],
      rows: [],
    };
  }

  /**
   * Validate that parsed data can be converted to a spreadsheet block
   */
  validateParsedData(parsedData: ParsedFileData): { valid: boolean; error?: string } {
    if (!parsedData.columns || parsedData.columns.length === 0) {
      return {
        valid: false,
        error: 'File must contain at least one column',
      };
    }

    if (parsedData.columns.length > 100) {
      return {
        valid: false,
        error: 'File contains too many columns (max 100)',
      };
    }

    if (parsedData.rows.length > 10000) {
      return {
        valid: false,
        error: 'File contains too many rows (max 10,000). Consider splitting the file.',
      };
    }

    return { valid: true };
  }
}

// Export singleton instance
export const fileToSpreadsheetBlockConverter = new FileToSpreadsheetBlockConverter();
