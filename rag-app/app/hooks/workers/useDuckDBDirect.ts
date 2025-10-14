/**
 * React hook for DuckDB WASM (Direct Integration)
 *
 * Uses DuckDB's pre-built browser workers with manual bundle configuration.
 * This is the recommended approach for Vite projects to avoid worker loading issues.
 *
 * Based on: https://duckdb.org/docs/stable/clients/wasm/deploying_duckdb_wasm.html
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';

// Import WASM and worker files with ?url suffix for Vite
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

// Manual bundle configuration for Vite
const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};

export interface DuckDBWorkerHook {
  isReady: boolean;
  isInitializing: boolean;
  error: string | null;
  query: (sql: string) => Promise<{ data: any[]; columns: string[] }>;
  getRowCount: (tableName: string) => Promise<number>;
  loadPage: (
    tableName: string,
    page: number,
    pageSize: number,
    orderBy?: string
  ) => Promise<{ data: any[]; totalRows: number; totalPages: number; hasMore: boolean }>;
  createTable: (tableName: string, columns: Array<{ name: string; type: string }>) => Promise<void>;
  insertRows: (tableName: string, rows: any[]) => Promise<void>;
  updateCell: (tableName: string, rowId: string, columnName: string, value: any) => Promise<void>;
  deleteRows: (tableName: string, rowIds: string[]) => Promise<void>;
}

/**
 * Hook for using DuckDB WASM directly (no custom worker wrapper)
 */
export function useDuckDBDirect(): DuckDBWorkerHook {
  const dbRef = useRef<duckdb.AsyncDuckDB | null>(null);
  const connRef = useRef<duckdb.AsyncDuckDBConnection | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize DuckDB
  useEffect(() => {
    console.log('[DuckDB Direct] Starting initialization...');

    if (dbRef.current) {
      console.log('[DuckDB Direct] Already initialized, using existing instance');
      setIsReady(true);
      return;
    }

    if (isInitializing) {
      console.log('[DuckDB Direct] Initialization already in progress');
      return;
    }

    setIsInitializing(true);

    async function initialize() {
      try {
        console.log('[DuckDB Direct] Selecting bundle from manual configuration...');
        const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
        console.log('[DuckDB Direct] Bundle selected:', bundle);

        console.log('[DuckDB Direct] Creating worker from bundle...');
        const worker = new Worker(bundle.mainWorker!);
        const logger = new duckdb.ConsoleLogger();

        console.log('[DuckDB Direct] Creating AsyncDuckDB instance...');
        const db = new duckdb.AsyncDuckDB(logger, worker);
        dbRef.current = db;

        console.log('[DuckDB Direct] Instantiating DuckDB with bundle modules...');
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        console.log('[DuckDB Direct] DuckDB instantiated successfully');

        console.log('[DuckDB Direct] Opening database connection...');
        const conn = await db.connect();
        connRef.current = conn;
        console.log('[DuckDB Direct] ✅ Connection established successfully!');

        setIsReady(true);
        setError(null);
      } catch (err) {
        console.error('[DuckDB Direct] ❌ Initialization failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize DuckDB');
        // Clean up on error
        if (dbRef.current) {
          try {
            dbRef.current.terminate();
          } catch (e) {
            console.error('[DuckDB Direct] Failed to terminate DB after error:', e);
          }
          dbRef.current = null;
        }
      } finally {
        setIsInitializing(false);
      }
    }

    initialize();

    // Cleanup only on unmount
    return () => {
      console.log('[DuckDB Direct] Component unmounting, cleaning up...');
      if (connRef.current) {
        try {
          connRef.current.close();
        } catch (e) {
          console.error('[DuckDB Direct] Error closing connection:', e);
        }
        connRef.current = null;
      }
      if (dbRef.current) {
        try {
          dbRef.current.terminate();
        } catch (e) {
          console.error('[DuckDB Direct] Error terminating DB:', e);
        }
        dbRef.current = null;
      }
      setIsReady(false);
      setIsInitializing(false);
    };
  }, []); // Empty dependency array - only run once on mount

  // Execute SQL query
  const query = useCallback(
    async (sql: string): Promise<{ data: any[]; columns: string[] }> => {
      if (!connRef.current || !isReady) {
        throw new Error('Database not ready');
      }

      const result = await connRef.current.query(sql);
      const data = result.toArray();
      const columns = result.schema.fields.map((f) => f.name);

      return { data, columns };
    },
    [isReady]
  );

  // Get row count
  const getRowCount = useCallback(
    async (tableName: string): Promise<number> => {
      if (!connRef.current || !isReady) {
        throw new Error('Database not ready');
      }

      const result = await connRef.current.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const data = result.toArray();
      const count = data.length > 0 ? data[0].count : 0;
      // Convert BigInt to Number for JavaScript compatibility
      return typeof count === 'bigint' ? Number(count) : count;
    },
    [isReady]
  );

  // Load page
  const loadPage = useCallback(
    async (
      tableName: string,
      page: number,
      pageSize: number,
      orderBy?: string
    ): Promise<{ data: any[]; totalRows: number; totalPages: number; hasMore: boolean }> => {
      if (!connRef.current || !isReady) {
        throw new Error('Database not ready');
      }

      const offset = page * pageSize;
      const orderClause = orderBy ? ` ORDER BY ${orderBy}` : '';

      // Get data and count in parallel
      const [dataResult, countResult] = await Promise.all([
        connRef.current.query(`SELECT * FROM ${tableName}${orderClause} LIMIT ${pageSize} OFFSET ${offset}`),
        connRef.current.query(`SELECT COUNT(*) as count FROM ${tableName}`),
      ]);

      const data = dataResult.toArray();
      const countData = countResult.toArray();
      const rawCount = countData.length > 0 ? countData[0].count : 0;
      // Convert BigInt to Number for JavaScript compatibility
      const totalRows = typeof rawCount === 'bigint' ? Number(rawCount) : rawCount;
      const totalPages = Math.ceil(totalRows / pageSize);
      const hasMore = page < totalPages - 1;

      return { data, totalRows, totalPages, hasMore };
    },
    [isReady]
  );

  // Create table
  const createTable = useCallback(
    async (tableName: string, columns: Array<{ name: string; type: string }>): Promise<void> => {
      if (!connRef.current || !isReady) {
        throw new Error('Database not ready');
      }

      const columnDefs = columns.map((col) => `${col.name} ${col.type}`).join(', ');
      const sql = `CREATE TABLE ${tableName} (${columnDefs})`;
      await connRef.current.query(sql);
    },
    [isReady]
  );

  // Insert rows
  const insertRows = useCallback(
    async (tableName: string, rows: any[]): Promise<void> => {
      if (!connRef.current || !isReady || rows.length === 0) {
        throw new Error('Database not ready or no rows provided');
      }

      const columns = Object.keys(rows[0]);
      const columnList = columns.join(', ');

      const valuesList = rows
        .map((row) => {
          const values = columns.map((col) => {
            const value = row[col];
            if (value === null || value === undefined) return 'NULL';
            if (typeof value === 'number') return value;
            return `'${String(value).replace(/'/g, "''")}'`;
          });
          return `(${values.join(', ')})`;
        })
        .join(', ');

      const sql = `INSERT INTO ${tableName} (${columnList}) VALUES ${valuesList}`;
      await connRef.current.query(sql);
    },
    [isReady]
  );

  // Update cell
  const updateCell = useCallback(
    async (tableName: string, rowId: string, columnName: string, value: any): Promise<void> => {
      if (!connRef.current || !isReady) {
        throw new Error('Database not ready');
      }

      let sqlValue: string;
      if (value === null || value === undefined) {
        sqlValue = 'NULL';
      } else if (typeof value === 'number') {
        sqlValue = String(value);
      } else {
        sqlValue = `'${String(value).replace(/'/g, "''")}'`;
      }

      const sql = `UPDATE ${tableName} SET ${columnName} = ${sqlValue} WHERE id = '${rowId}'`;
      await connRef.current.query(sql);
    },
    [isReady]
  );

  // Delete rows
  const deleteRows = useCallback(
    async (tableName: string, rowIds: string[]): Promise<void> => {
      if (!connRef.current || !isReady || rowIds.length === 0) {
        throw new Error('Database not ready or no row IDs provided');
      }

      const idList = rowIds.map((id) => `'${id}'`).join(', ');
      const sql = `DELETE FROM ${tableName} WHERE id IN (${idList})`;
      await connRef.current.query(sql);
    },
    [isReady]
  );

  return {
    isReady,
    isInitializing,
    error,
    query,
    getRowCount,
    loadPage,
    createTable,
    insertRows,
    updateCell,
    deleteRows,
  };
}
