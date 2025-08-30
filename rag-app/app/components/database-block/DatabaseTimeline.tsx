import { memo, useMemo, useState } from 'react';
import type {
  DatabaseBlock,
  DatabaseColumn,
  DatabaseRow
} from '~/types/database-block';

interface DatabaseTimelineProps {
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

export const DatabaseTimeline = memo(function DatabaseTimeline({
  databaseBlock,
  columns,
  rows,
  selectedRows,
  viewSettings,
  onUpdateRow,
  onSelectRow,
  onUpdateViewSettings
}: DatabaseTimelineProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  
  // Get timeline settings
  const startDateField = viewSettings?.startDateField || columns.find(c => c.type === 'date' || c.type === 'datetime')?.id;
  const endDateField = viewSettings?.endDateField;
  const timelineScale = viewSettings?.timelineScale || 'month';
  
  // Calculate timeline bounds
  const timelineBounds = useMemo(() => {
    if (!startDateField) return null;
    
    let minDate = new Date();
    let maxDate = new Date();
    let hasData = false;
    
    rows.forEach(row => {
      const startDate = row.cells[startDateField];
      const endDate = endDateField ? row.cells[endDateField] : startDate;
      
      if (startDate) {
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : start;
        
        if (!hasData) {
          minDate = start;
          maxDate = end;
          hasData = true;
        } else {
          if (start < minDate) minDate = start;
          if (end > maxDate) maxDate = end;
        }
      }
    });
    
    if (!hasData) {
      // Default to current year if no data
      const now = new Date();
      minDate = new Date(now.getFullYear(), 0, 1);
      maxDate = new Date(now.getFullYear(), 11, 31);
    }
    
    // Add padding
    const padding = (maxDate.getTime() - minDate.getTime()) * 0.1;
    minDate = new Date(minDate.getTime() - padding);
    maxDate = new Date(maxDate.getTime() + padding);
    
    return { minDate, maxDate };
  }, [rows, startDateField, endDateField]);
  
  // Generate timeline scale markers
  const scaleMarkers = useMemo(() => {
    if (!timelineBounds) return [];
    
    const markers = [];
    const { minDate, maxDate } = timelineBounds;
    
    if (timelineScale === 'day') {
      const current = new Date(minDate);
      while (current <= maxDate) {
        markers.push({
          date: new Date(current),
          label: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        });
        current.setDate(current.getDate() + 1);
      }
    } else if (timelineScale === 'week') {
      const current = new Date(minDate);
      current.setDate(current.getDate() - current.getDay()); // Start of week
      while (current <= maxDate) {
        markers.push({
          date: new Date(current),
          label: `Week ${Math.ceil((current.getDate()) / 7)}`
        });
        current.setDate(current.getDate() + 7);
      }
    } else if (timelineScale === 'month') {
      const current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      while (current <= maxDate) {
        markers.push({
          date: new Date(current),
          label: current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        });
        current.setMonth(current.getMonth() + 1);
      }
    } else if (timelineScale === 'quarter') {
      const current = new Date(minDate.getFullYear(), Math.floor(minDate.getMonth() / 3) * 3, 1);
      while (current <= maxDate) {
        markers.push({
          date: new Date(current),
          label: `Q${Math.floor(current.getMonth() / 3) + 1} ${current.getFullYear()}`
        });
        current.setMonth(current.getMonth() + 3);
      }
    } else { // year
      const current = new Date(minDate.getFullYear(), 0, 1);
      while (current <= maxDate) {
        markers.push({
          date: new Date(current),
          label: current.getFullYear().toString()
        });
        current.setFullYear(current.getFullYear() + 1);
      }
    }
    
    return markers;
  }, [timelineBounds, timelineScale]);
  
  // Calculate position for a date on the timeline
  const getPosition = (date: Date) => {
    if (!timelineBounds) return 0;
    const { minDate, maxDate } = timelineBounds;
    const total = maxDate.getTime() - minDate.getTime();
    const offset = date.getTime() - minDate.getTime();
    return (offset / total) * 100;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Timeline settings */}
      <div className="px-4 py-2 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 text-sm">
              <span>Start date:</span>
              <select
                value={startDateField || ''}
                onChange={(e) => onUpdateViewSettings({ startDateField: e.target.value || undefined })}
                className="px-2 py-1 border rounded"
              >
                <option value="">None</option>
                {columns.filter(c => c.type === 'date' || c.type === 'datetime').map(col => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
            </label>
            
            <label className="flex items-center space-x-2 text-sm">
              <span>End date:</span>
              <select
                value={endDateField || ''}
                onChange={(e) => onUpdateViewSettings({ endDateField: e.target.value || undefined })}
                className="px-2 py-1 border rounded"
              >
                <option value="">Same as start</option>
                {columns.filter(c => c.type === 'date' || c.type === 'datetime').map(col => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
            </label>
            
            <label className="flex items-center space-x-2 text-sm">
              <span>Scale:</span>
              <select
                value={timelineScale}
                onChange={(e) => onUpdateViewSettings({ timelineScale: e.target.value })}
                className="px-2 py-1 border rounded"
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
                <option value="year">Year</option>
              </select>
            </label>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
              className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
            >
              Zoom Out
            </button>
            <span className="text-sm text-gray-600">{Math.round(zoomLevel * 100)}%</span>
            <button
              onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))}
              className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
            >
              Zoom In
            </button>
          </div>
        </div>
      </div>

      {/* Timeline content */}
      <div className="flex-1 overflow-auto p-4">
        {!startDateField ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a start date field to display items on the timeline
          </div>
        ) : timelineBounds && (
          <div className="relative" style={{ width: `${100 * zoomLevel}%`, minWidth: '100%' }}>
            {/* Timeline scale */}
            <div className="h-12 border-b-2 border-gray-300 relative mb-4">
              {scaleMarkers.map((marker, index) => (
                <div
                  key={index}
                  className="absolute top-0 h-full"
                  style={{ left: `${getPosition(marker.date)}%` }}
                >
                  <div className="h-full w-px bg-gray-300" />
                  <div className="absolute top-full mt-1 text-xs text-gray-600 whitespace-nowrap transform -translate-x-1/2">
                    {marker.label}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Timeline items */}
            <div className="space-y-2 mt-12">
              {rows.map((row, index) => {
                const startDate = row.cells[startDateField];
                if (!startDate) return null;
                
                const start = new Date(startDate);
                const end = endDateField && row.cells[endDateField] 
                  ? new Date(row.cells[endDateField]) 
                  : start;
                
                const startPos = getPosition(start);
                const endPos = getPosition(end);
                const width = Math.max(endPos - startPos, 0.5); // Minimum width
                
                const isSelected = selectedRows.has(row.id);
                const title = row.cells[columns[0]?.id] || 'Untitled';
                
                return (
                  <div
                    key={row.id}
                    className="relative h-10"
                    style={{ marginTop: index === 0 ? 0 : '-0.5rem' }}
                  >
                    <div
                      onClick={() => onSelectRow(row.id, !isSelected)}
                      className={`
                        absolute h-8 rounded cursor-pointer flex items-center px-2
                        ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}
                      `}
                      style={{
                        left: `${startPos}%`,
                        width: `${width}%`,
                        minWidth: '80px'
                      }}
                    >
                      <span className="text-sm truncate">{String(title)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Today line */}
            {timelineBounds && (
              <div
                className="absolute top-0 bottom-0 w-px bg-red-500 opacity-50"
                style={{ left: `${getPosition(new Date())}%` }}
              >
                <div className="absolute top-0 -translate-x-1/2 bg-red-500 text-white text-xs px-1 rounded">
                  Today
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});