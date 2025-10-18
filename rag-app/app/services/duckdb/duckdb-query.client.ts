/**
 * DuckDB Query Service Stub
 *
 * No-op stub for DuckDB query functionality
 */

export interface SQLGenerationResponse {
  sql: string;
  explanation: string;
  error?: string;
}

export class DuckDBQueryService {
  private static instance: DuckDBQueryService | null = null;

  private constructor() {}

  public static getInstance(): DuckDBQueryService {
    if (!DuckDBQueryService.instance) {
      DuckDBQueryService.instance = new DuckDBQueryService();
    }
    return DuckDBQueryService.instance;
  }

  public async generateSQL(prompt: string, context?: any): Promise<SQLGenerationResponse> {
    console.warn('[DuckDB Stub] generateSQL called on stub');
    return {
      sql: '',
      explanation: 'DuckDB has been removed from this application',
      error: 'DuckDB functionality is not available'
    };
  }

  public async executeSQL(sql: string): Promise<any> {
    console.warn('[DuckDB Stub] executeSQL called on stub');
    return { toArray: () => [] };
  }

  public async getTableSchema(tableName: string): Promise<any[]> {
    console.warn('[DuckDB Stub] getTableSchema called on stub');
    return [];
  }

  public async processNaturalLanguageQuery(
    query: string,
    files: any[],
    pageId: string,
    workspaceId: string
  ): Promise<any> {
    console.warn('[DuckDB Stub] processNaturalLanguageQuery called on stub');
    return {
      queryResult: {
        success: false,
        error: 'DuckDB functionality is not available',
        rowCount: 0,
        executionTime: 0
      },
      formattedResult: null
    };
  }
}

export const getDuckDBQuery = () => DuckDBQueryService.getInstance();
