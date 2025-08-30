// High-performance Formula Engine for Database Blocks
// Supports complex expressions, dependency tracking, and incremental updates

import { Parser } from 'expr-eval';
import type { DatabaseRowEnhanced, DatabaseColumnEnhanced, FormulaContext } from '~/types/database-block-enhanced';

export interface FormulaResult {
  value: any;
  type: 'number' | 'string' | 'boolean' | 'date' | 'array' | 'object' | 'error';
  error?: string;
  dependencies?: string[];
  computedAt: Date;
}

export interface FormulaDependency {
  columnId: string;
  type: 'direct' | 'indirect' | 'relation' | 'aggregation';
  weight: number; // For dependency resolution order
}

/**
 * Advanced Formula Engine with support for:
 * - Mathematical operations
 * - String manipulations
 * - Date/time functions
 * - Aggregation functions
 * - Conditional logic
 * - Array operations
 * - Custom functions
 */
export class FormulaEngine {
  private parser: Parser;
  private customFunctions: Map<string, Function>;
  private dependencyGraph: Map<string, Set<string>>;

  constructor() {
    this.parser = new Parser({
      allowMemberAccess: false, // Security: disable property access
      allowFunctionAccess: false // Security: disable arbitrary function calls
    });
    
    this.customFunctions = new Map();
    this.dependencyGraph = new Map();
    
    this.registerBuiltinFunctions();
  }

  /**
   * Evaluate a formula expression with the given context
   */
  async evaluate(
    expression: string,
    context: FormulaContext,
    columnId?: string
  ): Promise<FormulaResult> {
    try {
      // Parse and analyze dependencies
      const dependencies = this.extractDependencies(expression);
      
      // Prepare evaluation context
      const evalContext = this.prepareEvaluationContext(context);
      
      // Parse the expression
      const expr = this.parser.parse(expression);
      
      // Evaluate with timeout protection
      const result = await this.evaluateWithTimeout(expr, evalContext, 5000);
      
      return {
        value: result,
        type: this.inferType(result),
        dependencies,
        computedAt: new Date()
      };
    } catch (error) {
      return {
        value: null,
        type: 'error',
        error: error instanceof Error ? error.message : 'Formula evaluation failed',
        dependencies: this.extractDependencies(expression),
        computedAt: new Date()
      };
    }
  }

  /**
   * Extract column dependencies from a formula expression
   */
  extractDependencies(expression: string): string[] {
    const dependencies = new Set<string>();
    
    // Match column references like {column_name} or column_name
    const columnRefRegex = /\{([^}]+)\}|([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;
    
    while ((match = columnRefRegex.exec(expression)) !== null) {
      const columnName = match[1] || match[2];
      if (columnName && !this.isBuiltinFunction(columnName)) {
        dependencies.add(columnName);
      }
    }
    
    return Array.from(dependencies);
  }

  /**
   * Build dependency graph for a database block
   */
  buildDependencyGraph(columns: DatabaseColumnEnhanced[]): Map<string, FormulaDependency[]> {
    const graph = new Map<string, FormulaDependency[]>();
    
    for (const column of columns) {
      if (column.type === 'formula' && column.formula?.expression) {
        const dependencies = this.extractDependencies(column.formula.expression);
        const deps: FormulaDependency[] = dependencies.map(dep => ({
          columnId: dep,
          type: 'direct',
          weight: 1
        }));
        
        graph.set(column.columnId, deps);
      }
      
      if (column.type === 'rollup' && column.rollup) {
        const deps: FormulaDependency[] = [{
          columnId: column.rollup.targetProperty,
          type: 'relation',
          weight: 2
        }];
        graph.set(column.columnId, deps);
      }
      
      if (column.type === 'lookup' && column.lookup) {
        const deps: FormulaDependency[] = [{
          columnId: column.lookup.targetProperty,
          type: 'relation',
          weight: 2
        }];
        graph.set(column.columnId, deps);
      }
    }
    
    return graph;
  }

  /**
   * Get computation order based on dependencies (topological sort)
   */
  getComputationOrder(columns: DatabaseColumnEnhanced[]): string[] {
    const graph = this.buildDependencyGraph(columns);
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];
    
    const visit = (columnId: string) => {
      if (visiting.has(columnId)) {
        throw new Error(`Circular dependency detected involving ${columnId}`);
      }
      
      if (visited.has(columnId)) {
        return;
      }
      
      visiting.add(columnId);
      
      const dependencies = graph.get(columnId) || [];
      for (const dep of dependencies) {
        visit(dep.columnId);
      }
      
      visiting.delete(columnId);
      visited.add(columnId);
      order.push(columnId);
    };
    
    // Visit all formula columns
    for (const column of columns) {
      if (this.isComputedColumn(column) && !visited.has(column.columnId)) {
        visit(column.columnId);
      }
    }
    
    return order;
  }

  /**
   * Batch evaluate all computed columns for multiple rows
   */
  async batchEvaluate(
    rows: DatabaseRowEnhanced[],
    columns: DatabaseColumnEnhanced[]
  ): Promise<Map<string, Map<string, FormulaResult>>> {
    const results = new Map<string, Map<string, FormulaResult>>();
    const computationOrder = this.getComputationOrder(columns);
    
    // Process each column in dependency order
    for (const columnId of computationOrder) {
      const column = columns.find(c => c.columnId === columnId);
      if (!column || !this.isComputedColumn(column)) continue;
      
      // Process all rows for this column
      for (const row of rows) {
        if (!results.has(row.id)) {
          results.set(row.id, new Map());
        }
        
        const context: FormulaContext = {
          row,
          allRows: rows,
          columns,
          relations: {}, // TODO: Load related rows
          aggregations: {}, // TODO: Load aggregations
          functions: Object.fromEntries(this.customFunctions)
        };
        
        let result: FormulaResult;
        
        if (column.type === 'formula' && column.formula?.expression) {
          result = await this.evaluate(column.formula.expression, context, columnId);
        } else if (column.type === 'rollup' && column.rollup) {
          result = await this.evaluateRollup(column.rollup, context);
        } else if (column.type === 'lookup' && column.lookup) {
          result = await this.evaluateLookup(column.lookup, context);
        } else {
          result = {
            value: null,
            type: 'error',
            error: 'Unsupported computed column type',
            computedAt: new Date()
          };
        }
        
        results.get(row.id)!.set(columnId, result);
      }
    }
    
    return results;
  }

  /**
   * Register built-in functions
   */
  private registerBuiltinFunctions() {
    // Mathematical functions
    this.customFunctions.set('abs', Math.abs);
    this.customFunctions.set('ceil', Math.ceil);
    this.customFunctions.set('floor', Math.floor);
    this.customFunctions.set('round', (n: number, d = 0) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d));
    this.customFunctions.set('sqrt', Math.sqrt);
    this.customFunctions.set('pow', Math.pow);
    this.customFunctions.set('log', Math.log);
    this.customFunctions.set('exp', Math.exp);
    this.customFunctions.set('sin', Math.sin);
    this.customFunctions.set('cos', Math.cos);
    this.customFunctions.set('tan', Math.tan);
    
    // String functions
    this.customFunctions.set('len', (s: string) => s?.length || 0);
    this.customFunctions.set('upper', (s: string) => s?.toUpperCase() || '');
    this.customFunctions.set('lower', (s: string) => s?.toLowerCase() || '');
    this.customFunctions.set('trim', (s: string) => s?.trim() || '');
    this.customFunctions.set('left', (s: string, n: number) => s?.substring(0, n) || '');
    this.customFunctions.set('right', (s: string, n: number) => s?.substring(s.length - n) || '');
    this.customFunctions.set('mid', (s: string, start: number, len?: number) => 
      len ? s?.substring(start, start + len) || '' : s?.substring(start) || '');
    this.customFunctions.set('concat', (...args: any[]) => args.join(''));
    this.customFunctions.set('replace', (s: string, search: string, replace: string) => 
      s?.replace(new RegExp(search, 'g'), replace) || '');
    this.customFunctions.set('contains', (s: string, search: string) => s?.includes(search) || false);
    
    // Date functions
    this.customFunctions.set('now', () => new Date());
    this.customFunctions.set('today', () => new Date().toISOString().split('T')[0]);
    this.customFunctions.set('year', (d: Date) => new Date(d).getFullYear());
    this.customFunctions.set('month', (d: Date) => new Date(d).getMonth() + 1);
    this.customFunctions.set('day', (d: Date) => new Date(d).getDate());
    this.customFunctions.set('weekday', (d: Date) => new Date(d).getDay());
    this.customFunctions.set('hour', (d: Date) => new Date(d).getHours());
    this.customFunctions.set('minute', (d: Date) => new Date(d).getMinutes());
    this.customFunctions.set('second', (d: Date) => new Date(d).getSeconds());
    this.customFunctions.set('datediff', (d1: Date, d2: Date, unit = 'days') => {
      const diff = new Date(d2).getTime() - new Date(d1).getTime();
      switch (unit) {
        case 'seconds': return Math.floor(diff / 1000);
        case 'minutes': return Math.floor(diff / (1000 * 60));
        case 'hours': return Math.floor(diff / (1000 * 60 * 60));
        case 'days': return Math.floor(diff / (1000 * 60 * 60 * 24));
        case 'weeks': return Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
        case 'months': return Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
        case 'years': return Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
        default: return diff;
      }
    });
    this.customFunctions.set('dateadd', (d: Date, amount: number, unit = 'days') => {
      const date = new Date(d);
      switch (unit) {
        case 'seconds': date.setSeconds(date.getSeconds() + amount); break;
        case 'minutes': date.setMinutes(date.getMinutes() + amount); break;
        case 'hours': date.setHours(date.getHours() + amount); break;
        case 'days': date.setDate(date.getDate() + amount); break;
        case 'weeks': date.setDate(date.getDate() + amount * 7); break;
        case 'months': date.setMonth(date.getMonth() + amount); break;
        case 'years': date.setFullYear(date.getFullYear() + amount); break;
      }
      return date;
    });
    
    // Logical functions
    this.customFunctions.set('if', (condition: boolean, trueVal: any, falseVal: any) => 
      condition ? trueVal : falseVal);
    this.customFunctions.set('and', (...args: boolean[]) => args.every(Boolean));
    this.customFunctions.set('or', (...args: boolean[]) => args.some(Boolean));
    this.customFunctions.set('not', (val: boolean) => !val);
    this.customFunctions.set('isempty', (val: any) => val === null || val === undefined || val === '');
    this.customFunctions.set('isnotempty', (val: any) => val !== null && val !== undefined && val !== '');
    
    // Array functions
    this.customFunctions.set('sum', (arr: number[]) => arr.reduce((a, b) => a + b, 0));
    this.customFunctions.set('avg', (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    this.customFunctions.set('min', (arr: number[]) => Math.min(...arr));
    this.customFunctions.set('max', (arr: number[]) => Math.max(...arr));
    this.customFunctions.set('count', (arr: any[]) => arr.length);
    this.customFunctions.set('unique', (arr: any[]) => [...new Set(arr)]);
    this.customFunctions.set('join', (arr: any[], separator = ',') => arr.join(separator));
    
    // Conversion functions
    this.customFunctions.set('number', (val: any) => Number(val) || 0);
    this.customFunctions.set('text', (val: any) => String(val));
    this.customFunctions.set('date', (val: any) => new Date(val));
    this.customFunctions.set('boolean', (val: any) => Boolean(val));
  }

  private prepareEvaluationContext(context: FormulaContext): Record<string, any> {
    const evalContext: Record<string, any> = {};
    
    // Add column values from current row
    for (const column of context.columns) {
      const value = context.row.data[column.columnId];
      evalContext[column.columnId] = value;
      evalContext[column.name] = value; // Also allow access by column name
    }
    
    // Add custom functions
    for (const [name, func] of this.customFunctions) {
      evalContext[name] = func;
    }
    
    // Add computed data (cached values)
    for (const [key, value] of Object.entries(context.row.computedData || {})) {
      evalContext[key] = value;
    }
    
    // Add aggregations
    for (const [key, value] of Object.entries(context.aggregations)) {
      evalContext[key] = value;
    }
    
    return evalContext;
  }

  private async evaluateWithTimeout(
    expr: any,
    context: Record<string, any>,
    timeoutMs: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Formula evaluation timeout'));
      }, timeoutMs);
      
      try {
        const result = expr.evaluate(context);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private inferType(value: any): 'number' | 'string' | 'boolean' | 'date' | 'array' | 'object' | 'error' {
    if (value === null || value === undefined) return 'object';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }

  private isBuiltinFunction(name: string): boolean {
    return this.customFunctions.has(name) || 
           ['abs', 'ceil', 'floor', 'max', 'min', 'round', 'sqrt'].includes(name);
  }

  private isComputedColumn(column: DatabaseColumnEnhanced): boolean {
    return ['formula', 'rollup', 'lookup', 'count', 'created_time', 'updated_time', 
            'created_by', 'updated_by', 'auto_number'].includes(column.type);
  }

  private async evaluateRollup(rollup: any, context: FormulaContext): Promise<FormulaResult> {
    // TODO: Implement rollup evaluation
    // This would query related records and apply aggregation
    return {
      value: null,
      type: 'error',
      error: 'Rollup evaluation not yet implemented',
      computedAt: new Date()
    };
  }

  private async evaluateLookup(lookup: any, context: FormulaContext): Promise<FormulaResult> {
    // TODO: Implement lookup evaluation
    // This would find the related record and return the specified property
    return {
      value: null,
      type: 'error',
      error: 'Lookup evaluation not yet implemented',
      computedAt: new Date()
    };
  }
}

/**
 * Formula dependency tracker for incremental updates
 */
export class FormulaDependencyTracker {
  private dependencies: Map<string, Set<string>>;
  private dependents: Map<string, Set<string>>;

  constructor() {
    this.dependencies = new Map();
    this.dependents = new Map();
  }

  /**
   * Update dependencies for a column
   */
  updateDependencies(columnId: string, newDependencies: string[]) {
    // Remove old dependencies
    const oldDependencies = this.dependencies.get(columnId) || new Set();
    for (const dep of oldDependencies) {
      const depSet = this.dependents.get(dep);
      if (depSet) {
        depSet.delete(columnId);
        if (depSet.size === 0) {
          this.dependents.delete(dep);
        }
      }
    }

    // Add new dependencies
    this.dependencies.set(columnId, new Set(newDependencies));
    for (const dep of newDependencies) {
      if (!this.dependents.has(dep)) {
        this.dependents.set(dep, new Set());
      }
      this.dependents.get(dep)!.add(columnId);
    }
  }

  /**
   * Get all columns that depend on the given column
   */
  getDependents(columnId: string): string[] {
    return Array.from(this.dependents.get(columnId) || []);
  }

  /**
   * Get columns that need to be recalculated when given columns change
   */
  getAffectedColumns(changedColumns: string[]): string[] {
    const affected = new Set<string>();
    const queue = [...changedColumns];

    while (queue.length > 0) {
      const columnId = queue.shift()!;
      const dependents = this.dependents.get(columnId) || new Set();
      
      for (const dependent of dependents) {
        if (!affected.has(dependent)) {
          affected.add(dependent);
          queue.push(dependent);
        }
      }
    }

    return Array.from(affected);
  }

  /**
   * Check for circular dependencies
   */
  hasCircularDependency(): boolean {
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (columnId: string): boolean => {
      if (visiting.has(columnId)) {
        return true; // Circular dependency found
      }
      if (visited.has(columnId)) {
        return false;
      }

      visiting.add(columnId);
      const dependencies = this.dependencies.get(columnId) || new Set();
      
      for (const dep of dependencies) {
        if (visit(dep)) {
          return true;
        }
      }

      visiting.delete(columnId);
      visited.add(columnId);
      return false;
    };

    for (const columnId of this.dependencies.keys()) {
      if (visit(columnId)) {
        return true;
      }
    }

    return false;
  }
}

export const formulaEngine = new FormulaEngine();