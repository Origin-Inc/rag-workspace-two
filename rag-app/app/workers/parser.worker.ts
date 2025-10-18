/**
 * Parser Web Worker
 *
 * Handles CSV and Excel file parsing in a separate thread to avoid blocking the UI.
 * Supports streaming parsing for large files with progress updates.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// Message types for communication with main thread
export type ParserWorkerMessage =
  | { type: 'parseCSV'; id: string; file: File | string; config?: Papa.ParseConfig }
  | { type: 'parseExcel'; id: string; file: ArrayBuffer; sheetName?: string }
  | { type: 'parseCSVChunk'; id: string; chunk: string; isLast: boolean }
  | { type: 'getSheetNames'; id: string; file: ArrayBuffer }
  | { type: 'cancel'; id: string };

export type ParserWorkerResponse =
  | { type: 'parseComplete'; id: string; data: any[]; meta?: any; error?: string }
  | { type: 'parseProgress'; id: string; progress: number; rowsParsed: number }
  | { type: 'sheetNames'; id: string; names: string[]; error?: string }
  | { type: 'parseCancelled'; id: string };

// Worker state
const activeParses = new Map<string, { cancelled: boolean }>();

/**
 * Parse CSV file
 */
function parseCSV(id: string, file: File | string, config?: Papa.ParseConfig): void {
  // Track this parse operation
  activeParses.set(id, { cancelled: false });

  const defaultConfig: Papa.ParseConfig = {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    ...config,
  };

  // For large files, use streaming
  const isLargeFile = typeof file !== 'string' && file.size > 5 * 1024 * 1024; // 5MB

  if (isLargeFile && typeof file !== 'string') {
    let rowsParsed = 0;
    const allRows: any[] = [];

    Papa.parse(file, {
      ...defaultConfig,
      chunk: (results, parser) => {
        // Check if cancelled
        const state = activeParses.get(id);
        if (state?.cancelled) {
          parser.abort();
          postMessage({
            type: 'parseCancelled',
            id,
          } as ParserWorkerResponse);
          return;
        }

        // Accumulate rows
        allRows.push(...results.data);
        rowsParsed += results.data.length;

        // Send progress update
        postMessage({
          type: 'parseProgress',
          id,
          progress: (file.size > 0 ? (parser.streamer._input.end / file.size) * 100 : 0),
          rowsParsed,
        } as ParserWorkerResponse);
      },
      complete: (results) => {
        activeParses.delete(id);

        postMessage({
          type: 'parseComplete',
          id,
          data: allRows,
          meta: results.meta,
        } as ParserWorkerResponse);
      },
      error: (error) => {
        activeParses.delete(id);

        postMessage({
          type: 'parseComplete',
          id,
          data: [],
          error: error.message,
        } as ParserWorkerResponse);
      },
    });
  } else {
    // For small files or strings, parse directly
    Papa.parse(file as any, {
      ...defaultConfig,
      complete: (results) => {
        activeParses.delete(id);

        if (results.errors.length > 0) {
          postMessage({
            type: 'parseComplete',
            id,
            data: results.data,
            meta: results.meta,
            error: results.errors[0].message,
          } as ParserWorkerResponse);
        } else {
          postMessage({
            type: 'parseComplete',
            id,
            data: results.data,
            meta: results.meta,
          } as ParserWorkerResponse);
        }
      },
      error: (error) => {
        activeParses.delete(id);

        postMessage({
          type: 'parseComplete',
          id,
          data: [],
          error: error.message,
        } as ParserWorkerResponse);
      },
    });
  }
}

/**
 * Parse Excel file
 */
function parseExcel(id: string, fileBuffer: ArrayBuffer, sheetName?: string): void {
  try {
    // Track this parse operation
    activeParses.set(id, { cancelled: false });

    // Read workbook
    const workbook = XLSX.read(fileBuffer, { type: 'array' });

    // Get sheet
    const sheet = sheetName
      ? workbook.Sheets[sheetName]
      : workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) {
      throw new Error(`Sheet "${sheetName || workbook.SheetNames[0]}" not found`);
    }

    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: null,
    });

    // Check if cancelled
    const state = activeParses.get(id);
    if (state?.cancelled) {
      postMessage({
        type: 'parseCancelled',
        id,
      } as ParserWorkerResponse);
      return;
    }

    // Process data to convert to array of objects
    if (data.length > 0) {
      const headers = data[0] as string[];
      const rows = data.slice(1).map((row: any) => {
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] ?? null;
        });
        return obj;
      });

      activeParses.delete(id);

      postMessage({
        type: 'parseComplete',
        id,
        data: rows,
        meta: {
          sheetName: sheetName || workbook.SheetNames[0],
          sheetNames: workbook.SheetNames,
          fields: headers,
        },
      } as ParserWorkerResponse);
    } else {
      activeParses.delete(id);

      postMessage({
        type: 'parseComplete',
        id,
        data: [],
        meta: {
          sheetName: sheetName || workbook.SheetNames[0],
          sheetNames: workbook.SheetNames,
        },
      } as ParserWorkerResponse);
    }
  } catch (error) {
    activeParses.delete(id);

    postMessage({
      type: 'parseComplete',
      id,
      data: [],
      error: error instanceof Error ? error.message : 'Excel parsing failed',
    } as ParserWorkerResponse);
  }
}

/**
 * Parse CSV chunk (for streaming from server)
 */
function parseCSVChunk(id: string, chunk: string, isLast: boolean): void {
  // Track this parse operation if first chunk
  if (!activeParses.has(id)) {
    activeParses.set(id, { cancelled: false });
  }

  // Check if cancelled
  const state = activeParses.get(id);
  if (state?.cancelled) {
    postMessage({
      type: 'parseCancelled',
      id,
    } as ParserWorkerResponse);
    return;
  }

  Papa.parse(chunk, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: (results) => {
      if (isLast) {
        activeParses.delete(id);
      }

      postMessage({
        type: 'parseComplete',
        id,
        data: results.data,
        meta: {
          ...results.meta,
          isChunk: !isLast,
        },
      } as ParserWorkerResponse);
    },
    error: (error) => {
      activeParses.delete(id);

      postMessage({
        type: 'parseComplete',
        id,
        data: [],
        error: error.message,
      } as ParserWorkerResponse);
    },
  });
}

/**
 * Get sheet names from Excel file
 */
function getSheetNames(id: string, fileBuffer: ArrayBuffer): void {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'array', bookSheets: true });

    postMessage({
      type: 'sheetNames',
      id,
      names: workbook.SheetNames,
    } as ParserWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'sheetNames',
      id,
      names: [],
      error: error instanceof Error ? error.message : 'Failed to read sheet names',
    } as ParserWorkerResponse);
  }
}

/**
 * Cancel an ongoing parse operation
 */
function cancel(id: string): void {
  const state = activeParses.get(id);
  if (state) {
    state.cancelled = true;
  }
}

/**
 * Message handler
 */
self.onmessage = async (event: MessageEvent<ParserWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'parseCSV':
      parseCSV(message.id, message.file, message.config);
      break;

    case 'parseExcel':
      parseExcel(message.id, message.file, message.sheetName);
      break;

    case 'parseCSVChunk':
      parseCSVChunk(message.id, message.chunk, message.isLast);
      break;

    case 'getSheetNames':
      getSheetNames(message.id, message.file);
      break;

    case 'cancel':
      cancel(message.id);
      break;

    default:
      console.warn('Unknown message type:', (message as any).type);
  }
};

// Export types for use in main thread
export type { ParserWorkerMessage, ParserWorkerResponse };
