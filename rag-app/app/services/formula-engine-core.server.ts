// Formula Engine for Database Blocks (Task 20.12)
// Implements secure formula evaluation with dependency tracking and 40+ built-in functions

import { Parser } from 'expr-eval';
import type { DatabaseColumnCore, DatabaseRowCore } from '~/types/database-block-core';

// ============= Types =============

export interface FormulaContext {
  row: Record<string, any>;
  rows: DatabaseRowCore[];
  columns: DatabaseColumnCore[];
  currentColumnId: string;
}

export interface FormulaFunction {
  name: string;
  category: 'math' | 'text' | 'date' | 'logical' | 'aggregate' | 'lookup';
  description: string;
  signature: string;
  examples: string[];
  implementation: (...args: any[]) => any;
}

export interface FormulaDependency {
  columnId: string;
  rowId?: string; // For specific row references
  type: 'column' | 'row' | 'aggregate';
}

export interface FormulaParseResult {
  isValid: boolean;
  error?: string;
  dependencies: FormulaDependency[];
  usedFunctions: string[];
}

export interface EvaluationResult {
  value: any;
  error?: string;
  executionTime: number;
}

// ============= Built-in Functions Registry =============

const formulaFunctions = new Map<string, FormulaFunction>();

// Math Functions (10 functions)
formulaFunctions.set('SUM', {
  name: 'SUM',
  category: 'math',
  description: 'Adds all numbers in a range',
  signature: 'SUM(value1, value2, ...)',
  examples: ['SUM(1, 2, 3)', 'SUM({Price}, {Tax})'],
  implementation: (...args: any[]) => {
    return args.flat().reduce((sum: number, val: any) => {
      const num = parseFloat(val);
      return isNaN(num) ? sum : sum + num;
    }, 0);
  }
});

formulaFunctions.set('AVG', {
  name: 'AVG',
  category: 'math',
  description: 'Calculates average of numbers',
  signature: 'AVG(value1, value2, ...)',
  examples: ['AVG(1, 2, 3)', 'AVG({Score})'],
  implementation: (...args: any[]) => {
    const nums = args.flat().map(v => parseFloat(v)).filter(n => !isNaN(n));
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  }
});

formulaFunctions.set('MIN', {
  name: 'MIN',
  category: 'math',
  description: 'Returns smallest value',
  signature: 'MIN(value1, value2, ...)',
  examples: ['MIN(1, 2, 3)', 'MIN({Price})'],
  implementation: (...args: any[]) => {
    const nums = args.flat().map(v => parseFloat(v)).filter(n => !isNaN(n));
    return nums.length > 0 ? Math.min(...nums) : 0;
  }
});

formulaFunctions.set('MAX', {
  name: 'MAX',
  category: 'math',
  description: 'Returns largest value',
  signature: 'MAX(value1, value2, ...)',
  examples: ['MAX(1, 2, 3)', 'MAX({Price})'],
  implementation: (...args: any[]) => {
    const nums = args.flat().map(v => parseFloat(v)).filter(n => !isNaN(n));
    return nums.length > 0 ? Math.max(...nums) : 0;
  }
});

formulaFunctions.set('ROUND', {
  name: 'ROUND',
  category: 'math',
  description: 'Rounds a number to specified decimals',
  signature: 'ROUND(number, decimals)',
  examples: ['ROUND(3.14159, 2)', 'ROUND({Price}, 0)'],
  implementation: (num: any, decimals: any = 0) => {
    const n = parseFloat(num);
    const d = parseInt(decimals);
    return isNaN(n) ? 0 : Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
  }
});

formulaFunctions.set('ABS', {
  name: 'ABS',
  category: 'math',
  description: 'Returns absolute value',
  signature: 'ABS(number)',
  examples: ['ABS(-5)', 'ABS({Balance})'],
  implementation: (num: any) => {
    const n = parseFloat(num);
    return isNaN(n) ? 0 : Math.abs(n);
  }
});

formulaFunctions.set('POWER', {
  name: 'POWER',
  category: 'math',
  description: 'Raises number to a power',
  signature: 'POWER(base, exponent)',
  examples: ['POWER(2, 3)', 'POWER({Base}, 2)'],
  implementation: (base: any, exp: any) => {
    const b = parseFloat(base);
    const e = parseFloat(exp);
    return isNaN(b) || isNaN(e) ? 0 : Math.pow(b, e);
  }
});

formulaFunctions.set('SQRT', {
  name: 'SQRT',
  category: 'math',
  description: 'Returns square root',
  signature: 'SQRT(number)',
  examples: ['SQRT(16)', 'SQRT({Area})'],
  implementation: (num: any) => {
    const n = parseFloat(num);
    return isNaN(n) || n < 0 ? 0 : Math.sqrt(n);
  }
});

formulaFunctions.set('MOD', {
  name: 'MOD',
  category: 'math',
  description: 'Returns remainder of division',
  signature: 'MOD(dividend, divisor)',
  examples: ['MOD(10, 3)', 'MOD({Total}, {GroupSize})'],
  implementation: (dividend: any, divisor: any) => {
    const a = parseFloat(dividend);
    const b = parseFloat(divisor);
    return isNaN(a) || isNaN(b) || b === 0 ? 0 : a % b;
  }
});

formulaFunctions.set('CEIL', {
  name: 'CEIL',
  category: 'math',
  description: 'Rounds up to nearest integer',
  signature: 'CEIL(number)',
  examples: ['CEIL(3.14)', 'CEIL({Price})'],
  implementation: (num: any) => {
    const n = parseFloat(num);
    return isNaN(n) ? 0 : Math.ceil(n);
  }
});

// Text Functions (10 functions)
formulaFunctions.set('CONCAT', {
  name: 'CONCAT',
  category: 'text',
  description: 'Joins text strings',
  signature: 'CONCAT(text1, text2, ...)',
  examples: ['CONCAT("Hello", " ", "World")', 'CONCAT({FirstName}, " ", {LastName})'],
  implementation: (...args: any[]) => {
    return args.map(a => String(a || '')).join('');
  }
});

formulaFunctions.set('UPPER', {
  name: 'UPPER',
  category: 'text',
  description: 'Converts text to uppercase',
  signature: 'UPPER(text)',
  examples: ['UPPER("hello")', 'UPPER({Name})'],
  implementation: (text: any) => String(text || '').toUpperCase()
});

formulaFunctions.set('LOWER', {
  name: 'LOWER',
  category: 'text',
  description: 'Converts text to lowercase',
  signature: 'LOWER(text)',
  examples: ['LOWER("HELLO")', 'LOWER({Name})'],
  implementation: (text: any) => String(text || '').toLowerCase()
});

formulaFunctions.set('TRIM', {
  name: 'TRIM',
  category: 'text',
  description: 'Removes leading/trailing spaces',
  signature: 'TRIM(text)',
  examples: ['TRIM("  hello  ")', 'TRIM({Input})'],
  implementation: (text: any) => String(text || '').trim()
});

formulaFunctions.set('LENGTH', {
  name: 'LENGTH',
  category: 'text',
  description: 'Returns text length',
  signature: 'LENGTH(text)',
  examples: ['LENGTH("hello")', 'LENGTH({Description})'],
  implementation: (text: any) => String(text || '').length
});

formulaFunctions.set('LEFT', {
  name: 'LEFT',
  category: 'text',
  description: 'Returns leftmost characters',
  signature: 'LEFT(text, count)',
  examples: ['LEFT("hello", 2)', 'LEFT({Code}, 3)'],
  implementation: (text: any, count: any) => {
    const str = String(text || '');
    const n = parseInt(count) || 0;
    return str.substring(0, n);
  }
});

formulaFunctions.set('RIGHT', {
  name: 'RIGHT',
  category: 'text',
  description: 'Returns rightmost characters',
  signature: 'RIGHT(text, count)',
  examples: ['RIGHT("hello", 2)', 'RIGHT({Code}, 3)'],
  implementation: (text: any, count: any) => {
    const str = String(text || '');
    const n = parseInt(count) || 0;
    return str.substring(str.length - n);
  }
});

formulaFunctions.set('MID', {
  name: 'MID',
  category: 'text',
  description: 'Returns substring',
  signature: 'MID(text, start, length)',
  examples: ['MID("hello", 2, 3)', 'MID({Code}, 3, 2)'],
  implementation: (text: any, start: any, length: any) => {
    const str = String(text || '');
    const s = parseInt(start) - 1 || 0;
    const l = parseInt(length) || 0;
    return str.substring(s, s + l);
  }
});

formulaFunctions.set('REPLACE', {
  name: 'REPLACE',
  category: 'text',
  description: 'Replaces text',
  signature: 'REPLACE(text, search, replacement)',
  examples: ['REPLACE("hello", "l", "r")', 'REPLACE({Text}, "old", "new")'],
  implementation: (text: any, search: any, replacement: any) => {
    const str = String(text || '');
    const s = String(search || '');
    const r = String(replacement || '');
    return str.split(s).join(r);
  }
});

formulaFunctions.set('FIND', {
  name: 'FIND',
  category: 'text',
  description: 'Finds position of text',
  signature: 'FIND(search, text)',
  examples: ['FIND("l", "hello")', 'FIND("@", {Email})'],
  implementation: (search: any, text: any) => {
    const str = String(text || '');
    const s = String(search || '');
    const pos = str.indexOf(s);
    return pos >= 0 ? pos + 1 : 0;
  }
});

// Date Functions (8 functions)
formulaFunctions.set('NOW', {
  name: 'NOW',
  category: 'date',
  description: 'Returns current date and time',
  signature: 'NOW()',
  examples: ['NOW()'],
  implementation: () => new Date().toISOString()
});

formulaFunctions.set('TODAY', {
  name: 'TODAY',
  category: 'date',
  description: 'Returns current date',
  signature: 'TODAY()',
  examples: ['TODAY()'],
  implementation: () => new Date().toISOString().split('T')[0]
});

formulaFunctions.set('YEAR', {
  name: 'YEAR',
  category: 'date',
  description: 'Extracts year from date',
  signature: 'YEAR(date)',
  examples: ['YEAR("2024-01-15")', 'YEAR({DueDate})'],
  implementation: (date: any) => {
    const d = new Date(date);
    return isNaN(d.getTime()) ? 0 : d.getFullYear();
  }
});

formulaFunctions.set('MONTH', {
  name: 'MONTH',
  category: 'date',
  description: 'Extracts month from date',
  signature: 'MONTH(date)',
  examples: ['MONTH("2024-01-15")', 'MONTH({DueDate})'],
  implementation: (date: any) => {
    const d = new Date(date);
    return isNaN(d.getTime()) ? 0 : d.getMonth() + 1;
  }
});

formulaFunctions.set('DAY', {
  name: 'DAY',
  category: 'date',
  description: 'Extracts day from date',
  signature: 'DAY(date)',
  examples: ['DAY("2024-01-15")', 'DAY({DueDate})'],
  implementation: (date: any) => {
    const d = new Date(date);
    return isNaN(d.getTime()) ? 0 : d.getDate();
  }
});

formulaFunctions.set('DATEDIFF', {
  name: 'DATEDIFF',
  category: 'date',
  description: 'Days between two dates',
  signature: 'DATEDIFF(date1, date2)',
  examples: ['DATEDIFF("2024-01-01", "2024-01-15")', 'DATEDIFF({StartDate}, {EndDate})'],
  implementation: (date1: any, date2: any) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  }
});

formulaFunctions.set('DATEADD', {
  name: 'DATEADD',
  category: 'date',
  description: 'Adds days to date',
  signature: 'DATEADD(date, days)',
  examples: ['DATEADD("2024-01-01", 30)', 'DATEADD({StartDate}, 7)'],
  implementation: (date: any, days: any) => {
    const d = new Date(date);
    const n = parseInt(days) || 0;
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }
});

formulaFunctions.set('WEEKDAY', {
  name: 'WEEKDAY',
  category: 'date',
  description: 'Day of week (1=Sunday, 7=Saturday)',
  signature: 'WEEKDAY(date)',
  examples: ['WEEKDAY("2024-01-15")', 'WEEKDAY({Date})'],
  implementation: (date: any) => {
    const d = new Date(date);
    return isNaN(d.getTime()) ? 0 : d.getDay() + 1;
  }
});

// Logical Functions (8 functions)
formulaFunctions.set('IF', {
  name: 'IF',
  category: 'logical',
  description: 'Conditional logic',
  signature: 'IF(condition, true_value, false_value)',
  examples: ['IF({Score} > 80, "Pass", "Fail")', 'IF({Status} == "Done", 100, 0)'],
  implementation: (condition: any, trueValue: any, falseValue: any) => {
    return condition ? trueValue : falseValue;
  }
});

formulaFunctions.set('AND', {
  name: 'AND',
  category: 'logical',
  description: 'Logical AND',
  signature: 'AND(condition1, condition2, ...)',
  examples: ['AND({Score} > 70, {Attendance} > 80)', 'AND(true, true, false)'],
  implementation: (...args: any[]) => {
    return args.every(arg => Boolean(arg));
  }
});

formulaFunctions.set('OR', {
  name: 'OR',
  category: 'logical',
  description: 'Logical OR',
  signature: 'OR(condition1, condition2, ...)',
  examples: ['OR({Status} == "Done", {Status} == "Archived")', 'OR(false, true)'],
  implementation: (...args: any[]) => {
    return args.some(arg => Boolean(arg));
  }
});

formulaFunctions.set('NOT', {
  name: 'NOT',
  category: 'logical',
  description: 'Logical NOT',
  signature: 'NOT(condition)',
  examples: ['NOT({IsComplete})', 'NOT(true)'],
  implementation: (condition: any) => !Boolean(condition)
});

formulaFunctions.set('ISBLANK', {
  name: 'ISBLANK',
  category: 'logical',
  description: 'Checks if value is blank',
  signature: 'ISBLANK(value)',
  examples: ['ISBLANK({Description})', 'IF(ISBLANK({Email}), "No email", {Email})'],
  implementation: (value: any) => {
    return value === null || value === undefined || value === '';
  }
});

formulaFunctions.set('ISNOTBLANK', {
  name: 'ISNOTBLANK',
  category: 'logical',
  description: 'Checks if value is not blank',
  signature: 'ISNOTBLANK(value)',
  examples: ['ISNOTBLANK({Name})', 'IF(ISNOTBLANK({Phone}), "Has phone", "No phone")'],
  implementation: (value: any) => {
    return value !== null && value !== undefined && value !== '';
  }
});

formulaFunctions.set('ISNUMBER', {
  name: 'ISNUMBER',
  category: 'logical',
  description: 'Checks if value is a number',
  signature: 'ISNUMBER(value)',
  examples: ['ISNUMBER({Price})', 'IF(ISNUMBER({Input}), {Input} * 2, 0)'],
  implementation: (value: any) => {
    return !isNaN(parseFloat(value)) && isFinite(value);
  }
});

formulaFunctions.set('ISERROR', {
  name: 'ISERROR',
  category: 'logical',
  description: 'Checks if value is an error',
  signature: 'ISERROR(value)',
  examples: ['ISERROR(1/0)', 'IF(ISERROR({Calculation}), 0, {Calculation})'],
  implementation: (value: any) => {
    return value instanceof Error || value === Infinity || value === -Infinity || (typeof value === 'number' && isNaN(value));
  }
});

// Aggregate Functions (6 functions)
formulaFunctions.set('COUNT', {
  name: 'COUNT',
  category: 'aggregate',
  description: 'Counts non-blank values',
  signature: 'COUNT(value1, value2, ...)',
  examples: ['COUNT({Tasks})', 'COUNT(1, 2, "", 3)'],
  implementation: (...args: any[]) => {
    return args.flat().filter(v => v !== null && v !== undefined && v !== '').length;
  }
});

formulaFunctions.set('COUNTA', {
  name: 'COUNTA',
  category: 'aggregate',
  description: 'Counts all values',
  signature: 'COUNTA(value1, value2, ...)',
  examples: ['COUNTA({AllFields})', 'COUNTA(1, 2, "", 3)'],
  implementation: (...args: any[]) => args.flat().length
});

formulaFunctions.set('COUNTIF', {
  name: 'COUNTIF',
  category: 'aggregate',
  description: 'Counts values meeting condition',
  signature: 'COUNTIF(range, condition)',
  examples: ['COUNTIF({Status}, "Done")', 'COUNTIF({Scores}, "> 80")'],
  implementation: (range: any[], condition: any) => {
    if (!Array.isArray(range)) range = [range];
    
    // Parse condition
    const condStr = String(condition);
    const match = condStr.match(/^([><=!]+)(.*)$/);
    
    if (match) {
      const op = match[1];
      const val = parseFloat(match[2]);
      
      return range.filter(v => {
        const num = parseFloat(v);
        if (isNaN(num)) return false;
        
        switch (op) {
          case '>': return num > val;
          case '>=': return num >= val;
          case '<': return num < val;
          case '<=': return num <= val;
          case '!=': return num !== val;
          default: return num === val;
        }
      }).length;
    } else {
      // Simple equality check
      return range.filter(v => v === condition).length;
    }
  }
});

formulaFunctions.set('SUMIF', {
  name: 'SUMIF',
  category: 'aggregate',
  description: 'Sums values meeting condition',
  signature: 'SUMIF(range, condition, sum_range)',
  examples: ['SUMIF({Status}, "Done", {Points})', 'SUMIF({Scores}, "> 80", {Scores})'],
  implementation: (range: any[], condition: any, sumRange?: any[]) => {
    if (!Array.isArray(range)) range = [range];
    if (!sumRange) sumRange = range;
    if (!Array.isArray(sumRange)) sumRange = [sumRange];
    
    let sum = 0;
    const condStr = String(condition);
    const match = condStr.match(/^([><=!]+)(.*)$/);
    
    for (let i = 0; i < range.length && i < sumRange.length; i++) {
      let matches = false;
      
      if (match) {
        const op = match[1];
        const val = parseFloat(match[2]);
        const num = parseFloat(range[i]);
        
        if (!isNaN(num)) {
          switch (op) {
            case '>': matches = num > val; break;
            case '>=': matches = num >= val; break;
            case '<': matches = num < val; break;
            case '<=': matches = num <= val; break;
            case '!=': matches = num !== val; break;
            default: matches = num === val;
          }
        }
      } else {
        matches = range[i] === condition;
      }
      
      if (matches) {
        const sumVal = parseFloat(sumRange[i]);
        if (!isNaN(sumVal)) sum += sumVal;
      }
    }
    
    return sum;
  }
});

formulaFunctions.set('UNIQUE', {
  name: 'UNIQUE',
  category: 'aggregate',
  description: 'Returns unique values',
  signature: 'UNIQUE(value1, value2, ...)',
  examples: ['UNIQUE(1, 2, 2, 3)', 'UNIQUE({Tags})'],
  implementation: (...args: any[]) => {
    const flat = args.flat();
    return Array.from(new Set(flat));
  }
});

formulaFunctions.set('JOIN', {
  name: 'JOIN',
  category: 'aggregate',
  description: 'Joins array values with separator',
  signature: 'JOIN(array, separator)',
  examples: ['JOIN({Tags}, ", ")', 'JOIN(["a", "b", "c"], "-")'],
  implementation: (array: any, separator: any = ',') => {
    if (!Array.isArray(array)) return String(array || '');
    return array.join(String(separator));
  }
});

// Lookup Functions (2 functions)
formulaFunctions.set('LOOKUP', {
  name: 'LOOKUP',
  category: 'lookup',
  description: 'Looks up value in another column',
  signature: 'LOOKUP(search_value, search_column, return_column)',
  examples: ['LOOKUP({ProductID}, {Products.ID}, {Products.Price})'],
  implementation: (searchValue: any, searchColumn: any[], returnColumn: any[]) => {
    if (!Array.isArray(searchColumn)) return null;
    if (!Array.isArray(returnColumn)) return null;
    
    const index = searchColumn.findIndex(v => v === searchValue);
    return index >= 0 && index < returnColumn.length ? returnColumn[index] : null;
  }
});

formulaFunctions.set('VLOOKUP', {
  name: 'VLOOKUP',
  category: 'lookup',
  description: 'Vertical lookup in table',
  signature: 'VLOOKUP(search_value, table, column_index)',
  examples: ['VLOOKUP({CustomerID}, {Customers}, 2)'],
  implementation: (searchValue: any, table: any[][], columnIndex: number) => {
    if (!Array.isArray(table) || table.length === 0) return null;
    
    const row = table.find(r => r[0] === searchValue);
    return row && columnIndex > 0 && columnIndex <= row.length ? row[columnIndex - 1] : null;
  }
});

// ============= Formula Engine Class =============

export class FormulaEngine {
  private parser: Parser;
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private cache: Map<string, any> = new Map();
  private maxCacheSize = 10000;
  private cacheHits = 0;
  private cacheMisses = 0;
  
  constructor() {
    // Initialize secure parser
    this.parser = new Parser();
    
    // Register all custom functions
    for (const [name, func] of formulaFunctions) {
      this.parser.functions[name] = func.implementation;
    }
    
    // Add column reference support
    this.parser.functions['COLUMN'] = (columnId: string, context: FormulaContext) => {
      return context.row[columnId];
    };
  }
  
  /**
   * Parse a formula and extract dependencies
   */
  parseFormula(formula: string): FormulaParseResult {
    try {
      const dependencies: FormulaDependency[] = [];
      const usedFunctions: string[] = [];
      
      // Extract column references from curly braces
      const columnRefs = formula.match(/\{([^}]+)\}/g);
      if (columnRefs) {
        for (const ref of columnRefs) {
          const columnId = ref.slice(1, -1); // Remove { and }
          dependencies.push({
            columnId,
            type: 'column'
          });
        }
      }
      
      // Extract function names
      const funcPattern = /([A-Z_]+)\s*\(/g;
      let match;
      while ((match = funcPattern.exec(formula)) !== null) {
        const funcName = match[1];
        if (formulaFunctions.has(funcName)) {
          usedFunctions.push(funcName);
        }
      }
      
      // Validate formula syntax by parsing
      const normalizedFormula = formula.replace(/\{([^}]+)\}/g, '0');
      this.parser.parse(normalizedFormula);
      
      return {
        isValid: true,
        dependencies: Array.from(new Set(dependencies.map(d => JSON.stringify(d)))).map(d => JSON.parse(d)),
        usedFunctions: Array.from(new Set(usedFunctions))
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Invalid formula',
        dependencies: [],
        usedFunctions: []
      };
    }
  }
  
  /**
   * Evaluate a formula with context
   */
  evaluate(formula: string, context: FormulaContext): EvaluationResult {
    const start = Date.now();
    
    try {
      // Check cache
      const cacheKey = `${formula}-${JSON.stringify(context.row)}`;
      if (this.cache.has(cacheKey)) {
        this.cacheHits++;
        return {
          value: this.cache.get(cacheKey),
          executionTime: Date.now() - start
        };
      }
      
      this.cacheMisses++;
      
      // Normalize formula
      const normalizedFormula = formula.replace(/\{([^}]+)\}/g, (match, columnId) => {
        const value = context.row[columnId];
        
        // Handle different types appropriately
        if (value === null || value === undefined) {
          return 'null';
        } else if (typeof value === 'string') {
          return `"${value.replace(/"/g, '\\"')}"`;
        } else if (typeof value === 'boolean') {
          return value ? 'true' : 'false';
        } else if (Array.isArray(value)) {
          return `[${value.map(v => typeof v === 'string' ? `"${v}"` : v).join(',')}]`;
        } else {
          return String(value);
        }
      });
      
      // Parse and evaluate
      const expr = this.parser.parse(normalizedFormula);
      const value = expr.evaluate();
      
      // Cache result (with size limit)
      if (this.cache.size >= this.maxCacheSize) {
        // Remove oldest entries
        const toRemove = Math.floor(this.maxCacheSize * 0.2);
        const keys = Array.from(this.cache.keys()).slice(0, toRemove);
        keys.forEach(k => this.cache.delete(k));
      }
      this.cache.set(cacheKey, value);
      
      return {
        value,
        executionTime: Date.now() - start
      };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : 'Evaluation error',
        executionTime: Date.now() - start
      };
    }
  }
  
  /**
   * Build dependency graph for a set of formula columns
   */
  buildDependencyGraph(columns: DatabaseColumnCore[]): void {
    this.dependencyGraph.clear();
    
    for (const column of columns) {
      if (column.type === 'formula' && column.formula) {
        const parseResult = this.parseFormula(column.formula);
        
        if (parseResult.isValid) {
          const deps = new Set(parseResult.dependencies.map(d => d.columnId));
          this.dependencyGraph.set(column.id, deps);
        }
      }
    }
  }
  
  /**
   * Get evaluation order respecting dependencies
   */
  getEvaluationOrder(columns: DatabaseColumnCore[]): string[] {
    this.buildDependencyGraph(columns);
    
    const visited = new Set<string>();
    const order: string[] = [];
    
    const visit = (columnId: string) => {
      if (visited.has(columnId)) return;
      visited.add(columnId);
      
      const deps = this.dependencyGraph.get(columnId);
      if (deps) {
        for (const dep of deps) {
          visit(dep);
        }
      }
      
      order.push(columnId);
    };
    
    for (const column of columns) {
      if (column.type === 'formula') {
        visit(column.id);
      }
    }
    
    return order;
  }
  
  /**
   * Detect circular references
   */
  detectCircularReferences(columns: DatabaseColumnCore[]): string[] {
    this.buildDependencyGraph(columns);
    
    const circular: string[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const detectCycle = (columnId: string): boolean => {
      visited.add(columnId);
      recursionStack.add(columnId);
      
      const deps = this.dependencyGraph.get(columnId);
      if (deps) {
        for (const dep of deps) {
          if (!visited.has(dep)) {
            if (detectCycle(dep)) {
              return true;
            }
          } else if (recursionStack.has(dep)) {
            circular.push(`${columnId} -> ${dep}`);
            return true;
          }
        }
      }
      
      recursionStack.delete(columnId);
      return false;
    };
    
    for (const column of columns) {
      if (column.type === 'formula' && !visited.has(column.id)) {
        detectCycle(column.id);
      }
    }
    
    return circular;
  }
  
  /**
   * Clear cache for specific columns or all
   */
  clearCache(columnIds?: string[]): void {
    if (columnIds) {
      for (const key of this.cache.keys()) {
        if (columnIds.some(id => key.includes(id))) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.cache.size,
      hitRate: total > 0 ? this.cacheHits / total : 0
    };
  }
  
  /**
   * Get all available functions
   */
  getAvailableFunctions(): FormulaFunction[] {
    return Array.from(formulaFunctions.values());
  }
  
  /**
   * Get functions by category
   */
  getFunctionsByCategory(category: FormulaFunction['category']): FormulaFunction[] {
    return Array.from(formulaFunctions.values()).filter(f => f.category === category);
  }
  
  /**
   * Get function count by category
   */
  getFunctionCount(): Record<string, number> {
    const count: Record<string, number> = {};
    for (const func of formulaFunctions.values()) {
      count[func.category] = (count[func.category] || 0) + 1;
    }
    return count;
  }
  
  /**
   * Validate formula syntax
   */
  validateFormula(formula: string): { valid: boolean; error?: string } {
    try {
      // Check for invalid function names
      const funcPattern = /([A-Z_]+)\s*\(/g;
      let match;
      while ((match = funcPattern.exec(formula)) !== null) {
        const funcName = match[1];
        // Check if it's a valid function or a known parser function
        const validParserFuncs = ['E', 'PI', 'LOG', 'LOG10', 'LN', 'EXP', 'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN'];
        if (!formulaFunctions.has(funcName) && !validParserFuncs.includes(funcName)) {
          return {
            valid: false,
            error: `Unknown function: ${funcName}`
          };
        }
      }
      
      const normalizedFormula = formula.replace(/\{([^}]+)\}/g, '0'); // Replace refs with 0 for validation
      this.parser.parse(normalizedFormula);
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Invalid formula syntax'
      };
    }
  }
  
  /**
   * Incremental evaluation for changed columns
   */
  evaluateIncremental(
    changedColumns: string[],
    rows: DatabaseRowCore[],
    columns: DatabaseColumnCore[]
  ): Map<string, Map<string, any>> {
    const results = new Map<string, Map<string, any>>();
    
    // Build dependency graph if not built
    if (this.dependencyGraph.size === 0) {
      this.buildDependencyGraph(columns);
    }
    
    // Find all affected formula columns (including transitive dependencies)
    const affectedColumns = new Set<string>();
    
    const findAffected = (columnId: string) => {
      for (const [formulaId, deps] of this.dependencyGraph) {
        if (deps.has(columnId) && !affectedColumns.has(formulaId)) {
          affectedColumns.add(formulaId);
          findAffected(formulaId); // Recursively find transitive dependencies
        }
      }
    };
    
    // Start with directly changed columns
    for (const changedCol of changedColumns) {
      findAffected(changedCol);
    }
    
    // Clear cache for affected columns
    this.clearCache(Array.from(affectedColumns));
    
    // Re-evaluate affected formulas in dependency order
    const evalOrder = this.getEvaluationOrder(columns);
    const orderedAffected = evalOrder.filter(id => affectedColumns.has(id));
    
    for (const row of rows) {
      const rowResults = new Map<string, any>();
      
      for (const columnId of orderedAffected) {
        const column = columns.find(c => c.id === columnId);
        if (column?.formula) {
          const result = this.evaluate(column.formula, {
            row: row.data,
            rows,
            columns,
            currentColumnId: columnId
          });
          
          if (!result.error) {
            rowResults.set(columnId, result.value);
            // Update row data for subsequent formula evaluations
            row.data[columnId] = result.value;
          }
        }
      }
      
      if (rowResults.size > 0) {
        results.set(row.id, rowResults);
      }
    }
    
    return results;
  }
}

export const formulaEngine = new FormulaEngine();