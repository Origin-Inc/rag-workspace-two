import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BlockEditor } from './BlockEditor';

// Mock react-window components
vi.mock('react-window', () => ({
  VariableSizeList: vi.fn(({ children, itemCount }) => {
    return <div data-testid="virtual-list">
      {Array.from({ length: itemCount }).map((_, index) => 
        children({ index, style: {} })
      )}
    </div>;
  }),
}));

vi.mock('react-virtualized-auto-sizer', () => ({
  default: vi.fn(({ children }) => 
    children({ height: 600, width: 800 })
  ),
}));

describe('BlockEditor - Multi-block Selection', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  describe('Basic selection', () => {
    it('should select a single block on click', async () => {
      const onChange = vi.fn();
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
            { id: '3', type: 'paragraph', content: 'Block 3' },
          ]}
          onChange={onChange}
        />
      );

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      await user.click(blocks[0]);

      expect(blocks[0].closest('.group')).toHaveClass('bg-blue-50');
    });

    it('should support multi-select with Cmd/Ctrl+Click', async () => {
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
            { id: '3', type: 'paragraph', content: 'Block 3' },
          ]}
        />
      );

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      
      // Select first block
      await user.click(blocks[0]);
      
      // Multi-select third block
      await user.click(blocks[2], { ctrlKey: true });

      expect(blocks[0].closest('.group')).toHaveClass('bg-blue-50');
      expect(blocks[2].closest('.group')).toHaveClass('bg-blue-50');
      expect(blocks[1].closest('.group')).not.toHaveClass('bg-blue-50');
    });

    it('should support range selection with Shift+Click', async () => {
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
            { id: '3', type: 'paragraph', content: 'Block 3' },
            { id: '4', type: 'paragraph', content: 'Block 4' },
          ]}
        />
      );

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      
      // Select first block
      await user.click(blocks[0]);
      
      // Range select to third block
      await user.click(blocks[2], { shiftKey: true });

      // All blocks from 0 to 2 should be selected
      expect(blocks[0].closest('.group')).toHaveClass('bg-blue-50');
      expect(blocks[1].closest('.group')).toHaveClass('bg-blue-50');
      expect(blocks[2].closest('.group')).toHaveClass('bg-blue-50');
      expect(blocks[3].closest('.group')).not.toHaveClass('bg-blue-50');
    });
  });

  describe('Keyboard selection', () => {
    it('should select all blocks with Cmd/Ctrl+A', async () => {
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
            { id: '3', type: 'paragraph', content: 'Block 3' },
          ]}
        />
      );

      // Press Cmd+A
      fireEvent.keyDown(window, { key: 'a', metaKey: true });

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      blocks.forEach(block => {
        expect(block.closest('.group')).toHaveClass('bg-blue-50');
      });

      // Check selection counter
      expect(screen.getByText(/3 selected/)).toBeInTheDocument();
    });

    it('should navigate selection with arrow keys', async () => {
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
            { id: '3', type: 'paragraph', content: 'Block 3' },
          ]}
        />
      );

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      
      // Select first block
      await user.click(blocks[0]);
      
      // Navigate down
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      
      expect(blocks[0].closest('.group')).not.toHaveClass('bg-blue-50');
      expect(blocks[1].closest('.group')).toHaveClass('bg-blue-50');
      
      // Navigate up
      fireEvent.keyDown(window, { key: 'ArrowUp' });
      
      expect(blocks[0].closest('.group')).toHaveClass('bg-blue-50');
      expect(blocks[1].closest('.group')).not.toHaveClass('bg-blue-50');
    });

    it('should extend selection with Shift+Arrow keys', async () => {
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
            { id: '3', type: 'paragraph', content: 'Block 3' },
          ]}
        />
      );

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      
      // Select first block
      await user.click(blocks[0]);
      
      // Extend selection down
      fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });
      
      expect(blocks[0].closest('.group')).toHaveClass('bg-blue-50');
      expect(blocks[1].closest('.group')).toHaveClass('bg-blue-50');
      
      // Extend selection down again
      fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });
      
      expect(blocks[0].closest('.group')).toHaveClass('bg-blue-50');
      expect(blocks[1].closest('.group')).toHaveClass('bg-blue-50');
      expect(blocks[2].closest('.group')).toHaveClass('bg-blue-50');
    });

    it('should clear selection with Escape', async () => {
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
          ]}
        />
      );

      // Select all
      fireEvent.keyDown(window, { key: 'a', metaKey: true });
      
      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      blocks.forEach(block => {
        expect(block.closest('.group')).toHaveClass('bg-blue-50');
      });
      
      // Clear with Escape
      fireEvent.keyDown(window, { key: 'Escape' });
      
      blocks.forEach(block => {
        expect(block.closest('.group')).not.toHaveClass('bg-blue-50');
      });
    });
  });

  describe('Bulk operations', () => {
    it('should delete multiple selected blocks', async () => {
      const onChange = vi.fn();
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
            { id: '3', type: 'paragraph', content: 'Block 3' },
            { id: '4', type: 'paragraph', content: 'Block 4' },
          ]}
          onChange={onChange}
        />
      );

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      
      // Select blocks 2 and 3
      await user.click(blocks[1]);
      await user.click(blocks[2], { ctrlKey: true });
      
      // Delete
      fireEvent.keyDown(window, { key: 'Delete' });
      
      await waitFor(() => {
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
        expect(lastCall[0]).toHaveLength(2); // Only 2 blocks left
      });
    });

    it('should not delete all blocks', async () => {
      const onChange = vi.fn();
      render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
          ]}
          onChange={onChange}
        />
      );

      // Select all
      fireEvent.keyDown(window, { key: 'a', metaKey: true });
      
      // Try to delete all
      fireEvent.keyDown(window, { key: 'Delete' });
      
      // Should keep at least one block
      await waitFor(() => {
        if (onChange.mock.calls.length > 0) {
          const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
          expect(lastCall[0].length).toBeGreaterThan(0);
        }
      });
    });

    it('should move selected blocks up', async () => {
      const onChange = vi.fn();
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
            { id: '3', type: 'paragraph', content: 'Block 3' },
          ]}
          onChange={onChange}
        />
      );

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      
      // Select block 2
      await user.click(blocks[1]);
      
      // Move up
      fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true, shiftKey: true });
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });

    it('should move selected blocks down', async () => {
      const onChange = vi.fn();
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
            { id: '3', type: 'paragraph', content: 'Block 3' },
          ]}
          onChange={onChange}
        />
      );

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      
      // Select block 1
      await user.click(blocks[0]);
      
      // Move down
      fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true, shiftKey: true });
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });

    it('should show bulk action buttons when multiple blocks selected', async () => {
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
            { id: '3', type: 'paragraph', content: 'Block 3' },
          ]}
        />
      );

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      
      // Select multiple blocks
      await user.click(blocks[0]);
      await user.click(blocks[1], { ctrlKey: true });
      
      // Check for bulk action buttons
      expect(screen.getByTitle(/Move selected blocks up/)).toBeInTheDocument();
      expect(screen.getByTitle(/Move selected blocks down/)).toBeInTheDocument();
      expect(screen.getByTitle(/Delete selected blocks/)).toBeInTheDocument();
    });
  });

  describe('Visual indicators', () => {
    it('should show selection count in toolbar', async () => {
      render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
            { id: '3', type: 'paragraph', content: 'Block 3' },
          ]}
        />
      );

      // Initially no selection shown
      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      
      // Select all
      fireEvent.keyDown(window, { key: 'a', metaKey: true });
      
      // Should show selection count
      expect(screen.getByText(/3 selected/)).toBeInTheDocument();
    });

    it('should show blue border on selected blocks', async () => {
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
          ]}
        />
      );

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      
      // Select first block
      await user.click(blocks[0]);
      
      const selectedBlock = blocks[0].closest('.group');
      expect(selectedBlock).toHaveClass('border-l-2');
      expect(selectedBlock).toHaveClass('border-blue-400');
    });
  });

  describe('Toggle selection', () => {
    it('should toggle selection on multi-click', async () => {
      const { container } = render(
        <BlockEditor 
          initialBlocks={[
            { id: '1', type: 'paragraph', content: 'Block 1' },
            { id: '2', type: 'paragraph', content: 'Block 2' },
          ]}
        />
      );

      const blocks = container.querySelectorAll('[data-testid^="block-"]');
      
      // Select first block
      await user.click(blocks[0]);
      expect(blocks[0].closest('.group')).toHaveClass('bg-blue-50');
      
      // Toggle selection off
      await user.click(blocks[0], { ctrlKey: true });
      expect(blocks[0].closest('.group')).not.toHaveClass('bg-blue-50');
      
      // Toggle selection on again
      await user.click(blocks[0], { ctrlKey: true });
      expect(blocks[0].closest('.group')).toHaveClass('bg-blue-50');
    });
  });
});