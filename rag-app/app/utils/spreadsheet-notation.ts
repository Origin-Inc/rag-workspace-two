/**
 * Spreadsheet Notation Utilities
 *
 * Converts between different cell reference formats:
 * - A1 notation (Excel-style): A1, B2, AA10, Z100
 * - Column indices: 0, 1, 2, ...
 * - Column IDs: col_1, col_2, col_3, ...
 */

/**
 * Convert column index to A1 notation column letter(s)
 * @example columnIndexToA1(0) => 'A'
 * @example columnIndexToA1(25) => 'Z'
 * @example columnIndexToA1(26) => 'AA'
 * @example columnIndexToA1(701) => 'ZZ'
 */
export function columnIndexToA1(colIndex: number): string {
  let column = '';
  let index = colIndex;

  while (index >= 0) {
    column = String.fromCharCode(65 + (index % 26)) + column;
    index = Math.floor(index / 26) - 1;
  }

  return column;
}

/**
 * Convert A1 notation column letter(s) to column index
 * @example a1ToColumnIndex('A') => 0
 * @example a1ToColumnIndex('Z') => 25
 * @example a1ToColumnIndex('AA') => 26
 * @example a1ToColumnIndex('ZZ') => 701
 */
export function a1ToColumnIndex(colLetter: string): number {
  let index = 0;
  const normalized = colLetter.toUpperCase();

  for (let i = 0; i < normalized.length; i++) {
    index = index * 26 + (normalized.charCodeAt(i) - 64);
  }

  return index - 1;
}

/**
 * Convert row/column indices to A1 notation
 * @example indicesToA1(0, 0) => 'A1'
 * @example indicesToA1(9, 2) => 'C10'
 * @example indicesToA1(99, 26) => 'AA100'
 */
export function indicesToA1(rowIndex: number, colIndex: number): string {
  const colLetter = columnIndexToA1(colIndex);
  const rowNumber = rowIndex + 1; // A1 notation is 1-indexed
  return `${colLetter}${rowNumber}`;
}

/**
 * Parse A1 notation to row/column indices
 * @example parseA1('A1') => { row: 0, col: 0 }
 * @example parseA1('C10') => { row: 9, col: 2 }
 * @example parseA1('AA100') => { row: 99, col: 26 }
 */
export function parseA1(a1Ref: string): { row: number; col: number } | null {
  const match = a1Ref.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;

  const [, colLetter, rowNum] = match;
  const col = a1ToColumnIndex(colLetter);
  const row = parseInt(rowNum, 10) - 1; // Convert to 0-indexed

  return { row, col };
}

/**
 * Convert column ID (col_1, col_2) to A1 notation column letter
 * @example columnIdToA1('col_1') => 'A'
 * @example columnIdToA1('col_2') => 'B'
 * @example columnIdToA1('col_27') => 'AA'
 */
export function columnIdToA1(columnId: string): string {
  const match = columnId.match(/col_(\d+)/);
  if (!match) return columnId;

  const colNumber = parseInt(match[1], 10);
  const colIndex = colNumber - 1; // col_1 => index 0

  return columnIndexToA1(colIndex);
}

/**
 * Convert A1 column letter to column ID
 * @example a1ToColumnId('A') => 'col_1'
 * @example a1ToColumnId('B') => 'col_2'
 * @example a1ToColumnId('AA') => 'col_27'
 */
export function a1ToColumnId(colLetter: string): string {
  const colIndex = a1ToColumnIndex(colLetter);
  const colNumber = colIndex + 1; // index 0 => col_1
  return `col_${colNumber}`;
}

/**
 * Replace column IDs in a formula with A1 notation
 * This makes formulas more readable for users
 * @example formulaColumnIdsToA1('=SUM(col_1:col_3)', [...]) => '=SUM(A:C)'
 */
export function formulaColumnIdsToA1(
  formula: string,
  columnMapping: Map<string, number>
): string {
  let result = formula;

  // Replace column IDs with A1 notation
  for (const [columnId, colIndex] of columnMapping.entries()) {
    const colLetter = columnIndexToA1(colIndex);
    const regex = new RegExp(columnId, 'g');
    result = result.replace(regex, colLetter);
  }

  return result;
}

/**
 * Replace A1 notation in a formula with column indices for HyperFormula
 * @example formulaA1ToIndices('=A1+B1') => '=0,0+1,0' (conceptual)
 */
export function formulaA1ToIndices(formula: string): string {
  // HyperFormula supports A1 notation natively, so we may not need this
  // But keeping for potential custom formula parsing
  return formula;
}

/**
 * Validate if a string is valid A1 notation
 * @example isValidA1('A1') => true
 * @example isValidA1('AA100') => true
 * @example isValidA1('1A') => false
 * @example isValidA1('AAA') => false
 */
export function isValidA1(ref: string): boolean {
  return /^[A-Z]+\d+$/i.test(ref);
}

/**
 * Get A1 notation range
 * @example getA1Range(0, 0, 2, 9) => 'A1:C10'
 */
export function getA1Range(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number
): string {
  const start = indicesToA1(startRow, startCol);
  const end = indicesToA1(endRow, endCol);
  return `${start}:${end}`;
}

/**
 * Parse A1 range notation to indices
 * @example parseA1Range('A1:C10') => { start: {row: 0, col: 0}, end: {row: 9, col: 2} }
 */
export function parseA1Range(rangeRef: string): {
  start: { row: number; col: number };
  end: { row: number; col: number };
} | null {
  const [startRef, endRef] = rangeRef.split(':');
  if (!startRef || !endRef) return null;

  const start = parseA1(startRef);
  const end = parseA1(endRef);

  if (!start || !end) return null;

  return { start, end };
}

/**
 * Get column letter from column index for display
 * @example getColumnLetter(0) => 'A'
 * @example getColumnLetter(25) => 'Z'
 * @example getColumnLetter(26) => 'AA'
 */
export function getColumnLetter(colIndex: number): string {
  return columnIndexToA1(colIndex);
}

/**
 * Get all A1 references in a formula
 * @example extractA1References('=SUM(A1:A10)+B5') => ['A1:A10', 'B5']
 */
export function extractA1References(formula: string): string[] {
  const references: string[] = [];

  // Match single cell references (A1, B2, AA10)
  const singleCellPattern = /[A-Z]+\d+/gi;
  const singleMatches = formula.match(singleCellPattern) || [];
  references.push(...singleMatches);

  // Match range references (A1:B10)
  const rangePattern = /[A-Z]+\d+:[A-Z]+\d+/gi;
  const rangeMatches = formula.match(rangePattern) || [];
  references.push(...rangeMatches);

  return [...new Set(references)]; // Remove duplicates
}
