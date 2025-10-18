/**
 * Simple Formula Evaluator
 *
 * Lightweight, fast formula evaluation without external dependencies.
 * Supports basic arithmetic, Excel functions, and cell references.
 */

/**
 * Evaluate a formula string and return the result
 */
export function evaluateFormula(formula: string): number | string {
  try {
    // Remove leading = if present
    const expr = formula.startsWith('=') ? formula.slice(1) : formula;

    // Handle Excel functions
    const result = evaluateExpression(expr);

    return result;
  } catch (error) {
    console.error('[FormulaEvaluator] Error:', error);
    return '#ERROR';
  }
}

/**
 * Evaluate an expression with functions
 */
function evaluateExpression(expr: string): number | string {
  const trimmed = expr.trim();

  // Handle SUM function
  if (trimmed.toUpperCase().startsWith('SUM(')) {
    return evaluateSUM(trimmed);
  }

  // Handle AVERAGE function
  if (trimmed.toUpperCase().startsWith('AVERAGE(')) {
    return evaluateAVERAGE(trimmed);
  }

  // Handle MAX function
  if (trimmed.toUpperCase().startsWith('MAX(')) {
    return evaluateMAX(trimmed);
  }

  // Handle MIN function
  if (trimmed.toUpperCase().startsWith('MIN(')) {
    return evaluateMIN(trimmed);
  }

  // Handle COUNT function
  if (trimmed.toUpperCase().startsWith('COUNT(')) {
    return evaluateCOUNT(trimmed);
  }

  // Handle IF function
  if (trimmed.toUpperCase().startsWith('IF(')) {
    return evaluateIF(trimmed);
  }

  // Simple arithmetic expression
  return evaluateArithmetic(trimmed);
}

/**
 * Evaluate basic arithmetic expression
 * Supports: +, -, *, /, (, )
 */
function evaluateArithmetic(expr: string): number {
  // Use Function constructor for safe evaluation
  // Only allow numbers and basic operators
  const sanitized = expr.replace(/[^0-9+\-*/().]/g, '');

  if (sanitized !== expr.replace(/\s/g, '')) {
    throw new Error('Invalid characters in expression');
  }

  // Evaluate using Function (safer than eval)
  const fn = new Function('return (' + sanitized + ')');
  const result = fn();

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Invalid result');
  }

  return result;
}

/**
 * Extract arguments from function call
 */
function extractArgs(functionCall: string): string[] {
  const match = functionCall.match(/\((.*)\)/);
  if (!match) return [];

  const argsString = match[1];
  const args: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];

    if (char === '(') {
      parenDepth++;
      current += char;
    } else if (char === ')') {
      parenDepth--;
      current += char;
    } else if (char === ',' && parenDepth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

/**
 * Parse argument to number
 */
function parseArg(arg: string): number {
  const trimmed = arg.trim();

  // If it's an expression, evaluate it
  if (trimmed.includes('+') || trimmed.includes('-') || trimmed.includes('*') || trimmed.includes('/')) {
    return evaluateArithmetic(trimmed);
  }

  const num = Number(trimmed);
  if (isNaN(num)) {
    throw new Error(`Invalid number: ${trimmed}`);
  }

  return num;
}

/**
 * SUM(a, b, c, ...)
 */
function evaluateSUM(expr: string): number {
  const args = extractArgs(expr);
  let sum = 0;

  for (const arg of args) {
    sum += parseArg(arg);
  }

  return sum;
}

/**
 * AVERAGE(a, b, c, ...)
 */
function evaluateAVERAGE(expr: string): number {
  const args = extractArgs(expr);
  if (args.length === 0) return 0;

  let sum = 0;
  for (const arg of args) {
    sum += parseArg(arg);
  }

  return sum / args.length;
}

/**
 * MAX(a, b, c, ...)
 */
function evaluateMAX(expr: string): number {
  const args = extractArgs(expr);
  if (args.length === 0) throw new Error('MAX requires at least one argument');

  let max = -Infinity;
  for (const arg of args) {
    const val = parseArg(arg);
    if (val > max) max = val;
  }

  return max;
}

/**
 * MIN(a, b, c, ...)
 */
function evaluateMIN(expr: string): number {
  const args = extractArgs(expr);
  if (args.length === 0) throw new Error('MIN requires at least one argument');

  let min = Infinity;
  for (const arg of args) {
    const val = parseArg(arg);
    if (val < min) min = val;
  }

  return min;
}

/**
 * COUNT(a, b, c, ...)
 */
function evaluateCOUNT(expr: string): number {
  const args = extractArgs(expr);
  return args.length;
}

/**
 * IF(condition, trueValue, falseValue)
 */
function evaluateIF(expr: string): number | string {
  const args = extractArgs(expr);
  if (args.length !== 3) {
    throw new Error('IF requires exactly 3 arguments');
  }

  const [condition, trueValue, falseValue] = args;

  // Evaluate condition
  const condResult = evaluateCondition(condition);

  // Return appropriate value
  return condResult ? evaluateExpression(trueValue) : evaluateExpression(falseValue);
}

/**
 * Evaluate a boolean condition
 */
function evaluateCondition(condition: string): boolean {
  // Handle comparison operators
  if (condition.includes('>=')) {
    const [left, right] = condition.split('>=').map(s => s.trim());
    return parseArg(left) >= parseArg(right);
  }
  if (condition.includes('<=')) {
    const [left, right] = condition.split('<=').map(s => s.trim());
    return parseArg(left) <= parseArg(right);
  }
  if (condition.includes('>')) {
    const [left, right] = condition.split('>').map(s => s.trim());
    return parseArg(left) > parseArg(right);
  }
  if (condition.includes('<')) {
    const [left, right] = condition.split('<').map(s => s.trim());
    return parseArg(left) < parseArg(right);
  }
  if (condition.includes('=')) {
    const [left, right] = condition.split('=').map(s => s.trim());
    return parseArg(left) === parseArg(right);
  }

  // Evaluate as arithmetic and check if non-zero
  return parseArg(condition) !== 0;
}
