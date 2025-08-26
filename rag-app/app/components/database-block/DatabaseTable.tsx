import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type {
  DatabaseBlock,
  DatabaseColumn,
  DatabaseRow,
  Filter,
  Sort
} from '~/types/database-block';
import { useDatabaseBlock } from '~/hooks/useDatabaseBlock';
import { DatabaseCell } from './DatabaseCell';
import { ColumnHeader } from './ColumnHeader';
import { DatabaseToolbar } from './DatabaseToolbar';
import { RowContextMenu } from './RowContextMenu';
import { DatabaseAnalytics } from './DatabaseAnalytics';
import { cn } from '~/utils/cn';

interface DatabaseTableProps {
  databaseBlockId: string;
  userId?: string;
  userName?: string;
  className?: string;
  onAnalyzeWithAI?: (context: any) => void;
}

export const DatabaseTable = memo(function DatabaseTable({
  databaseBlockId,
  userId,
  userName,
  className,
  onAnalyzeWithAI
}: DatabaseTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    rowId: string;
    x: number;
    y: number;
  } | null>(null);

  const {
    databaseBlock,
    columns,
    rows,
    totalCount,
    isLoading,
    error,
    filters,
    sorts,
    onlineUsers,
    editingCells,
    getVisibleRange,
    ensureRowsLoaded,
    updateCell,
    startEditingCell,
    addRow,
    deleteRow,
    duplicateRow,
    addColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    applyFilters,
    applySorts
  } = useDatabaseBlock(databaseBlockId, {
    pageSize: 50,
    overscan: 10,
    enableRealtime: true,
    enablePresence: true,
    userId,
    userName
  });

  // Virtual scrolling setup
  const rowVirtualizer = useVirtualizer({
    count: totalCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40, // Default row height
    overscan: 10
  });

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => columns[index]?.width || 150,
    overscan: 3
  });

  // Debug logging
  useEffect(() => {
    console.log('[DatabaseTable] Columns count:', columns.length);
    console.log('[DatabaseTable] Column names:', columns.map(c => c.name));
    console.log('[DatabaseTable] Total column width:', columnVirtualizer.getTotalSize());
    console.log('[DatabaseTable] Visible columns:', columnVirtualizer.getVirtualItems().map(v => columns[v.index]?.name));
  }, [columns, columnVirtualizer]);

  // Load data when visible range changes
  useEffect(() => {
    const items = rowVirtualizer.getVirtualItems();
    if (items.length > 0) {
      const start = items[0].index;
      const end = items[items.length - 1].index;
      ensureRowsLoaded(start, end);
    }
  }, [rowVirtualizer.getVirtualItems, ensureRowsLoaded]);

  // Handle row selection
  const handleRowSelect = useCallback((rowId: string, multi: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (multi) {
        if (next.has(rowId)) {
          next.delete(rowId);
        } else {
          next.add(rowId);
        }
      } else {
        next.clear();
        next.add(rowId);
      }
      return next;
    });
  }, []);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, rowId: string) => {
    e.preventDefault();
    setContextMenu({ rowId, x: e.clientX, y: e.clientY });
  }, []);

  // Handle AI analysis
  const handleAnalyzeWithAI = useCallback(() => {
    if (!databaseBlock || !onAnalyzeWithAI) return;
    
    // Create context object with all database information
    const context = {
      blockId: databaseBlock.id,
      blockName: databaseBlock.name,
      description: databaseBlock.description,
      columns: columns.map(col => ({
        name: col.name,
        type: col.type,
        width: col.width,
        options: col.options
      })),
      rows: rows.slice(0, 100), // Send first 100 rows for analysis
      totalRows: totalCount,
      filters,
      sorts,
      metadata: {
        createdAt: databaseBlock.createdAt,
        updatedAt: databaseBlock.updatedAt
      }
    };
    
    onAnalyzeWithAI(context);
  }, [databaseBlock, columns, rows, totalCount, filters, sorts, onAnalyzeWithAI]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Select all
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSelectedRows(new Set(rows.map(r => r.id)));
      }
      // Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedRows.size > 0) {
          e.preventDefault();
          selectedRows.forEach(rowId => deleteRow(rowId));
          setSelectedRows(new Set());
        }
      }
      // Escape to clear selection
      if (e.key === 'Escape') {
        setSelectedRows(new Set());
        setContextMenu(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rows, selectedRows, deleteRow]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        Error loading database: {error}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-white', className)} ref={containerRef}>
      {/* Toolbar */}
      <DatabaseToolbar
        databaseBlock={databaseBlock}
        columns={columns}
        filters={filters}
        sorts={sorts}
        selectedRows={selectedRows}
        currentView="table"
        onAddRow={() => addRow()}
        onAddColumn={addColumn}
        onApplyFilters={applyFilters}
        onApplySorts={applySorts}
        onDeleteSelected={() => {
          selectedRows.forEach(rowId => deleteRow(rowId));
          setSelectedRows(new Set());
        }}
        onViewChange={() => {}}
        onAnalyzeWithAI={handleAnalyzeWithAI}
      />

      {/* Table */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto relative border-2 border-blue-400"
        onClick={() => setContextMenu(null)}
        style={{
          // Ensure minimum width for scrolling
          minWidth: '100%'
        }}
      >
        <div
          className="relative"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: `${columnVirtualizer.getTotalSize()}px`,
            minWidth: '100%'
          }}
        >
          {/* Column headers */}
          <div
            className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 flex"
            style={{ width: `${columnVirtualizer.getTotalSize()}px` }}
          >
            {/* Row number header */}
            <div className="sticky left-0 z-30 w-12 bg-gray-50 border-r border-gray-200 flex items-center justify-center">
              <input
                type="checkbox"
                checked={selectedRows.size === rows.length && rows.length > 0}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedRows(new Set(rows.map(r => r.id)));
                  } else {
                    setSelectedRows(new Set());
                  }
                }}
                className="rounded border-gray-300"
              />
            </div>

            {/* Column headers */}
            {columnVirtualizer.getVirtualItems().map((virtualColumn) => {
              const column = columns[virtualColumn.index];
              return (
                <div
                  key={column.id}
                  className="absolute top-0 h-10"
                  style={{
                    left: `${virtualColumn.start + 48}px`,
                    width: `${virtualColumn.size}px`
                  }}
                >
                  <ColumnHeader
                    column={column}
                    sort={sorts.find(s => s.columnId === column.columnId)}
                    onSort={(direction) => {
                      const newSorts = sorts.filter(s => s.columnId !== column.columnId);
                      if (direction) {
                        newSorts.push({
                          columnId: column.columnId,
                          direction,
                          priority: 0
                        });
                      }
                      applySorts(newSorts);
                    }}
                    onUpdateColumn={(updates) => updateColumn(column.id, updates)}
                    onDeleteColumn={() => deleteColumn(column.id)}
                    onResize={(width) => updateColumn(column.id, { width })}
                  />
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;

            const isSelected = selectedRows.has(row.id);

            return (
              <div
                key={row.id}
                className={cn(
                  'absolute left-0 flex border-b border-gray-200 hover:bg-gray-50',
                  isSelected && 'bg-blue-50'
                )}
                style={{
                  top: `${virtualRow.start + 40}px`,
                  height: `${virtualRow.size}px`,
                  width: `${columnVirtualizer.getTotalSize()}px`
                }}
                onClick={(e) => handleRowSelect(row.id, e.metaKey || e.ctrlKey)}
                onContextMenu={(e) => handleContextMenu(e, row.id)}
              >
                {/* Row number */}
                <div className="sticky left-0 z-10 w-12 bg-white border-r border-gray-200 flex items-center justify-center text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleRowSelect(row.id, true);
                    }}
                    className="rounded border-gray-300 mr-1"
                  />
                  {virtualRow.index + 1}
                </div>

                {/* Cells */}
                {columnVirtualizer.getVirtualItems().map((virtualColumn) => {
                  const column = columns[virtualColumn.index];
                  const cellId = `${row.id}-${column.columnId}`;
                  const isEditing = editingCells.has(cellId);
                  const editingUser = editingCells.get(cellId);

                  return (
                    <div
                      key={column.id}
                      className="absolute"
                      style={{
                        left: `${virtualColumn.start + 48}px`,
                        width: `${virtualColumn.size}px`,
                        height: '100%'
                      }}
                    >
                      <DatabaseCell
                        column={column}
                        value={row.data[column.columnId]}
                        isEditing={isEditing}
                        editingUser={editingUser}
                        onStartEdit={() => startEditingCell(row.id, column.columnId)}
                        onUpdate={(value) => updateCell(row.id, column.columnId, value)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg px-4 py-2">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm text-gray-600">Loading...</span>
            </div>
          </div>
        )}

        {/* Online users indicator */}
        {onlineUsers.length > 0 && (
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg px-4 py-2">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-600">Online:</span>
              <div className="flex -space-x-2">
                {onlineUsers.slice(0, 5).map((user, index) => (
                  <div
                    key={user.userId}
                    className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center border-2 border-white"
                    title={user.userName || user.userId}
                  >
                    {(user.userName || user.userId).charAt(0).toUpperCase()}
                  </div>
                ))}
                {onlineUsers.length > 5 && (
                  <div className="w-6 h-6 rounded-full bg-gray-400 text-white text-xs flex items-center justify-center border-2 border-white">
                    +{onlineUsers.length - 5}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Scroll hint for more columns */}
        {columns.length > 5 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white rounded-lg shadow-lg px-4 py-2 flex items-center space-x-2">
            <span className="text-sm">→ Scroll horizontally to see all {columns.length} columns →</span>
          </div>
        )}
      </div>

      {/* Analytics Panel */}
      <DatabaseAnalytics
        databaseBlockId={databaseBlockId}
        columns={columns.map(col => ({
          id: col.columnId,
          name: col.name,
          type: col.type
        }))}
        rows={rows.map(row => row.data)}
      />

      {/* Context menu */}
      {contextMenu && (
        <RowContextMenu
          rowId={contextMenu.rowId}
          x={contextMenu.x}
          y={contextMenu.y}
          onDuplicate={() => {
            duplicateRow(contextMenu.rowId);
            setContextMenu(null);
          }}
          onDelete={() => {
            deleteRow(contextMenu.rowId);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
});