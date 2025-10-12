/**
 * DuckDB Web Worker
 *
 * Handles database queries in a separate thread to avoid blocking the UI.
 * Provides message-based API for query execution, pagination, and table operations.
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdb_wasm_next from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';

// Message types for communication with main thread
export type DuckDBWorkerMessage =
  | { type: 'initialize' }
  | { type: 'query'; id: string; sql: string }
  | { type: 'queryPaginated'; id: string; sql: string; offset: number; limit: number }
  | { type: 'getRowCount'; id: string; tableName: string }
  | { type: 'loadPage'; id: string; tableName: string; page: number; pageSize: number; orderBy?: string }
  | { type: 'createTable'; id: string; tableName: string; columns: Array<{ name: string; type: string }> }
  | { type: 'insertRows'; id: string; tableName: string; rows: any[] }
  | { type: 'updateCell'; id: string; tableName: string; rowId: string; columnName: string; value: any }
  | { type: 'deleteRows'; id: string; tableName: string; rowIds: string[] };

export type DuckDBWorkerResponse =
  | { type: 'initialized'; success: boolean; error?: string }
  | { type: 'queryResult'; id: string; success: boolean; data?: any[]; columns?: string[]; error?: string }
  | { type: 'rowCount'; id: string; count: number; error?: string }
  | { type: 'pageData'; id: string; data: any[]; totalRows: number; totalPages: number; hasMore: boolean; error?: string }
  | { type: 'operationComplete'; id: string; success: boolean; error?: string };

// Worker state
let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

/**
 * Initialize DuckDB WASM instance
 */
async function initialize(): Promise<void> {
  try {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

    // Select appropriate bundle
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    // Instantiate the worker
    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: 'text/javascript',
      })
    );
    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();

    db = new duckdb.AsyncDuckDB(logger, worker);

    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);

    // Get connection
    conn = await db.connect();

    postMessage({
      type: 'initialized',
      success: true,
    } as DuckDBWorkerResponse);
  } catch (error) {
    console.error('DuckDB initialization failed:', error);
    postMessage({
      type: 'initialized',
      success: false,
      error: error instanceof Error ? error.message : 'Initialization failed',
    } as DuckDBWorkerResponse);
  }
}

/**
 * Execute a SQL query
 */
async function executeQuery(id: string, sql: string): Promise<void> {
  if (!conn) {
    postMessage({
      type: 'queryResult',
      id,
      success: false,
      error: 'Database not initialized',
    } as DuckDBWorkerResponse);
    return;
  }

  try {
    const result = await conn.query(sql);
    const data = result.toArray();
    const columns = result.schema.fields.map((f) => f.name);

    postMessage({
      type: 'queryResult',
      id,
      success: true,
      data,
      columns,
    } as DuckDBWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'queryResult',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Query failed',
    } as DuckDBWorkerResponse);
  }
}

/**
 * Execute a paginated query
 */
async function executeQueryPaginated(
  id: string,
  sql: string,
  offset: number,
  limit: number
): Promise<void> {
  // Remove existing LIMIT/OFFSET if present
  const cleanSQL = sql
    .replace(/\s+LIMIT\s+\d+/gi, '')
    .replace(/\s+OFFSET\s+\d+/gi, '');

  const paginatedSQL = `${cleanSQL} LIMIT ${limit} OFFSET ${offset}`;

  await executeQuery(id, paginatedSQL);
}

/**
 * Get total row count for a table
 */
async function getRowCount(id: string, tableName: string): Promise<void> {
  if (!conn) {
    postMessage({
      type: 'rowCount',
      id,
      count: 0,
      error: 'Database not initialized',
    } as DuckDBWorkerResponse);
    return;
  }

  try {
    const result = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const data = result.toArray();
    const count = data.length > 0 ? data[0].count : 0;

    postMessage({
      type: 'rowCount',
      id,
      count,
    } as DuckDBWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'rowCount',
      id,
      count: 0,
      error: error instanceof Error ? error.message : 'Count query failed',
    } as DuckDBWorkerResponse);
  }
}

/**
 * Load a page of data for virtual scrolling
 */
async function loadPage(
  id: string,
  tableName: string,
  page: number,
  pageSize: number,
  orderBy?: string
): Promise<void> {
  if (!conn) {
    postMessage({
      type: 'pageData',
      id,
      data: [],
      totalRows: 0,
      totalPages: 0,
      hasMore: false,
      error: 'Database not initialized',
    } as DuckDBWorkerResponse);
    return;
  }

  try {
    const offset = page * pageSize;
    const orderClause = orderBy ? ` ORDER BY ${orderBy}` : '';

    // Get data and count in parallel
    const [dataResult, countResult] = await Promise.all([
      conn.query(`SELECT * FROM ${tableName}${orderClause} LIMIT ${pageSize} OFFSET ${offset}`),
      conn.query(`SELECT COUNT(*) as count FROM ${tableName}`),
    ]);

    const data = dataResult.toArray();
    const countData = countResult.toArray();
    const totalRows = countData.length > 0 ? countData[0].count : 0;
    const totalPages = Math.ceil(totalRows / pageSize);
    const hasMore = page < totalPages - 1;

    postMessage({
      type: 'pageData',
      id,
      data,
      totalRows,
      totalPages,
      hasMore,
    } as DuckDBWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'pageData',
      id,
      data: [],
      totalRows: 0,
      totalPages: 0,
      hasMore: false,
      error: error instanceof Error ? error.message : 'Page load failed',
    } as DuckDBWorkerResponse);
  }
}

/**
 * Create a new table
 */
async function createTable(
  id: string,
  tableName: string,
  columns: Array<{ name: string; type: string }>
): Promise<void> {
  if (!conn) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: 'Database not initialized',
    } as DuckDBWorkerResponse);
    return;
  }

  try {
    const columnDefs = columns.map((col) => `${col.name} ${col.type}`).join(', ');
    const sql = `CREATE TABLE ${tableName} (${columnDefs})`;

    await conn.query(sql);

    postMessage({
      type: 'operationComplete',
      id,
      success: true,
    } as DuckDBWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Table creation failed',
    } as DuckDBWorkerResponse);
  }
}

/**
 * Insert rows into a table
 */
async function insertRows(id: string, tableName: string, rows: any[]): Promise<void> {
  if (!conn || rows.length === 0) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: 'Database not initialized or no rows provided',
    } as DuckDBWorkerResponse);
    return;
  }

  try {
    // Get column names from first row
    const columns = Object.keys(rows[0]);
    const columnList = columns.join(', ');

    // Build values for bulk insert
    const valuesList = rows
      .map((row) => {
        const values = columns.map((col) => {
          const value = row[col];
          if (value === null || value === undefined) return 'NULL';
          if (typeof value === 'number') return value;
          return `'${String(value).replace(/'/g, "''")}'`; // Escape single quotes
        });
        return `(${values.join(', ')})`;
      })
      .join(', ');

    const sql = `INSERT INTO ${tableName} (${columnList}) VALUES ${valuesList}`;

    await conn.query(sql);

    postMessage({
      type: 'operationComplete',
      id,
      success: true,
    } as DuckDBWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Insert failed',
    } as DuckDBWorkerResponse);
  }
}

/**
 * Update a single cell value
 */
async function updateCell(
  id: string,
  tableName: string,
  rowId: string,
  columnName: string,
  value: any
): Promise<void> {
  if (!conn) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: 'Database not initialized',
    } as DuckDBWorkerResponse);
    return;
  }

  try {
    let sqlValue: string;
    if (value === null || value === undefined) {
      sqlValue = 'NULL';
    } else if (typeof value === 'number') {
      sqlValue = String(value);
    } else {
      sqlValue = `'${String(value).replace(/'/g, "''")}'`;
    }

    const sql = `UPDATE ${tableName} SET ${columnName} = ${sqlValue} WHERE id = '${rowId}'`;

    await conn.query(sql);

    postMessage({
      type: 'operationComplete',
      id,
      success: true,
    } as DuckDBWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Update failed',
    } as DuckDBWorkerResponse);
  }
}

/**
 * Delete rows by IDs
 */
async function deleteRows(id: string, tableName: string, rowIds: string[]): Promise<void> {
  if (!conn || rowIds.length === 0) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: 'Database not initialized or no row IDs provided',
    } as DuckDBWorkerResponse);
    return;
  }

  try {
    const idList = rowIds.map((id) => `'${id}'`).join(', ');
    const sql = `DELETE FROM ${tableName} WHERE id IN (${idList})`;

    await conn.query(sql);

    postMessage({
      type: 'operationComplete',
      id,
      success: true,
    } as DuckDBWorkerResponse);
  } catch (error) {
    postMessage({
      type: 'operationComplete',
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    } as DuckDBWorkerResponse);
  }
}

/**
 * Message handler
 */
self.onmessage = async (event: MessageEvent<DuckDBWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'initialize':
      await initialize();
      break;

    case 'query':
      await executeQuery(message.id, message.sql);
      break;

    case 'queryPaginated':
      await executeQueryPaginated(message.id, message.sql, message.offset, message.limit);
      break;

    case 'getRowCount':
      await getRowCount(message.id, message.tableName);
      break;

    case 'loadPage':
      await loadPage(message.id, message.tableName, message.page, message.pageSize, message.orderBy);
      break;

    case 'createTable':
      await createTable(message.id, message.tableName, message.columns);
      break;

    case 'insertRows':
      await insertRows(message.id, message.tableName, message.rows);
      break;

    case 'updateCell':
      await updateCell(message.id, message.tableName, message.rowId, message.columnName, message.value);
      break;

    case 'deleteRows':
      await deleteRows(message.id, message.tableName, message.rowIds);
      break;

    default:
      console.warn('Unknown message type:', (message as any).type);
  }
};

// Export types for use in main thread
export type { DuckDBWorkerMessage, DuckDBWorkerResponse };
