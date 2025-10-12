/**
 * HyperFormula Web Worker
 *
 * Handles formula calculations in a separate thread to avoid blocking the UI.
 * Provides Excel-compatible formula engine with 386+ functions.
 */

import { HyperFormula, DetailedCellError, SimpleCellAddress } from 'hyperformula';

// Message types for communication with main thread
export type HyperFormulaWorkerMessage =
  | { type: 'initialize'; config?: any }
  | { type: 'setCellContents'; id: string; sheetId: number; row: number; col: number; content: any }
  | { type: 'setCellFormula'; id: string; sheetId: number; row: number; col: number; formula: string }
  | { type: 'getCellValue'; id: string; sheetId: number; row: number; col: number }
  | { type: 'getCellFormula'; id: string; sheetId: number; row: number; col: number }
  | { type: 'getSheetValues'; id: string; sheetId: number; startRow: number; endRow: number; startCol: number; endCol: number }
  | { type: 'addSheet'; id: string; sheetName?: string }
  | { type: 'removeSheet'; id: string; sheetId: number }
  | { type: 'setSheetContent'; id: string; sheetId: number; data: any[][] }
  | { type: 'addRows'; id: string; sheetId: number; index: number; count: number }
  | { type: 'removeRows'; id: string; sheetId: number; index: number; count: number }
  | { type: 'addColumns'; id: string; sheetId: number; index: number; count: number }
  | { type: 'removeColumns'; id: string; sheetId: number; index: number; count: number }
  | { type: 'batch'; id: string; operations: Array<Omit<HyperFormulaWorkerMessage, 'id'>> };

export type HyperFormulaWorkerResponse =
  | { type: 'initialized'; success: boolean; error?: string }
  | { type: 'cellValue'; id: string; value: any; error?: DetailedCellError | string }
  | { type: 'cellFormula'; id: string; formula: string | null; error?: string }
  | { type: 'sheetValues'; id: string; values: any[][]; error?: string }
  | { type: 'sheetAdded'; id: string; sheetId: number; error?: string }
  | { type: 'operationComplete'; id: string; success: boolean; error?: string }
  | { type: 'batchComplete'; id: string; results: any[]; error?: string };

// Worker state
let hf: HyperFormula | null = null;

/**
 * Initialize HyperFormula engine
 */
function initialize(config?: any): void {
  try {
    const defaultConfig = {
      licenseKey: 'gpl-v3',
      // Performance optimizations
      useArrayArithmetic: true,
      useColumnIndex: true,
      // Function plugins
      functionPlugins: [],
      // Locale
      localeLang: 'en-US',
    };

    hf = HyperFormula.buildEmpty({
      ...defaultConfig,
      ...config,
    });

    // Add default sheet
    hf.addSheet('Sheet1');

    postMessage({
      type: 'initialized',
      success: true,
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    console.error('HyperFormula initialization failed:', error);
    postMessage({
      type: 'initialized',
      success: false,
      error: error instanceof Error ? error.message : 'Initialization failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Set cell contents (value or formula)
 */
function setCellContents(
  id: string,
  sheetId: number,
  row: number,
  col: number,
  content: any
): void {
  if (!hf) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    hf.setCellContents({ sheet: sheetId, col, row }, [[content]]);

    postMessage({
      type: 'operationComplete',
      id,
      success: true,
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Set cell contents failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Set cell formula (convenience method)
 */
function setCellFormula(
  id: string,
  sheetId: number,
  row: number,
  col: number,
  formula: string
): void {
  // Ensure formula starts with =
  const formulaContent = formula.startsWith('=') ? formula : `=${formula}`;
  setCellContents(id, sheetId, row, col, formulaContent);
}

/**
 * Get cell value (calculated result)
 */
function getCellValue(id: string, sheetId: number, row: number, col: number): void {
  if (!hf) {
    postMessage({
      type: 'cellValue',
      id,
      value: null,
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    const value = hf.getCellValue({ sheet: sheetId, col, row });

    // Check if value is an error
    if (value instanceof DetailedCellError) {
      postMessage({
        type: 'cellValue',
        id,
        value: null,
        error: value,
      } as HyperFormulaWorkerResponse);
    } else {
      postMessage({
        type: 'cellValue',
        id,
        value,
      } as HyperFormulaWorkerResponse);
    }
  } catch (error) {
    postMessage({
      type: 'cellValue',
      id,
      value: null,
      error: error instanceof Error ? error.message : 'Get cell value failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Get cell formula (if cell contains a formula)
 */
function getCellFormula(id: string, sheetId: number, row: number, col: number): void {
  if (!hf) {
    postMessage({
      type: 'cellFormula',
      id,
      formula: null,
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    const formula = hf.getCellFormula({ sheet: sheetId, col, row });

    postMessage({
      type: 'cellFormula',
      id,
      formula: formula || null,
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'cellFormula',
      id,
      formula: null,
      error: error instanceof Error ? error.message : 'Get cell formula failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Get values for a range of cells (for virtual scrolling)
 */
function getSheetValues(
  id: string,
  sheetId: number,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
): void {
  if (!hf) {
    postMessage({
      type: 'sheetValues',
      id,
      values: [],
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    const values: any[][] = [];

    for (let row = startRow; row <= endRow; row++) {
      const rowValues: any[] = [];
      for (let col = startCol; col <= endCol; col++) {
        const value = hf.getCellValue({ sheet: sheetId, col, row });
        rowValues.push(value instanceof DetailedCellError ? null : value);
      }
      values.push(rowValues);
    }

    postMessage({
      type: 'sheetValues',
      id,
      values,
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'sheetValues',
      id,
      values: [],
      error: error instanceof Error ? error.message : 'Get sheet values failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Add a new sheet
 */
function addSheet(id: string, sheetName?: string): void {
  if (!hf) {
    postMessage({
      type: 'sheetAdded',
      id,
      sheetId: -1,
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    const name = sheetName || `Sheet${hf.getSheetNames().length + 1}`;
    const sheetId = hf.addSheet(name);

    postMessage({
      type: 'sheetAdded',
      id,
      sheetId,
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'sheetAdded',
      id,
      sheetId: -1,
      error: error instanceof Error ? error.message : 'Add sheet failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Remove a sheet
 */
function removeSheet(id: string, sheetId: number): void {
  if (!hf) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    hf.removeSheet(sheetId);

    postMessage({
      type: 'operationComplete',
      id,
      success: true,
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Remove sheet failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Set entire sheet content (bulk operation)
 */
function setSheetContent(id: string, sheetId: number, data: any[][]): void {
  if (!hf) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    hf.setSheetContent(sheetId, data);

    postMessage({
      type: 'operationComplete',
      id,
      success: true,
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Set sheet content failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Add rows to sheet
 */
function addRows(id: string, sheetId: number, index: number, count: number): void {
  if (!hf) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    hf.addRows(sheetId, [index, count]);

    postMessage({
      type: 'operationComplete',
      id,
      success: true,
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Add rows failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Remove rows from sheet
 */
function removeRows(id: string, sheetId: number, index: number, count: number): void {
  if (!hf) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    hf.removeRows(sheetId, [index, count]);

    postMessage({
      type: 'operationComplete',
      id,
      success: true,
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Remove rows failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Add columns to sheet
 */
function addColumns(id: string, sheetId: number, index: number, count: number): void {
  if (!hf) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    hf.addColumns(sheetId, [index, count]);

    postMessage({
      type: 'operationComplete',
      id,
      success: true,
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Add columns failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Remove columns from sheet
 */
function removeColumns(id: string, sheetId: number, index: number, count: number): void {
  if (!hf) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    hf.removeColumns(sheetId, [index, count]);

    postMessage({
      type: 'operationComplete',
      id,
      success: true,
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Remove columns failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Batch operations (for better performance)
 */
async function batch(id: string, operations: Array<Omit<HyperFormulaWorkerMessage, 'id'>>): Promise<void> {
  if (!hf) {
    postMessage({
      type: 'batchComplete',
      id,
      results: [],
      error: 'Engine not initialized',
    } as HyperFormulaWorkerResponse);
    return;
  }

  try {
    hf.batch(() => {
      // Execute all operations within a batch for optimal performance
      operations.forEach((op) => {
        switch (op.type) {
          case 'setCellContents':
            setCellContents(id, op.sheetId, op.row, op.col, op.content);
            break;
          case 'setCellFormula':
            setCellFormula(id, op.sheetId, op.row, op.col, op.formula);
            break;
          // Add more operation types as needed
        }
      });
    });

    postMessage({
      type: 'batchComplete',
      id,
      results: [],
    } as HyperFormulaWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'batchComplete',
      id,
      results: [],
      error: error instanceof Error ? error.message : 'Batch operation failed',
    } as HyperFormulaWorkerResponse);
  }
}

/**
 * Message handler
 */
self.onmessage = async (event: MessageEvent<HyperFormulaWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'initialize':
      initialize(message.config);
      break;

    case 'setCellContents':
      setCellContents(message.id, message.sheetId, message.row, message.col, message.content);
      break;

    case 'setCellFormula':
      setCellFormula(message.id, message.sheetId, message.row, message.col, message.formula);
      break;

    case 'getCellValue':
      getCellValue(message.id, message.sheetId, message.row, message.col);
      break;

    case 'getCellFormula':
      getCellFormula(message.id, message.sheetId, message.row, message.col);
      break;

    case 'getSheetValues':
      getSheetValues(message.id, message.sheetId, message.startRow, message.endRow, message.startCol, message.endCol);
      break;

    case 'addSheet':
      addSheet(message.id, message.sheetName);
      break;

    case 'removeSheet':
      removeSheet(message.id, message.sheetId);
      break;

    case 'setSheetContent':
      setSheetContent(message.id, message.sheetId, message.data);
      break;

    case 'addRows':
      addRows(message.id, message.sheetId, message.index, message.count);
      break;

    case 'removeRows':
      removeRows(message.id, message.sheetId, message.index, message.count);
      break;

    case 'addColumns':
      addColumns(message.id, message.sheetId, message.index, message.count);
      break;

    case 'removeColumns':
      removeColumns(message.id, message.sheetId, message.index, message.count);
      break;

    case 'batch':
      await batch(message.id, message.operations);
      break;

    default:
      console.warn('Unknown message type:', (message as any).type);
  }
};

// Export types for use in main thread
export type { HyperFormulaWorkerMessage, HyperFormulaWorkerResponse };
