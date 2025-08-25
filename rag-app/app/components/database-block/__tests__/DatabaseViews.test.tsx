import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseBlock } from '../DatabaseBlock';
import { DragAndDropProvider } from '../DragAndDropProvider';
import { DatabaseGallery } from '../DatabaseGallery';
import { DatabaseKanban } from '../DatabaseKanban';
import { DatabaseCalendar } from '../DatabaseCalendar';
import { DatabaseTimeline } from '../DatabaseTimeline';
import { ViewSwitcher } from '../ViewSwitcher';
import { FilterBuilder } from '../FilterBuilder';
import { useViewState } from '~/hooks/useViewState';
import { useDatabaseBlock } from '~/hooks/useDatabaseBlock';
import type { DatabaseColumn, DatabaseRow, ViewType } from '~/types/database-block';

// Mock the hooks
vi.mock('~/hooks/useViewState');
vi.mock('~/hooks/useDatabaseBlock');

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn()
};
global.localStorage = localStorageMock as any;

describe('Database Views', () => {
  const mockColumns: DatabaseColumn[] = [
    { id: 'col1', name: 'Title', type: 'text', width: 200 },
    { id: 'col2', name: 'Status', type: 'select', width: 150, options: [
      { id: 'todo', label: 'To Do', color: 'gray' },
      { id: 'done', label: 'Done', color: 'green' }
    ]},
    { id: 'col3', name: 'Due Date', type: 'date', width: 150 }
  ];

  const mockRows: DatabaseRow[] = [
    { id: 'row1', cells: { col1: 'Task 1', col2: 'todo', col3: '2024-01-15' }},
    { id: 'row2', cells: { col1: 'Task 2', col2: 'done', col3: '2024-01-20' }}
  ];

  const mockDatabaseBlock = {
    id: 'test-block',
    name: 'Test Database',
    description: 'Test',
    icon: '📊',
    rowCount: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('ViewSwitcher', () => {
    it('renders all available views', () => {
      const onViewChange = vi.fn();
      render(
        <ViewSwitcher
          currentView="table"
          availableViews={['table', 'gallery', 'kanban', 'calendar', 'timeline']}
          onViewChange={onViewChange}
        />
      );

      const button = screen.getByRole('button', { name: /switch view/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Table');
    });

    it('opens dropdown on click', () => {
      const onViewChange = vi.fn();
      render(
        <ViewSwitcher
          currentView="table"
          onViewChange={onViewChange}
        />
      );

      const button = screen.getByRole('button', { name: /switch view/i });
      fireEvent.click(button);

      expect(screen.getByText('Gallery')).toBeInTheDocument();
      expect(screen.getByText('Kanban')).toBeInTheDocument();
      expect(screen.getByText('Calendar')).toBeInTheDocument();
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    it('calls onViewChange when selecting a view', () => {
      const onViewChange = vi.fn();
      render(
        <ViewSwitcher
          currentView="table"
          onViewChange={onViewChange}
        />
      );

      const button = screen.getByRole('button', { name: /switch view/i });
      fireEvent.click(button);
      
      const galleryOption = screen.getByText('Gallery').closest('button');
      fireEvent.click(galleryOption!);

      expect(onViewChange).toHaveBeenCalledWith('gallery');
    });
  });

  describe('Gallery View', () => {
    it('renders cards for each row', () => {
      const props = {
        databaseBlock: mockDatabaseBlock,
        columns: mockColumns,
        rows: mockRows,
        selectedRows: new Set<string>(),
        viewSettings: { cardSize: 'medium' },
        onUpdateRow: vi.fn(),
        onDeleteRows: vi.fn(),
        onUpdateColumn: vi.fn(),
        onDeleteColumn: vi.fn(),
        onSelectRow: vi.fn(),
        onSelectAllRows: vi.fn(),
        onClearSelection: vi.fn(),
        onUpdateViewSettings: vi.fn()
      };

      render(<DatabaseGallery {...props} />);

      expect(screen.getByText('Task 1')).toBeInTheDocument();
      expect(screen.getByText('Task 2')).toBeInTheDocument();
    });

    it('allows changing card size', () => {
      const onUpdateViewSettings = vi.fn();
      const props = {
        databaseBlock: mockDatabaseBlock,
        columns: mockColumns,
        rows: mockRows,
        selectedRows: new Set<string>(),
        viewSettings: { cardSize: 'medium' },
        onUpdateRow: vi.fn(),
        onDeleteRows: vi.fn(),
        onUpdateColumn: vi.fn(),
        onDeleteColumn: vi.fn(),
        onSelectRow: vi.fn(),
        onSelectAllRows: vi.fn(),
        onClearSelection: vi.fn(),
        onUpdateViewSettings
      };

      render(<DatabaseGallery {...props} />);

      const sizeSelect = screen.getByLabelText(/card size/i);
      fireEvent.change(sizeSelect, { target: { value: 'large' }});

      expect(onUpdateViewSettings).toHaveBeenCalledWith({ cardSize: 'large' });
    });
  });

  describe('Kanban View', () => {
    it('groups items by select field', () => {
      const props = {
        databaseBlock: mockDatabaseBlock,
        columns: mockColumns,
        rows: mockRows,
        selectedRows: new Set<string>(),
        viewSettings: { groupByField: 'col2' },
        onUpdateRow: vi.fn(),
        onDeleteRows: vi.fn(),
        onUpdateColumn: vi.fn(),
        onDeleteColumn: vi.fn(),
        onSelectRow: vi.fn(),
        onSelectAllRows: vi.fn(),
        onClearSelection: vi.fn(),
        onUpdateViewSettings: vi.fn()
      };

      render(<DatabaseKanban {...props} />);

      expect(screen.getByText('To Do')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('supports drag and drop between columns', () => {
      const onUpdateRow = vi.fn();
      const props = {
        databaseBlock: mockDatabaseBlock,
        columns: mockColumns,
        rows: mockRows,
        selectedRows: new Set<string>(),
        viewSettings: { groupByField: 'col2' },
        onUpdateRow,
        onDeleteRows: vi.fn(),
        onUpdateColumn: vi.fn(),
        onDeleteColumn: vi.fn(),
        onSelectRow: vi.fn(),
        onSelectAllRows: vi.fn(),
        onClearSelection: vi.fn(),
        onUpdateViewSettings: vi.fn()
      };

      render(
        <DragAndDropProvider>
          <DatabaseKanban {...props} />
        </DragAndDropProvider>
      );

      const card = screen.getByText('Task 1').closest('div[draggable="true"]');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Calendar View', () => {
    it('displays items on calendar grid', () => {
      const props = {
        databaseBlock: mockDatabaseBlock,
        columns: mockColumns,
        rows: mockRows,
        selectedRows: new Set<string>(),
        viewSettings: { dateField: 'col3', calendarView: 'month' },
        onUpdateRow: vi.fn(),
        onDeleteRows: vi.fn(),
        onUpdateColumn: vi.fn(),
        onDeleteColumn: vi.fn(),
        onSelectRow: vi.fn(),
        onSelectAllRows: vi.fn(),
        onClearSelection: vi.fn(),
        onUpdateViewSettings: vi.fn()
      };

      render(<DatabaseCalendar {...props} />);

      // Check for calendar navigation
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByLabelText(/date field/i)).toBeInTheDocument();
    });

    it('allows changing calendar view', () => {
      const onUpdateViewSettings = vi.fn();
      const props = {
        databaseBlock: mockDatabaseBlock,
        columns: mockColumns,
        rows: mockRows,
        selectedRows: new Set<string>(),
        viewSettings: { dateField: 'col3', calendarView: 'month' },
        onUpdateRow: vi.fn(),
        onDeleteRows: vi.fn(),
        onUpdateColumn: vi.fn(),
        onDeleteColumn: vi.fn(),
        onSelectRow: vi.fn(),
        onSelectAllRows: vi.fn(),
        onClearSelection: vi.fn(),
        onUpdateViewSettings
      };

      render(<DatabaseCalendar {...props} />);

      const weekSelect = screen.getByLabelText(/start week on/i);
      fireEvent.change(weekSelect, { target: { value: 'monday' }});

      expect(onUpdateViewSettings).toHaveBeenCalledWith({ startWeekOn: 'monday' });
    });
  });

  describe('Timeline View', () => {
    it('displays items on timeline', () => {
      const props = {
        databaseBlock: mockDatabaseBlock,
        columns: mockColumns,
        rows: mockRows,
        selectedRows: new Set<string>(),
        viewSettings: { startDateField: 'col3', timelineScale: 'month' },
        onUpdateRow: vi.fn(),
        onDeleteRows: vi.fn(),
        onUpdateColumn: vi.fn(),
        onDeleteColumn: vi.fn(),
        onSelectRow: vi.fn(),
        onSelectAllRows: vi.fn(),
        onClearSelection: vi.fn(),
        onUpdateViewSettings: vi.fn()
      };

      render(<DatabaseTimeline {...props} />);

      expect(screen.getByText('Zoom In')).toBeInTheDocument();
      expect(screen.getByText('Zoom Out')).toBeInTheDocument();
    });
  });

  describe('FilterBuilder', () => {
    it('shows view-specific filter presets', () => {
      const onApply = vi.fn();
      const onCancel = vi.fn();

      render(
        <FilterBuilder
          columns={mockColumns}
          filters={[]}
          currentView="calendar"
          onApply={onApply}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText('Quick filters:')).toBeInTheDocument();
      expect(screen.getByText('This week')).toBeInTheDocument();
      expect(screen.getByText('This month')).toBeInTheDocument();
    });

    it('allows adding multiple filters', () => {
      const onApply = vi.fn();
      const onCancel = vi.fn();

      render(
        <FilterBuilder
          columns={mockColumns}
          filters={[]}
          currentView="table"
          onApply={onApply}
          onCancel={onCancel}
        />
      );

      const addButton = screen.getByText('+ Add filter');
      fireEvent.click(addButton);

      // Should now have 2 filter rows
      const selects = screen.getAllByText('Select column...');
      expect(selects).toHaveLength(2);
    });

    it('applies filters correctly', () => {
      const onApply = vi.fn();
      const onCancel = vi.fn();

      render(
        <FilterBuilder
          columns={mockColumns}
          filters={[]}
          currentView="table"
          onApply={onApply}
          onCancel={onCancel}
        />
      );

      const applyButton = screen.getByText('Apply Filters');
      fireEvent.click(applyButton);

      expect(onApply).toHaveBeenCalled();
    });
  });

  describe('View State Persistence', () => {
    it('saves view state to localStorage', async () => {
      const { result } = renderHook(() => useViewState('test-block'));
      
      act(() => {
        result.current.changeView('gallery');
      });

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'db-view-state-test-block',
          expect.stringContaining('gallery')
        );
      });
    });

    it('loads saved view state from localStorage', () => {
      const savedState = JSON.stringify({
        currentView: 'kanban',
        viewSettings: {
          kanban: { groupByField: 'status' }
        }
      });
      
      localStorageMock.getItem.mockReturnValue(savedState);
      
      const { result } = renderHook(() => useViewState('test-block'));
      
      expect(result.current.currentView).toBe('kanban');
      expect(result.current.viewSettings.kanban.groupByField).toBe('status');
    });
  });

  describe('Performance', () => {
    it('lazy loads view components', async () => {
      vi.mocked(useDatabaseBlock).mockReturnValue({
        databaseBlock: mockDatabaseBlock,
        columns: mockColumns,
        rows: mockRows,
        filters: [],
        sorts: [],
        selectedRows: new Set(),
        isLoading: false,
        error: null,
        addRow: vi.fn(),
        updateRow: vi.fn(),
        deleteRows: vi.fn(),
        addColumn: vi.fn(),
        updateColumn: vi.fn(),
        deleteColumn: vi.fn(),
        applyFilters: vi.fn(),
        applySorts: vi.fn(),
        selectRow: vi.fn(),
        selectAllRows: vi.fn(),
        clearSelection: vi.fn()
      });

      vi.mocked(useViewState).mockReturnValue({
        currentView: 'gallery',
        viewSettings: {},
        changeView: vi.fn(),
        updateViewSettings: vi.fn(),
        getCurrentViewSettings: vi.fn(() => ({})),
        resetViewSettings: vi.fn()
      });

      render(<DatabaseBlock blockId="test-block" />);

      // Gallery view should be lazy loaded
      await waitFor(() => {
        expect(screen.getByText('Test Database')).toBeInTheDocument();
      });
    });
  });
});

// Helper to render hooks
import { renderHook, act } from '@testing-library/react';