/**
 * Web Worker for Database Block Processing
 * Handles heavy computations off the main thread
 */

// TypeScript declarations for Web Worker context
declare const self: DedicatedWorkerGlobalScope;

interface WorkerMessage {
  id: string;
  type: 'filter' | 'sort' | 'aggregate' | 'search' | 'transform' | 'batch';
  data: any;
  options?: any;
}

interface WorkerResponse {
  id: string;
  type: string;
  result?: any;
  error?: string;
  duration?: number;
}

// Performance tracking
class PerformanceTracker {
  private start: number = 0;
  
  begin() {
    this.start = performance.now();
  }
  
  end(): number {
    return performance.now() - this.start;
  }
}

// Data processing functions
class DataProcessor {
  // Filter rows based on conditions
  static filter(rows: any[], filters: any[]): any[] {
    if (!filters || filters.length === 0) return rows;
    
    return rows.filter(row => {
      return filters.every(filter => {
        const value = row.cells?.[filter.columnId] ?? row[filter.columnId];
        
        switch (filter.operator) {
          case 'equals':
            return value === filter.value;
          case 'not_equals':
            return value !== filter.value;
          case 'contains':
            return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
          case 'not_contains':
            return !String(value).toLowerCase().includes(String(filter.value).toLowerCase());
          case 'greater_than':
            return Number(value) > Number(filter.value);
          case 'less_than':
            return Number(value) < Number(filter.value);
          case 'greater_than_or_equal':
            return Number(value) >= Number(filter.value);
          case 'less_than_or_equal':
            return Number(value) <= Number(filter.value);
          case 'is_empty':
            return value == null || value === '';
          case 'is_not_empty':
            return value != null && value !== '';
          case 'starts_with':
            return String(value).toLowerCase().startsWith(String(filter.value).toLowerCase());
          case 'ends_with':
            return String(value).toLowerCase().endsWith(String(filter.value).toLowerCase());
          case 'in':
            return Array.isArray(filter.value) ? filter.value.includes(value) : value === filter.value;
          case 'not_in':
            return Array.isArray(filter.value) ? !filter.value.includes(value) : value !== filter.value;
          case 'between':
            const [min, max] = filter.value;
            const numValue = Number(value);
            return numValue >= Number(min) && numValue <= Number(max);
          default:
            return true;
        }
      });
    });
  }
  
  // Sort rows by multiple columns
  static sort(rows: any[], sorts: any[]): any[] {
    if (!sorts || sorts.length === 0) return rows;
    
    return [...rows].sort((a, b) => {
      for (const sort of sorts) {
        const aVal = a.cells?.[sort.columnId] ?? a[sort.columnId];
        const bVal = b.cells?.[sort.columnId] ?? b[sort.columnId];
        
        let comparison = 0;
        
        // Handle null/undefined values
        if (aVal == null && bVal == null) comparison = 0;
        else if (aVal == null) comparison = 1;
        else if (bVal == null) comparison = -1;
        // Handle dates
        else if (sort.type === 'date' || sort.type === 'datetime') {
          const aDate = new Date(aVal).getTime();
          const bDate = new Date(bVal).getTime();
          comparison = aDate - bDate;
        }
        // Handle numbers
        else if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        }
        // Handle booleans
        else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
          comparison = (aVal ? 1 : 0) - (bVal ? 1 : 0);
        }
        // Handle strings and others
        else {
          const aStr = String(aVal).toLowerCase();
          const bStr = String(bVal).toLowerCase();
          comparison = aStr.localeCompare(bStr);
        }
        
        if (comparison !== 0) {
          return sort.direction === 'desc' ? -comparison : comparison;
        }
      }
      
      return 0;
    });
  }
  
  // Aggregate data for statistics
  static aggregate(rows: any[], options: any): any {
    const { columnId, operation, groupBy } = options;
    
    if (groupBy) {
      // Group by aggregation
      const groups = new Map<any, any[]>();
      
      for (const row of rows) {
        const groupKey = row.cells?.[groupBy] ?? row[groupBy];
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(row);
      }
      
      const results = new Map<any, any>();
      
      for (const [key, groupRows] of groups) {
        results.set(key, this.performAggregation(groupRows, columnId, operation));
      }
      
      return Object.fromEntries(results);
    } else {
      // Simple aggregation
      return this.performAggregation(rows, columnId, operation);
    }
  }
  
  private static performAggregation(rows: any[], columnId: string, operation: string): any {
    const values = rows
      .map(r => r.cells?.[columnId] ?? r[columnId])
      .filter(v => v != null);
    
    switch (operation) {
      case 'sum':
        return values.reduce((sum, v) => sum + Number(v), 0);
      
      case 'avg':
      case 'average':
        if (values.length === 0) return 0;
        return values.reduce((sum, v) => sum + Number(v), 0) / values.length;
      
      case 'min':
        if (values.length === 0) return null;
        return Math.min(...values.map(Number));
      
      case 'max':
        if (values.length === 0) return null;
        return Math.max(...values.map(Number));
      
      case 'count':
        return values.length;
      
      case 'count_distinct':
        return new Set(values).size;
      
      case 'median':
        if (values.length === 0) return null;
        const sorted = values.map(Number).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      
      case 'mode':
        if (values.length === 0) return null;
        const frequency = new Map<any, number>();
        let maxFreq = 0;
        let mode = null;
        
        for (const value of values) {
          const freq = (frequency.get(value) || 0) + 1;
          frequency.set(value, freq);
          if (freq > maxFreq) {
            maxFreq = freq;
            mode = value;
          }
        }
        
        return mode;
      
      case 'std_dev':
      case 'standard_deviation':
        if (values.length === 0) return 0;
        const nums = values.map(Number);
        const mean = nums.reduce((sum, v) => sum + v, 0) / nums.length;
        const squaredDiffs = nums.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / nums.length;
        return Math.sqrt(variance);
      
      case 'percentile_25':
        return this.percentile(values.map(Number), 0.25);
      
      case 'percentile_75':
        return this.percentile(values.map(Number), 0.75);
      
      case 'percentile_95':
        return this.percentile(values.map(Number), 0.95);
      
      default:
        return null;
    }
  }
  
  private static percentile(values: number[], p: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
  
  // Full-text search across all columns
  static search(rows: any[], query: string, options?: any): any[] {
    if (!query) return rows;
    
    const searchTerm = query.toLowerCase();
    const columnsToSearch = options?.columns || null;
    const fuzzy = options?.fuzzy || false;
    
    return rows.filter(row => {
      const cells = row.cells || row;
      
      for (const [key, value] of Object.entries(cells)) {
        // Skip if specific columns are specified and this isn't one
        if (columnsToSearch && !columnsToSearch.includes(key)) continue;
        
        const strValue = String(value).toLowerCase();
        
        if (fuzzy) {
          // Fuzzy matching
          if (this.fuzzyMatch(strValue, searchTerm)) return true;
        } else {
          // Exact substring matching
          if (strValue.includes(searchTerm)) return true;
        }
      }
      
      return false;
    });
  }
  
  private static fuzzyMatch(str: string, pattern: string): boolean {
    let patternIdx = 0;
    let strIdx = 0;
    
    while (strIdx < str.length && patternIdx < pattern.length) {
      if (str[strIdx] === pattern[patternIdx]) {
        patternIdx++;
      }
      strIdx++;
    }
    
    return patternIdx === pattern.length;
  }
  
  // Transform data structure
  static transform(rows: any[], options: any): any[] {
    const { type, config } = options;
    
    switch (type) {
      case 'pivot':
        return this.pivotData(rows, config);
      
      case 'unpivot':
        return this.unpivotData(rows, config);
      
      case 'normalize':
        return this.normalizeData(rows, config);
      
      case 'denormalize':
        return this.denormalizeData(rows, config);
      
      case 'flatten':
        return this.flattenData(rows, config);
      
      default:
        return rows;
    }
  }
  
  private static pivotData(rows: any[], config: any): any[] {
    const { rowKey, columnKey, valueKey, aggregation = 'sum' } = config;
    const pivoted = new Map<string, any>();
    
    for (const row of rows) {
      const rowKeyValue = row[rowKey];
      const columnKeyValue = row[columnKey];
      const value = row[valueKey];
      
      if (!pivoted.has(rowKeyValue)) {
        pivoted.set(rowKeyValue, { [rowKey]: rowKeyValue });
      }
      
      const pivotRow = pivoted.get(rowKeyValue);
      
      if (aggregation === 'sum') {
        pivotRow[columnKeyValue] = (pivotRow[columnKeyValue] || 0) + Number(value);
      } else if (aggregation === 'count') {
        pivotRow[columnKeyValue] = (pivotRow[columnKeyValue] || 0) + 1;
      } else if (aggregation === 'concat') {
        pivotRow[columnKeyValue] = pivotRow[columnKeyValue] 
          ? `${pivotRow[columnKeyValue]}, ${value}` 
          : value;
      }
    }
    
    return Array.from(pivoted.values());
  }
  
  private static unpivotData(rows: any[], config: any): any[] {
    const { idColumns, valueColumns, variableName = 'variable', valueName = 'value' } = config;
    const unpivoted: any[] = [];
    
    for (const row of rows) {
      const baseRow: any = {};
      
      // Copy ID columns
      for (const col of idColumns) {
        baseRow[col] = row[col];
      }
      
      // Create row for each value column
      for (const col of valueColumns) {
        unpivoted.push({
          ...baseRow,
          [variableName]: col,
          [valueName]: row[col]
        });
      }
    }
    
    return unpivoted;
  }
  
  private static normalizeData(rows: any[], config: any): any[] {
    const { columns, method = 'minmax' } = config;
    const normalized = [...rows];
    
    for (const col of columns) {
      const values = rows.map(r => Number(r[col])).filter(v => !isNaN(v));
      
      if (values.length === 0) continue;
      
      if (method === 'minmax') {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        
        if (range > 0) {
          for (const row of normalized) {
            const value = Number(row[col]);
            if (!isNaN(value)) {
              row[col] = (value - min) / range;
            }
          }
        }
      } else if (method === 'zscore') {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const stdDev = Math.sqrt(
          values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
        );
        
        if (stdDev > 0) {
          for (const row of normalized) {
            const value = Number(row[col]);
            if (!isNaN(value)) {
              row[col] = (value - mean) / stdDev;
            }
          }
        }
      }
    }
    
    return normalized;
  }
  
  private static denormalizeData(rows: any[], config: any): any[] {
    // Reverse normalization if statistics are provided
    const { columns, stats } = config;
    const denormalized = [...rows];
    
    for (const col of columns) {
      const colStats = stats[col];
      if (!colStats) continue;
      
      if (colStats.method === 'minmax') {
        const { min, max } = colStats;
        const range = max - min;
        
        for (const row of denormalized) {
          const value = Number(row[col]);
          if (!isNaN(value)) {
            row[col] = value * range + min;
          }
        }
      } else if (colStats.method === 'zscore') {
        const { mean, stdDev } = colStats;
        
        for (const row of denormalized) {
          const value = Number(row[col]);
          if (!isNaN(value)) {
            row[col] = value * stdDev + mean;
          }
        }
      }
    }
    
    return denormalized;
  }
  
  private static flattenData(rows: any[], config: any): any[] {
    const { maxDepth = 10 } = config;
    
    const flatten = (obj: any, prefix = '', depth = 0): any => {
      if (depth >= maxDepth) return { [prefix]: obj };
      
      const flattened: any = {};
      
      for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          Object.assign(flattened, flatten(value, newKey, depth + 1));
        } else if (Array.isArray(value)) {
          flattened[newKey] = value.join(', ');
        } else {
          flattened[newKey] = value;
        }
      }
      
      return flattened;
    };
    
    return rows.map(row => flatten(row));
  }
  
  // Process batch operations
  static batch(operations: any[]): any[] {
    const results: any[] = [];
    
    for (const op of operations) {
      try {
        let result: any;
        
        switch (op.type) {
          case 'filter':
            result = this.filter(op.data, op.filters);
            break;
          case 'sort':
            result = this.sort(op.data, op.sorts);
            break;
          case 'aggregate':
            result = this.aggregate(op.data, op.options);
            break;
          case 'search':
            result = this.search(op.data, op.query, op.options);
            break;
          case 'transform':
            result = this.transform(op.data, op.options);
            break;
          default:
            result = { error: `Unknown operation: ${op.type}` };
        }
        
        results.push({ id: op.id, result });
      } catch (error) {
        results.push({ 
          id: op.id, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    
    return results;
  }
}

// Message handler
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const { id, type, data, options } = event.data;
  const tracker = new PerformanceTracker();
  tracker.begin();
  
  try {
    let result: any;
    
    switch (type) {
      case 'filter':
        result = DataProcessor.filter(data, options);
        break;
      
      case 'sort':
        result = DataProcessor.sort(data, options);
        break;
      
      case 'aggregate':
        result = DataProcessor.aggregate(data, options);
        break;
      
      case 'search':
        result = DataProcessor.search(data, options.query, options);
        break;
      
      case 'transform':
        result = DataProcessor.transform(data, options);
        break;
      
      case 'batch':
        result = DataProcessor.batch(options);
        break;
      
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
    
    const response: WorkerResponse = {
      id,
      type,
      result,
      duration: tracker.end()
    };
    
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      type,
      error: error instanceof Error ? error.message : String(error),
      duration: tracker.end()
    };
    
    self.postMessage(response);
  }
});

// Export for TypeScript
export {};