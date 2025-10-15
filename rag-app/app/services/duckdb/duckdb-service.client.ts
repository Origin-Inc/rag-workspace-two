/**
 * DuckDB Service Stub
 *
 * This is a no-op stub that maintains the same API as the original DuckDB service
 * but doesn't actually use DuckDB. This allows the build to pass while we migrate
 * away from DuckDB.
 *
 * All methods are stubs that log warnings and return empty/default values.
 */

export class DuckDBService {
  private static instance: DuckDBService | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): DuckDBService {
    if (!DuckDBService.instance) {
      DuckDBService.instance = new DuckDBService();
    }
    return DuckDBService.instance;
  }

  public async initialize(): Promise<void> {
    console.warn('[DuckDB Stub] DuckDB has been removed. This is a no-op stub.');
    this.isInitialized = true;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  public async getConnection(): Promise<any> {
    console.warn('[DuckDB Stub] getConnection called on stub');
    return null;
  }

  public getDB(): any {
    console.warn('[DuckDB Stub] getDB called on stub');
    return null;
  }

  public async createTableFromCSV(tableName: string, csvData: string, pageId?: string): Promise<void> {
    console.warn('[DuckDB Stub] createTableFromCSV called on stub');
  }

  public async createTableFromJSON(tableName: string, jsonData: any[], pageId?: string): Promise<void> {
    console.warn('[DuckDB Stub] createTableFromJSON called on stub');
  }

  public async getTableSchema(tableName: string): Promise<any[]> {
    console.warn('[DuckDB Stub] getTableSchema called on stub');
    return [];
  }

  public async getTables(): Promise<string[]> {
    console.warn('[DuckDB Stub] getTables called on stub');
    return [];
  }

  public async dropTable(tableName: string): Promise<void> {
    console.warn('[DuckDB Stub] dropTable called on stub');
  }

  public async cleanup(): Promise<void> {
    console.warn('[DuckDB Stub] cleanup called on stub');
    this.isInitialized = false;
  }

  public async getTableRowCount(tableName: string): Promise<number> {
    console.warn('[DuckDB Stub] getTableRowCount called on stub');
    return 0;
  }

  public async getTableSample(tableName: string, limit: number = 10): Promise<any[]> {
    console.warn('[DuckDB Stub] getTableSample called on stub');
    return [];
  }

  public async createTableFromData(
    tableName: string,
    data: any[],
    schema?: { columns: Array<{ name: string; type: string }> },
    pageId?: string
  ): Promise<void> {
    console.warn('[DuckDB Stub] createTableFromData called on stub');
  }

  public async tableExists(tableName: string): Promise<boolean> {
    console.warn('[DuckDB Stub] tableExists called on stub');
    return false;
  }

  public async renameTable(oldName: string, newName: string): Promise<void> {
    console.warn('[DuckDB Stub] renameTable called on stub');
  }

  public async executeQuery(sql: string): Promise<any> {
    console.warn('[DuckDB Stub] executeQuery called on stub');
    return { toArray: () => [] };
  }

  public async restoreTablesForPage(pageId: string): Promise<any[]> {
    console.warn('[DuckDB Stub] restoreTablesForPage called on stub');
    return [];
  }

  public async clearPageTables(pageId: string): Promise<void> {
    console.warn('[DuckDB Stub] clearPageTables called on stub');
  }

  public async createTableFromStream(
    tableName: string,
    dataStream: AsyncGenerator<any[]>,
    schema: { columns: Array<{ name: string; type: string }> },
    pageId?: string,
    onProgress?: (loaded: number, total?: number) => void
  ): Promise<void> {
    console.warn('[DuckDB Stub] createTableFromStream called on stub');
  }

  public async insertChunk(
    tableName: string,
    chunk: any[],
    schema: { columns: Array<{ name: string; type: string }> }
  ): Promise<number> {
    console.warn('[DuckDB Stub] insertChunk called on stub');
    return 0;
  }

  public async getMemoryUsage(): Promise<{
    tableCount: number;
    estimatedMB: number;
  }> {
    console.warn('[DuckDB Stub] getMemoryUsage called on stub');
    return { tableCount: 0, estimatedMB: 0 };
  }
}

// Export singleton instance getter
export const getDuckDB = () => DuckDBService.getInstance();
