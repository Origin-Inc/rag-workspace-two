import { memo, useState, useMemo } from 'react';
import type {
  DatabaseBlock,
  DatabaseColumn,
  DatabaseRow
} from '~/types/database-block';

interface DatabaseCalendarProps {
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

export const DatabaseCalendar = memo(function DatabaseCalendar({
  databaseBlock,
  columns,
  rows,
  selectedRows,
  viewSettings,
  onUpdateRow,
  onSelectRow,
  onUpdateViewSettings
}: DatabaseCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Get calendar settings
  const dateField = viewSettings?.dateField || columns.find(c => c.type === 'date' || c.type === 'datetime')?.id;
  const calendarView = viewSettings?.calendarView || 'month';
  const startWeekOn = viewSettings?.startWeekOn || 'sunday';
  
  // Calculate calendar days for the current month
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startOffset = startWeekOn === 'monday' ? 
      (firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1) : 
      firstDay.getDay();
    
    const days = [];
    
    // Add days from previous month
    for (let i = startOffset; i > 0; i--) {
      const date = new Date(year, month, -i + 1);
      days.push({ date, isCurrentMonth: false });
    }
    
    // Add days from current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i);
      days.push({ date, isCurrentMonth: true });
    }
    
    // Add days from next month to complete the grid
    const remaining = 42 - days.length; // 6 weeks × 7 days
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({ date, isCurrentMonth: false });
    }
    
    return days;
  }, [currentDate, startWeekOn]);
  
  // Group rows by date
  const rowsByDate = useMemo(() => {
    if (!dateField) return new Map();
    
    const map = new Map<string, DatabaseRow[]>();
    
    rows.forEach(row => {
      const dateValue = row.cells[dateField];
      if (dateValue) {
        const date = new Date(dateValue);
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key)!.push(row);
      }
    });
    
    return map;
  }, [rows, dateField]);
  
  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };
  
  const weekDays = startWeekOn === 'monday' 
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="h-full flex flex-col">
      {/* Calendar settings and navigation */}
      <div className="px-4 py-2 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 text-sm">
              <span>Date field:</span>
              <select
                value={dateField || ''}
                onChange={(e) => onUpdateViewSettings({ dateField: e.target.value || undefined })}
                className="px-2 py-1 border rounded"
              >
                <option value="">None</option>
                {columns.filter(c => c.type === 'date' || c.type === 'datetime').map(col => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
            </label>
            
            <label className="flex items-center space-x-2 text-sm">
              <span>Start week on:</span>
              <select
                value={startWeekOn}
                onChange={(e) => onUpdateViewSettings({ startWeekOn: e.target.value })}
                className="px-2 py-1 border rounded"
              >
                <option value="sunday">Sunday</option>
                <option value="monday">Monday</option>
              </select>
            </label>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigateMonth(-1)}
              className="p-1 hover:bg-gray-200 rounded"
            >
              ←
            </button>
            <span className="font-medium">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => navigateMonth(1)}
              className="p-1 hover:bg-gray-200 rounded"
            >
              →
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 p-4">
        {!dateField ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a date field to display items on the calendar
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Week day headers */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 mb-px">
              {weekDays.map(day => (
                <div key={day} className="bg-gray-50 p-2 text-center text-sm font-medium text-gray-700">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar days */}
            <div className="flex-1 grid grid-cols-7 gap-px bg-gray-200">
              {calendarDays.map(({ date, isCurrentMonth }, index) => {
                const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                const dayRows = rowsByDate.get(key) || [];
                const isToday = 
                  date.getDate() === new Date().getDate() &&
                  date.getMonth() === new Date().getMonth() &&
                  date.getFullYear() === new Date().getFullYear();
                
                return (
                  <div
                    key={index}
                    className={`
                      bg-white p-2 min-h-[100px] overflow-hidden
                      ${!isCurrentMonth ? 'opacity-50' : ''}
                      ${isToday ? 'ring-2 ring-blue-500 ring-inset' : ''}
                    `}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                        {date.getDate()}
                      </span>
                      {dayRows.length > 0 && (
                        <span className="text-xs bg-gray-100 px-1 rounded">
                          {dayRows.length}
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      {dayRows.slice(0, 3).map(row => {
                        const isSelected = selectedRows.has(row.id);
                        const title = row.cells[columns[0]?.id] || 'Untitled';
                        
                        return (
                          <div
                            key={row.id}
                            onClick={() => onSelectRow(row.id, !isSelected)}
                            className={`
                              text-xs p-1 rounded cursor-pointer truncate
                              ${isSelected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 hover:bg-gray-200'}
                            `}
                            title={String(title)}
                          >
                            {String(title)}
                          </div>
                        );
                      })}
                      {dayRows.length > 3 && (
                        <div className="text-xs text-gray-500 text-center">
                          +{dayRows.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});