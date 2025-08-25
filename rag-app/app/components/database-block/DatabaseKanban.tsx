import { memo, useState } from 'react';
import type {
  DatabaseBlock,
  DatabaseColumn,
  DatabaseRow
} from '~/types/database-block';

interface DatabaseKanbanProps {
  databaseBlock: DatabaseBlock | null;
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
  selectedRows: Set<string>;
  viewSettings: any;
  onUpdateRow: (rowId: string, updates: Partial<DatabaseRow['cells']>) => void;
  onDeleteRows: (rowIds: string[]) => void;
  onUpdateColumn: (columnId: string, updates: Partial<DatabaseColumn>) => void;
  onDeleteColumn: (columnId: string) => void;
  onSelectRow: (rowId: string, isSelected: boolean) => void;
  onSelectAllRows: (isSelected: boolean) => void;
  onClearSelection: () => void;
  onUpdateViewSettings: (settings: any) => void;
}

export const DatabaseKanban = memo(function DatabaseKanban({
  databaseBlock,
  columns,
  rows,
  selectedRows,
  viewSettings,
  onUpdateRow,
  onDeleteRows,
  onSelectRow,
  onUpdateViewSettings
}: DatabaseKanbanProps) {
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  
  // Get kanban settings
  const groupByField = viewSettings?.groupByField || columns.find(c => c.type === 'select')?.id;
  const hideEmptyGroups = viewSettings?.hideEmptyGroups || false;
  const cardPreviewFields = viewSettings?.cardPreviewFields || columns.slice(0, 3).map(c => c.id);
  
  // Get the column to group by
  const groupColumn = columns.find(c => c.id === groupByField);
  
  // Get unique groups
  const getGroups = () => {
    if (!groupColumn) return [];
    
    if (groupColumn.type === 'select' && groupColumn.options) {
      return groupColumn.options;
    }
    
    // For other types, extract unique values
    const uniqueValues = new Set(rows.map(r => r.cells[groupByField!]));
    return Array.from(uniqueValues).map(value => ({
      id: String(value),
      label: String(value),
      color: 'gray'
    }));
  };
  
  const groups = getGroups();
  
  // Group rows by the selected field
  const groupedRows = groups.reduce((acc, group) => {
    acc[group.id] = rows.filter(row => row.cells[groupByField!] === group.id);
    return acc;
  }, {} as Record<string, DatabaseRow[]>);
  
  // Add ungrouped items
  const ungroupedRows = rows.filter(row => 
    !groupByField || !groups.some(g => g.id === row.cells[groupByField])
  );
  
  const handleDragStart = (e: React.DragEvent, rowId: string) => {
    setDraggedCard(rowId);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  
  const handleDrop = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    if (draggedCard && groupByField) {
      onUpdateRow(draggedCard, { [groupByField]: groupId });
    }
    setDraggedCard(null);
  };

  return (
    <div className="h-full overflow-x-auto">
      {/* Kanban settings bar */}
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center space-x-4">
        <label className="flex items-center space-x-2 text-sm">
          <span>Group by:</span>
          <select
            value={groupByField || ''}
            onChange={(e) => onUpdateViewSettings({ groupByField: e.target.value || undefined })}
            className="px-2 py-1 border rounded"
          >
            <option value="">None</option>
            {columns.filter(c => c.type === 'select' || c.type === 'multi_select').map(col => (
              <option key={col.id} value={col.id}>{col.name}</option>
            ))}
          </select>
        </label>
        
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={hideEmptyGroups}
            onChange={(e) => onUpdateViewSettings({ hideEmptyGroups: e.target.checked })}
          />
          <span>Hide empty groups</span>
        </label>
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 p-4 h-full">
        {/* Ungrouped column */}
        {(!groupByField || ungroupedRows.length > 0) && (
          <div className="flex-shrink-0 w-72">
            <div className="bg-gray-100 rounded-lg p-3 h-full">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-700">Ungrouped</h3>
                <span className="text-sm text-gray-500">{ungroupedRows.length}</span>
              </div>
              <div 
                className="space-y-2 min-h-[100px]"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, '')}
              >
                {ungroupedRows.map(row => (
                  <KanbanCard
                    key={row.id}
                    row={row}
                    columns={columns}
                    previewFields={cardPreviewFields}
                    isSelected={selectedRows.has(row.id)}
                    onSelect={(selected) => onSelectRow(row.id, selected)}
                    onDragStart={handleDragStart}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Group columns */}
        {groups.map(group => {
          const groupRows = groupedRows[group.id] || [];
          if (hideEmptyGroups && groupRows.length === 0) return null;
          
          return (
            <div key={group.id} className="flex-shrink-0 w-72">
              <div className="bg-gray-100 rounded-lg p-3 h-full">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getColorValue(group.color) }}
                    />
                    <h3 className="font-medium text-gray-700">{group.label}</h3>
                  </div>
                  <span className="text-sm text-gray-500">{groupRows.length}</span>
                </div>
                <div 
                  className="space-y-2 min-h-[100px]"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, group.id)}
                >
                  {groupRows.map(row => (
                    <KanbanCard
                      key={row.id}
                      row={row}
                      columns={columns}
                      previewFields={cardPreviewFields}
                      isSelected={selectedRows.has(row.id)}
                      onSelect={(selected) => onSelectRow(row.id, selected)}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        
        {groups.length === 0 && !ungroupedRows.length && (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a field to group by
          </div>
        )}
      </div>
    </div>
  );
});

// Helper component for Kanban cards
const KanbanCard = memo(function KanbanCard({
  row,
  columns,
  previewFields,
  isSelected,
  onSelect,
  onDragStart
}: {
  row: DatabaseRow;
  columns: DatabaseColumn[];
  previewFields: string[];
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onDragStart: (e: React.DragEvent, rowId: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, row.id)}
      onClick={() => onSelect(!isSelected)}
      className={`
        bg-white rounded-md p-3 cursor-pointer shadow-sm
        ${isSelected ? 'ring-2 ring-blue-500' : 'hover:shadow-md'}
      `}
    >
      {previewFields.map(fieldId => {
        const column = columns.find(c => c.id === fieldId);
        if (!column) return null;
        
        const value = row.cells[fieldId];
        if (!value) return null;
        
        return (
          <div key={fieldId} className="text-sm mb-1">
            <span className="text-gray-600">{column.name}:</span>
            <span className="ml-1 text-gray-900">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
});

// Helper function to get color value
function getColorValue(color: string): string {
  const colors: Record<string, string> = {
    gray: '#6B7280',
    blue: '#3B82F6',
    green: '#10B981',
    yellow: '#F59E0B',
    red: '#EF4444',
    purple: '#8B5CF6',
    pink: '#EC4899',
    indigo: '#6366F1'
  };
  return colors[color] || colors.gray;
}