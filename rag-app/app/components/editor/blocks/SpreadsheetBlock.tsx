/**
 * SpreadsheetBlock Component
 *
 * Block wrapper for the native spreadsheet editor.
 * Integrates SpreadsheetView into the block-based editor.
 */

import { memo, useCallback, useState, useEffect } from 'react';
import { SimplifiedSpreadsheetView } from '~/components/spreadsheet';
import type { SpreadsheetColumn } from '~/components/spreadsheet';
import type { Block } from '~/types/blocks';

export interface SpreadsheetBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing?: boolean; // Optional, not used internally
}

interface SpreadsheetBlockContent {
  tableName?: string;
  columns?: SpreadsheetColumn[];
  rows?: any[];
  title?: string;
}

export const SpreadsheetBlock = memo(function SpreadsheetBlock({
  block,
  onChange,
  isSelected,
}: SpreadsheetBlockProps) {
  console.log('[SpreadsheetBlock] Rendering', { blockId: block.id, isSelected });

  // Parse content
  const content: SpreadsheetBlockContent =
    typeof block.content === 'string'
      ? (block.content ? JSON.parse(block.content) : {})
      : (block.content || {});

  // Generate table name from block ID
  const tableName = content.tableName || `spreadsheet_${block.id.replace(/-/g, '_')}`;
  const initialColumns = content.columns || [];
  const initialRows = content.rows || [];
  const title = content.title || 'Spreadsheet';

  console.log('[SpreadsheetBlock] Parsed content', {
    title,
    columnsCount: initialColumns.length,
    rowsCount: initialRows.length
  });

  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);

  // Update content when data changes
  const handleDataChange = useCallback(
    (updates: Partial<SpreadsheetBlockContent>) => {
      const newContent = {
        ...content,
        ...updates,
      };

      onChange({
        content: JSON.stringify(newContent),
      });
    },
    [content, onChange]
  );

  // Handle title change
  const handleTitleChange = useCallback(() => {
    if (tempTitle !== title) {
      handleDataChange({ title: tempTitle });
    }
    setIsTitleEditing(false);
  }, [tempTitle, title, handleDataChange]);

  // Handle AI analysis (optional integration)
  const handleAnalyzeWithAI = useCallback(
    (context: any) => {
      // Could integrate with AI sidebar here
      console.log('AI analysis requested for spreadsheet:', context);
    },
    []
  );

  console.log('[SpreadsheetBlock] About to render JSX', {
    blockId: block.id,
    willRenderHeader: true,
    willRenderSpreadsheet: true,
    hasInitialColumns: initialColumns.length > 0
  });

  return (
    <div
      className="w-full h-full min-h-[400px] flex flex-col"
      data-testid="spreadsheet-block-root"
      style={{ border: '3px solid red', backgroundColor: '#ffcccc' }}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-yellow-300"
        data-testid="spreadsheet-block-header"
        style={{ backgroundColor: '#ffff00', minHeight: '50px' }}
      >
        {isTitleEditing ? (
          <input
            type="text"
            value={tempTitle}
            onChange={(e) => setTempTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleChange();
              if (e.key === 'Escape') {
                setTempTitle(title);
                setIsTitleEditing(false);
              }
            }}
            onBlur={handleTitleChange}
            className="text-lg font-semibold bg-transparent border-b-2 border-blue-500 outline-none"
            autoFocus
          />
        ) : (
          <h3
            className="text-lg font-semibold cursor-pointer hover:text-blue-600"
            onClick={() => setIsTitleEditing(true)}
            title="Click to edit title"
          >
            {title}
          </h3>
        )}
        <span className="text-xs text-gray-500">
          Spreadsheet Block
        </span>
      </div>

      {/* Spreadsheet */}
      <div
        className="flex-1"
        data-testid="spreadsheet-container"
        style={{ border: '3px solid blue', backgroundColor: '#ccccff', minHeight: '300px' }}
      >
        <SimplifiedSpreadsheetView
          initialColumns={initialColumns}
          initialRows={initialRows}
          onDataChange={(data) => {
            handleDataChange({
              columns: data.columns,
              rows: data.rows,
            });
          }}
          height={block.position?.height ? block.position.height * 100 : 600}
        />
      </div>
    </div>
  );
});
