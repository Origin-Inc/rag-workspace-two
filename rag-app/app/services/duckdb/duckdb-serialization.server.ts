/**
 * DuckDB Serialization Service Stub (Server-side)
 *
 * No-op stub for DuckDB serialization functionality
 */

export class DuckDBSerializationService {
  private static instance: DuckDBSerializationService | null = null;

  private constructor() {}

  public static getInstance(): DuckDBSerializationService {
    if (!DuckDBSerializationService.instance) {
      DuckDBSerializationService.instance = new DuckDBSerializationService();
    }
    return DuckDBSerializationService.instance;
  }

  public async serializeTable(tableName: string): Promise<ArrayBuffer | null> {
    console.warn('[DuckDB Stub] serializeTable called on stub');
    return null;
  }

  public async deserializeTable(tableName: string, data: ArrayBuffer): Promise<void> {
    console.warn('[DuckDB Stub] deserializeTable called on stub');
  }

  public async saveTableToFile(tableName: string, filePath: string): Promise<void> {
    console.warn('[DuckDB Stub] saveTableToFile called on stub');
  }

  public async loadTableFromFile(tableName: string, filePath: string): Promise<void> {
    console.warn('[DuckDB Stub] loadTableFromFile called on stub');
  }
}

export const getDuckDBSerialization = () => DuckDBSerializationService.getInstance();
