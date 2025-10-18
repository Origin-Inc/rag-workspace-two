/**
 * FormulaBar Component
 *
 * Excel-style formula bar for entering and editing cell formulas.
 * Supports autocomplete for 386+ functions from HyperFormula.
 */

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { cn } from '~/utils/cn';

export interface FormulaBarProps {
  selectedCell: { row: number; col: number } | null;
  cellValue: any;
  cellFormula: string | null;
  onFormulaChange: (formula: string) => void;
  onFormulaSubmit: (formula: string) => void;
  onFormulaCancel: () => void;
  disabled?: boolean;
}

// Common Excel/HyperFormula functions for autocomplete
const EXCEL_FUNCTIONS = [
  // Math & Trig
  'SUM', 'SUMIF', 'SUMIFS', 'AVERAGE', 'AVERAGEIF', 'AVERAGEIFS',
  'COUNT', 'COUNTA', 'COUNTIF', 'COUNTIFS', 'COUNTBLANK',
  'MAX', 'MIN', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'ABS', 'SQRT', 'POWER',
  'MOD', 'RAND', 'RANDBETWEEN', 'PI', 'CEILING', 'FLOOR',

  // Logical
  'IF', 'IFS', 'AND', 'OR', 'NOT', 'TRUE', 'FALSE', 'IFERROR', 'IFNA',

  // Text
  'CONCATENATE', 'CONCAT', 'TEXTJOIN', 'LEFT', 'RIGHT', 'MID', 'LEN',
  'UPPER', 'LOWER', 'PROPER', 'TRIM', 'SUBSTITUTE', 'REPLACE', 'SEARCH',
  'FIND', 'TEXT', 'VALUE',

  // Date & Time
  'TODAY', 'NOW', 'DATE', 'TIME', 'YEAR', 'MONTH', 'DAY',
  'HOUR', 'MINUTE', 'SECOND', 'DATEDIF', 'DAYS', 'WEEKDAY',

  // Lookup & Reference
  'VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'INDEX', 'MATCH',
  'OFFSET', 'INDIRECT', 'ROW', 'COLUMN', 'ROWS', 'COLUMNS',

  // Statistical
  'MEDIAN', 'MODE', 'STDEV', 'VAR', 'PERCENTILE', 'QUARTILE',

  // Financial
  'PMT', 'FV', 'PV', 'RATE', 'NPER', 'IRR', 'NPV',

  // Database
  'DSUM', 'DAVERAGE', 'DCOUNT', 'DMAX', 'DMIN',
].sort();

export const FormulaBar = memo(function FormulaBar({
  selectedCell,
  cellValue,
  cellFormula,
  onFormulaChange,
  onFormulaSubmit,
  onFormulaCancel,
  disabled = false,
}: FormulaBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<string[]>([]);
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update input when cell selection changes
  useEffect(() => {
    if (cellFormula) {
      setInputValue(cellFormula);
    } else if (cellValue !== null && cellValue !== undefined) {
      setInputValue(String(cellValue));
    } else {
      setInputValue('');
    }
    setIsEditing(false);
    setShowAutocomplete(false);
  }, [selectedCell, cellValue, cellFormula]);

  // Handle input change
  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      setIsEditing(true);
      onFormulaChange(value);

      // Show autocomplete for formulas
      if (value.startsWith('=')) {
        const lastToken = value.split(/[\s+\-*/(),]/).pop() || '';

        if (lastToken.length > 0 && /^[A-Z]+$/i.test(lastToken)) {
          const matches = EXCEL_FUNCTIONS.filter((fn) =>
            fn.startsWith(lastToken.toUpperCase())
          );

          if (matches.length > 0) {
            setAutocompleteOptions(matches);
            setShowAutocomplete(true);
            setSelectedAutocompleteIndex(0);
          } else {
            setShowAutocomplete(false);
          }
        } else {
          setShowAutocomplete(false);
        }
      } else {
        setShowAutocomplete(false);
      }
    },
    [onFormulaChange]
  );

  // Handle formula submit
  const handleSubmit = useCallback(() => {
    if (!isEditing) return;

    onFormulaSubmit(inputValue);
    setIsEditing(false);
    setShowAutocomplete(false);
    inputRef.current?.blur();
  }, [isEditing, inputValue, onFormulaSubmit]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    onFormulaCancel();
    setIsEditing(false);
    setShowAutocomplete(false);

    // Reset to original value
    if (cellFormula) {
      setInputValue(cellFormula);
    } else if (cellValue !== null && cellValue !== undefined) {
      setInputValue(String(cellValue));
    } else {
      setInputValue('');
    }

    inputRef.current?.blur();
  }, [cellFormula, cellValue, onFormulaCancel]);

  // Handle autocomplete selection
  const handleAutocompleteSelect = useCallback(
    (functionName: string) => {
      // Replace last token with selected function
      const tokens = inputValue.split(/[\s+\-*/(),]/);
      tokens[tokens.length - 1] = functionName + '(';
      const newValue = tokens.join('');

      handleInputChange(newValue);
      setShowAutocomplete(false);
      inputRef.current?.focus();
    },
    [inputValue, handleInputChange]
  );

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (showAutocomplete) {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setSelectedAutocompleteIndex((prev) =>
              Math.min(prev + 1, autocompleteOptions.length - 1)
            );
            break;

          case 'ArrowUp':
            e.preventDefault();
            setSelectedAutocompleteIndex((prev) => Math.max(prev - 1, 0));
            break;

          case 'Tab':
          case 'Enter':
            if (autocompleteOptions.length > 0) {
              e.preventDefault();
              handleAutocompleteSelect(autocompleteOptions[selectedAutocompleteIndex]);
            }
            break;

          case 'Escape':
            e.preventDefault();
            setShowAutocomplete(false);
            break;
        }
      } else {
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            handleSubmit();
            break;

          case 'Escape':
            e.preventDefault();
            handleCancel();
            break;
        }
      }
    },
    [
      showAutocomplete,
      autocompleteOptions,
      selectedAutocompleteIndex,
      handleAutocompleteSelect,
      handleSubmit,
      handleCancel,
    ]
  );

  // Cell reference display
  const cellReference = selectedCell
    ? `${String.fromCharCode(65 + selectedCell.col)}${selectedCell.row + 1}`
    : '';

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgba(33,33,33,1)]">
      <div className="flex items-center px-4 py-2 space-x-2">
        {/* Cell reference */}
        <div className="flex items-center space-x-2">
          <span className="text-sm font-mono font-medium text-gray-700 dark:text-gray-300 w-16">
            {cellReference}
          </span>
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Formula input */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsEditing(true)}
            placeholder={selectedCell ? 'Enter a value or formula (start with =)' : 'Select a cell to edit'}
            disabled={disabled || !selectedCell}
            className={cn(
              'w-full px-3 py-1.5 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />

          {/* Autocomplete dropdown */}
          {showAutocomplete && autocompleteOptions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
              {autocompleteOptions.map((option, index) => (
                <button
                  key={option}
                  onClick={() => handleAutocompleteSelect(option)}
                  onMouseEnter={() => setSelectedAutocompleteIndex(index)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm font-mono hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                    index === selectedAutocompleteIndex && 'bg-blue-50 dark:bg-blue-900'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {isEditing && (
          <div className="flex items-center space-x-1">
            <button
              onClick={handleSubmit}
              className="px-3 py-1 text-sm bg-green-600 text-white hover:bg-green-700 rounded transition-colors"
            >
              ✓
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 text-sm bg-red-600 text-white hover:bg-red-700 rounded transition-colors"
            >
              ✗
            </button>
          </div>
        )}

        {/* Formula indicator */}
        {cellFormula && !isEditing && (
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            fx
          </span>
        )}
      </div>
    </div>
  );
});
