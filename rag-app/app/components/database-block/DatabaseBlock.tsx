import { memo } from 'react';
import { DatabaseToolbar } from './DatabaseToolbar';
import { DatabaseTable } from './DatabaseTable';
import { DragAndDropProvider } from './DragAndDropProvider';
import { useDatabaseBlock } from '~/hooks/useDatabaseBlock';
import { cn } from '~/utils/cn';

interface DatabaseBlockProps {
  blockId: string;
  className?: string;
}

export const DatabaseBlock = memo(function DatabaseBlock({
  blockId,
  className
}: DatabaseBlockProps) {
  // Database state management
  const {
    databaseBlock,
    columns,
    rows,
    filters,
    sorts,
    selectedRows,
    isLoading,
    error,
    addRow,
    updateRow,
    deleteRows,
    addColumn,
    updateColumn,
    deleteColumn,
    applyFilters,
    applySorts,
    selectRow,
    selectAllRows,
    clearSelection
  } = useDatabaseBlock(blockId);

  // Simplified: only table view for spreadsheet editor

  const handleDeleteSelected = () => {
    if (selectedRows.size > 0) {
      deleteRows(Array.from(selectedRows));
      clearSelection();
    }
  };

  if (error) {
    return (
      <div className={cn("p-8 text-center", className)}>
        <div className="text-red-600 font-medium">Error loading database</div>
        <div className="text-gray-500 text-sm mt-2">{error.message}</div>
      </div>
    );
  }

  return (
    <DragAndDropProvider>
      <div className={cn("flex flex-col h-full bg-white dark:bg-[rgba(33,33,33,1)] rounded-lg shadow-sm", className)}>
        {/* Toolbar - simplified for spreadsheet view */}
        <DatabaseToolbar
          databaseBlock={databaseBlock}
          columns={columns}
          filters={filters}
          sorts={sorts}
          selectedRows={selectedRows}
          onAddRow={addRow}
          onAddColumn={addColumn}
          onApplyFilters={applyFilters}
          onApplySorts={applySorts}
          onDeleteSelected={handleDeleteSelected}
        />

        {/* Spreadsheet view (table only) */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                <div className="mt-4 text-sm">Loading spreadsheet...</div>
              </div>
            </div>
          ) : (
            <DatabaseTable
              databaseBlock={databaseBlock}
              columns={columns}
              rows={rows}
              selectedRows={selectedRows}
              onUpdateRow={updateRow}
              onDeleteRows={deleteRows}
              onUpdateColumn={updateColumn}
              onDeleteColumn={deleteColumn}
              onSelectRow={selectRow}
              onSelectAllRows={selectAllRows}
              onClearSelection={clearSelection}
            />
          )}
        </div>
      </div>
    </DragAndDropProvider>
  );
});