import { memo, Suspense, lazy } from 'react';
import { DatabaseToolbar } from './DatabaseToolbar';
import { DatabaseTable } from './DatabaseTable';
import { DragAndDropProvider } from './DragAndDropProvider';
import { useViewState } from '~/hooks/useViewState';
import { useDatabaseBlock } from '~/hooks/useDatabaseBlock';
import type { ViewType } from '~/types/database-block';
import { cn } from '~/utils/cn';

// Lazy load view components for better performance
const ViewComponents = {
  table: DatabaseTable,
  // These will be implemented in subsequent subtasks
  gallery: lazy(() => import('./DatabaseGallery').then(m => ({ default: m.DatabaseGallery }))),
  kanban: lazy(() => import('./DatabaseKanban').then(m => ({ default: m.DatabaseKanban }))),
  calendar: lazy(() => import('./DatabaseCalendar').then(m => ({ default: m.DatabaseCalendar }))),
  timeline: lazy(() => import('./DatabaseTimeline').then(m => ({ default: m.DatabaseTimeline })))
};

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

  // View state management
  const {
    currentView,
    viewSettings,
    changeView,
    updateViewSettings,
    getCurrentViewSettings
  } = useViewState(blockId);

  // Get the appropriate view component
  const ViewComponent = ViewComponents[currentView];
  const currentViewSettings = getCurrentViewSettings();

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
        {/* Toolbar with view switcher */}
        <DatabaseToolbar
        databaseBlock={databaseBlock}
        columns={columns}
        filters={filters}
        sorts={sorts}
        selectedRows={selectedRows}
        currentView={currentView}
        onAddRow={addRow}
        onAddColumn={addColumn}
        onApplyFilters={applyFilters}
        onApplySorts={applySorts}
        onDeleteSelected={handleDeleteSelected}
        onViewChange={changeView}
      />

      {/* View content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              <div className="mt-4 text-sm">Loading database...</div>
            </div>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                  <div className="mt-4 text-sm">Loading view...</div>
                </div>
              </div>
            }
          >
            <ViewComponent
              databaseBlock={databaseBlock}
              columns={columns}
              rows={rows}
              selectedRows={selectedRows}
              viewSettings={currentViewSettings}
              onUpdateRow={updateRow}
              onDeleteRows={deleteRows}
              onUpdateColumn={updateColumn}
              onDeleteColumn={deleteColumn}
              onSelectRow={selectRow}
              onSelectAllRows={selectAllRows}
              onClearSelection={clearSelection}
              onUpdateViewSettings={(settings) => updateViewSettings(currentView, settings)}
            />
          </Suspense>
        )}
      </div>
    </div>
    </DragAndDropProvider>
  );
});