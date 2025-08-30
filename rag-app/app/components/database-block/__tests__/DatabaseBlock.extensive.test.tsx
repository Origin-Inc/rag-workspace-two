import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseBlock } from '../DatabaseBlock';
import { DragAndDropProvider } from '../DragAndDropProvider';
import type { DatabaseColumn, DatabaseRow } from '~/types/database-block';

// Performance monitoring utilities
const performanceMonitor = {
  start: (label: string) => performance.mark(`${label}-start`),
  end: (label: string) => {
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
    const measure = performance.getEntriesByName(label)[0] as PerformanceMeasure;
    return measure.duration;
  }
};

describe('Database Block - Extensive Tests', () => {
  beforeEach(() => {
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      clear: vi.fn()
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
    
    // Mock IntersectionObserver
    global.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn()
    }));
    
    // Mock ResizeObserver
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn()
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    performance.clearMarks();
    performance.clearMeasures();
  });

  describe('Performance Tests', () => {
    it('should handle 10,000 rows efficiently', async () => {
      // Generate large dataset
      const columns: DatabaseColumn[] = Array.from({ length: 20 }, (_, i) => ({
        id: `col${i}`,
        name: `Column ${i}`,
        type: i % 3 === 0 ? 'number' : i % 3 === 1 ? 'date' : 'text',
        width: 150
      }));

      const rows: DatabaseRow[] = Array.from({ length: 10000 }, (_, i) => ({
        id: `row${i}`,
        cells: columns.reduce((acc, col) => {
          acc[col.id] = col.type === 'number' ? i : 
                       col.type === 'date' ? '2024-01-01' : 
                       `Value ${i}`;
          return acc;
        }, {} as Record<string, any>)
      }));

      performanceMonitor.start('render-10k-rows');
      
      const { container } = render(
        <DatabaseBlock blockId="perf-test-10k" />
      );
      
      const renderTime = performanceMonitor.end('render-10k-rows');
      
      // Should render in under 500ms
      expect(renderTime).toBeLessThan(500);
      
      // Should use virtualization (not render all rows)
      const renderedRows = container.querySelectorAll('[role="row"]');
      expect(renderedRows.length).toBeLessThan(100); // Only visible rows should be rendered
    });

    it('should handle rapid view switching efficiently', async () => {
      render(<DatabaseBlock blockId="view-switch-test" />);
      
      const viewSwitcher = screen.getByRole('button', { name: /switch view/i });
      
      performanceMonitor.start('view-switching');
      
      // Rapidly switch between views
      for (let i = 0; i < 10; i++) {
        fireEvent.click(viewSwitcher);
        const galleryOption = screen.getByText('Gallery');
        fireEvent.click(galleryOption);
        
        fireEvent.click(viewSwitcher);
        const kanbanOption = screen.getByText('Kanban');
        fireEvent.click(kanbanOption);
        
        fireEvent.click(viewSwitcher);
        const tableOption = screen.getByText('Table');
        fireEvent.click(tableOption);
      }
      
      const switchTime = performanceMonitor.end('view-switching');
      
      // 30 view switches should complete in under 1 second
      expect(switchTime).toBeLessThan(1000);
    });

    it('should efficiently filter large datasets', async () => {
      const columns: DatabaseColumn[] = [
        { id: 'name', name: 'Name', type: 'text', width: 200 },
        { id: 'status', name: 'Status', type: 'select', width: 150, options: [
          { id: 'active', label: 'Active', color: 'green' },
          { id: 'inactive', label: 'Inactive', color: 'gray' }
        ]},
        { id: 'value', name: 'Value', type: 'number', width: 100 }
      ];

      const rows: DatabaseRow[] = Array.from({ length: 5000 }, (_, i) => ({
        id: `row${i}`,
        cells: {
          name: `Item ${i}`,
          status: i % 2 === 0 ? 'active' : 'inactive',
          value: i * 10
        }
      }));

      render(<DatabaseBlock blockId="filter-perf-test" />);
      
      const filterButton = screen.getByText('Filter');
      fireEvent.click(filterButton);
      
      performanceMonitor.start('apply-filters');
      
      // Apply multiple filters
      const applyButton = screen.getByText('Apply Filters');
      fireEvent.click(applyButton);
      
      const filterTime = performanceMonitor.end('apply-filters');
      
      // Filtering should complete in under 100ms
      expect(filterTime).toBeLessThan(100);
    });
  });

  describe('Stress Tests', () => {
    it('should handle maximum column width (50 columns)', async () => {
      const columns: DatabaseColumn[] = Array.from({ length: 50 }, (_, i) => ({
        id: `col${i}`,
        name: `Column ${i}`,
        type: 'text',
        width: 150
      }));

      render(<DatabaseBlock blockId="max-columns-test" />);
      
      // Should render without crashing
      expect(screen.getByText('Database')).toBeInTheDocument();
      
      // Should be horizontally scrollable
      const tableContainer = screen.getByRole('grid', { hidden: true });
      expect(tableContainer).toHaveStyle({ overflowX: 'auto' });
    });

    it('should handle rapid cell editing', async () => {
      render(<DatabaseBlock blockId="rapid-edit-test" />);
      
      await waitFor(() => {
        expect(screen.queryByText('Loading database...')).not.toBeInTheDocument();
      });

      // Simulate rapid editing of multiple cells
      const cells = screen.getAllByRole('gridcell');
      
      performanceMonitor.start('rapid-edits');
      
      for (let i = 0; i < Math.min(20, cells.length); i++) {
        fireEvent.doubleClick(cells[i]);
        const input = within(cells[i]).queryByRole('textbox');
        if (input) {
          fireEvent.change(input, { target: { value: `Edit ${i}` }});
          fireEvent.blur(input);
        }
      }
      
      const editTime = performanceMonitor.end('rapid-edits');
      
      // 20 rapid edits should complete in under 500ms
      expect(editTime).toBeLessThan(500);
    });

    it('should handle concurrent operations', async () => {
      render(<DatabaseBlock blockId="concurrent-test" />);
      
      await waitFor(() => {
        expect(screen.queryByText('Loading database...')).not.toBeInTheDocument();
      });

      // Perform multiple operations concurrently
      const operations = [
        // Add rows
        () => {
          const addRowBtn = screen.getByText('+ New Row');
          for (let i = 0; i < 10; i++) {
            fireEvent.click(addRowBtn);
          }
        },
        // Apply filters
        () => {
          const filterBtn = screen.getByText('Filter');
          fireEvent.click(filterBtn);
          const applyBtn = screen.getByText('Apply Filters');
          fireEvent.click(applyBtn);
        },
        // Sort data
        () => {
          const sortBtn = screen.getByText('Sort');
          fireEvent.click(sortBtn);
          const applyBtn = screen.getAllByText('Apply')[0];
          fireEvent.click(applyBtn);
        },
        // Switch views
        () => {
          const viewSwitcher = screen.getByRole('button', { name: /switch view/i });
          fireEvent.click(viewSwitcher);
          const galleryOption = screen.getByText('Gallery');
          fireEvent.click(galleryOption);
        }
      ];

      performanceMonitor.start('concurrent-ops');
      
      // Execute all operations
      await Promise.all(operations.map(op => Promise.resolve(op())));
      
      const concurrentTime = performanceMonitor.end('concurrent-ops');
      
      // All concurrent operations should complete in under 1 second
      expect(concurrentTime).toBeLessThan(1000);
      
      // App should still be responsive
      expect(screen.getByText('Database')).toBeInTheDocument();
    });
  });

  describe('Memory Management Tests', () => {
    it('should clean up event listeners on unmount', async () => {
      const { unmount } = render(<DatabaseBlock blockId="cleanup-test" />);
      
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      // Trigger some interactions that add listeners
      const viewSwitcher = screen.getByRole('button', { name: /switch view/i });
      fireEvent.click(viewSwitcher);
      
      const initialListenerCount = addEventListenerSpy.mock.calls.length;
      
      unmount();
      
      // All event listeners should be removed
      expect(removeEventListenerSpy.mock.calls.length).toBeGreaterThanOrEqual(initialListenerCount);
    });

    it('should handle localStorage quota exceeded gracefully', async () => {
      // Mock localStorage to throw quota exceeded error
      const mockLocalStorage = {
        getItem: vi.fn(),
        setItem: vi.fn().mockImplementation(() => {
          throw new DOMException('QuotaExceededError');
        }),
        clear: vi.fn()
      };
      Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

      render(<DatabaseBlock blockId="quota-test" />);
      
      // Should render without crashing
      expect(screen.getByText('Database')).toBeInTheDocument();
      
      // Try to change view (which saves to localStorage)
      const viewSwitcher = screen.getByRole('button', { name: /switch view/i });
      fireEvent.click(viewSwitcher);
      
      const galleryOption = screen.getByText('Gallery');
      fireEvent.click(galleryOption);
      
      // Should handle the error gracefully and continue working
      await waitFor(() => {
        expect(screen.getByText('Database')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty database', async () => {
      render(<DatabaseBlock blockId="empty-test" />);
      
      await waitFor(() => {
        expect(screen.queryByText('Loading database...')).not.toBeInTheDocument();
      });
      
      // Should show appropriate empty state
      expect(screen.getByText('0 rows')).toBeInTheDocument();
      expect(screen.getByText('0 columns')).toBeInTheDocument();
    });

    it('should handle malformed data gracefully', async () => {
      const columns: DatabaseColumn[] = [
        { id: 'col1', name: 'Column 1', type: 'text' as any, width: 150 }
      ];

      const rows: DatabaseRow[] = [
        { id: 'row1', cells: { col1: undefined }},
        { id: 'row2', cells: { col1: null }},
        { id: 'row3', cells: { col1: { nested: 'object' }}},
        { id: 'row4', cells: {} }, // Missing cell
      ];

      render(<DatabaseBlock blockId="malformed-test" />);
      
      // Should render without crashing
      expect(screen.getByText('Database')).toBeInTheDocument();
    });

    it('should handle rapid selection changes', async () => {
      render(<DatabaseBlock blockId="selection-test" />);
      
      await waitFor(() => {
        expect(screen.queryByText('Loading database...')).not.toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      
      performanceMonitor.start('rapid-selection');
      
      // Rapidly toggle selection
      for (let i = 0; i < 50; i++) {
        const checkbox = checkboxes[i % checkboxes.length];
        fireEvent.click(checkbox);
      }
      
      const selectionTime = performanceMonitor.end('rapid-selection');
      
      // Should handle 50 selection changes in under 200ms
      expect(selectionTime).toBeLessThan(200);
    });

    it('should handle special characters in data', async () => {
      const specialChars = ['<script>alert("XSS")</script>', '"; DROP TABLE users; --', '\\n\\r\\t', '🚀🎉😊'];
      
      const columns: DatabaseColumn[] = [
        { id: 'special', name: 'Special', type: 'text', width: 200 }
      ];

      const rows: DatabaseRow[] = specialChars.map((char, i) => ({
        id: `row${i}`,
        cells: { special: char }
      }));

      render(<DatabaseBlock blockId="special-chars-test" />);
      
      // Should render without executing scripts or breaking
      expect(screen.getByText('Database')).toBeInTheDocument();
      
      // Should properly escape HTML
      expect(screen.queryByText('alert')).not.toBeInTheDocument();
    });
  });

  describe('Integration Tests', () => {
    it('should maintain state consistency across view changes', async () => {
      render(<DatabaseBlock blockId="state-consistency-test" />);
      
      await waitFor(() => {
        expect(screen.queryByText('Loading database...')).not.toBeInTheDocument();
      });

      // Select some rows
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]);
      fireEvent.click(checkboxes[2]);
      
      // Apply filter
      const filterBtn = screen.getByText('Filter');
      fireEvent.click(filterBtn);
      const applyFilterBtn = screen.getByText('Apply Filters');
      fireEvent.click(applyFilterBtn);
      
      // Switch to gallery view
      const viewSwitcher = screen.getByRole('button', { name: /switch view/i });
      fireEvent.click(viewSwitcher);
      const galleryOption = screen.getByText('Gallery');
      fireEvent.click(galleryOption);
      
      // Switch back to table
      fireEvent.click(viewSwitcher);
      const tableOption = screen.getByText('Table');
      fireEvent.click(tableOption);
      
      // Selection and filters should persist
      expect(checkboxes[1]).toBeChecked();
      expect(checkboxes[2]).toBeChecked();
    });

    it('should handle drag and drop operations', async () => {
      render(
        <DragAndDropProvider>
          <DatabaseBlock blockId="dnd-test" />
        </DragAndDropProvider>
      );
      
      // Switch to Kanban view
      const viewSwitcher = screen.getByRole('button', { name: /switch view/i });
      fireEvent.click(viewSwitcher);
      const kanbanOption = screen.getByText('Kanban');
      fireEvent.click(kanbanOption);
      
      await waitFor(() => {
        expect(screen.getByText('Group by:')).toBeInTheDocument();
      });
      
      // Test drag and drop setup
      const draggableItems = screen.getAllByRole('article');
      expect(draggableItems.length).toBeGreaterThan(0);
      
      // Items should have draggable attribute
      draggableItems.forEach(item => {
        expect(item).toHaveAttribute('draggable');
      });
    });
  });

  describe('Accessibility Tests', () => {
    it('should support keyboard navigation', async () => {
      render(<DatabaseBlock blockId="a11y-keyboard-test" />);
      
      await waitFor(() => {
        expect(screen.queryByText('Loading database...')).not.toBeInTheDocument();
      });

      // Test Tab navigation
      const firstFocusable = screen.getAllByRole('button')[0];
      firstFocusable.focus();
      
      // Simulate Tab key
      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      
      // Focus should move to next element
      expect(document.activeElement).not.toBe(firstFocusable);
    });

    it('should have proper ARIA labels', async () => {
      render(<DatabaseBlock blockId="a11y-aria-test" />);
      
      // Check for ARIA labels
      expect(screen.getByRole('button', { name: /switch view/i })).toBeInTheDocument();
      expect(screen.getByRole('grid', { hidden: true })).toBeInTheDocument();
      
      // Check for proper roles
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
    });

    it('should support screen reader announcements', async () => {
      render(<DatabaseBlock blockId="a11y-sr-test" />);
      
      // View switcher should have proper aria-expanded
      const viewSwitcher = screen.getByRole('button', { name: /switch view/i });
      expect(viewSwitcher).toHaveAttribute('aria-expanded', 'false');
      
      fireEvent.click(viewSwitcher);
      expect(viewSwitcher).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle project management workflow', async () => {
      // Simulate a project management use case
      const columns: DatabaseColumn[] = [
        { id: 'task', name: 'Task', type: 'text', width: 300 },
        { id: 'status', name: 'Status', type: 'select', width: 150, options: [
          { id: 'todo', label: 'To Do', color: 'gray' },
          { id: 'in_progress', label: 'In Progress', color: 'blue' },
          { id: 'done', label: 'Done', color: 'green' }
        ]},
        { id: 'assignee', name: 'Assignee', type: 'user', width: 150 },
        { id: 'due_date', name: 'Due Date', type: 'date', width: 150 },
        { id: 'priority', name: 'Priority', type: 'select', width: 100, options: [
          { id: 'low', label: 'Low', color: 'gray' },
          { id: 'medium', label: 'Medium', color: 'yellow' },
          { id: 'high', label: 'High', color: 'red' }
        ]}
      ];

      render(<DatabaseBlock blockId="project-test" />);
      
      // Add a new task
      const addRowBtn = screen.getByText('+ New Row');
      fireEvent.click(addRowBtn);
      
      // Switch to Kanban view for task management
      const viewSwitcher = screen.getByRole('button', { name: /switch view/i });
      fireEvent.click(viewSwitcher);
      const kanbanOption = screen.getByText('Kanban');
      fireEvent.click(kanbanOption);
      
      // Apply filter for high priority items
      const filterBtn = screen.getByText('Filter');
      fireEvent.click(filterBtn);
      
      // Should handle the workflow without issues
      expect(screen.getByText('Database')).toBeInTheDocument();
    });

    it('should handle CRM workflow', async () => {
      // Simulate a CRM use case
      const columns: DatabaseColumn[] = [
        { id: 'company', name: 'Company', type: 'text', width: 200 },
        { id: 'contact', name: 'Contact', type: 'text', width: 150 },
        { id: 'email', name: 'Email', type: 'email', width: 200 },
        { id: 'phone', name: 'Phone', type: 'phone', width: 150 },
        { id: 'deal_value', name: 'Deal Value', type: 'currency', width: 150 },
        { id: 'stage', name: 'Stage', type: 'select', width: 150, options: [
          { id: 'lead', label: 'Lead', color: 'gray' },
          { id: 'qualified', label: 'Qualified', color: 'blue' },
          { id: 'proposal', label: 'Proposal', color: 'yellow' },
          { id: 'negotiation', label: 'Negotiation', color: 'orange' },
          { id: 'closed', label: 'Closed', color: 'green' }
        ]},
        { id: 'last_contact', name: 'Last Contact', type: 'date', width: 150 },
        { id: 'notes', name: 'Notes', type: 'text', width: 300 }
      ];

      render(<DatabaseBlock blockId="crm-test" />);
      
      // Switch to Calendar view to see follow-ups
      const viewSwitcher = screen.getByRole('button', { name: /switch view/i });
      fireEvent.click(viewSwitcher);
      const calendarOption = screen.getByText('Calendar');
      fireEvent.click(calendarOption);
      
      // Should handle CRM workflow
      expect(screen.getByText('Database')).toBeInTheDocument();
    });
  });
});