import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandPalette } from '~/components/dashboard/CommandPalette';
import type { SearchResult } from '~/components/dashboard/CommandPalette';
import { useNavigate } from '@remix-run/react';

// Mock the useNavigate hook
vi.mock('@remix-run/react', () => ({
  useNavigate: vi.fn(),
}));

// Mock cmdk
vi.mock('cmdk', () => {
  const Command = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  Command.Dialog = ({ children, open, onOpenChange, ...props }: any) => (
    <div role="dialog" data-state={open ? 'open' : 'closed'} {...props}>
      {children}
    </div>
  );
  Command.Root = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  Command.Input = (props: any) => <input {...props} />;
  Command.List = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  Command.Group = ({ children, heading, ...props }: any) => (
    <div {...props}>
      {heading && <div>{heading}</div>}
      {children}
    </div>
  );
  Command.Item = ({ children, onSelect, ...props }: any) => (
    <div role="option" onClick={onSelect} {...props}>
      {children}
    </div>
  );
  Command.Empty = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  
  return { Command };
});

describe('CommandPalette', () => {
  const mockNavigate = vi.fn();
  const mockOnOpenChange = vi.fn();
  const mockOnSearch = vi.fn();
  const mockWorkspaceId = 'workspace-123';

  const mockSearchData = {
    pages: [
      {
        id: 'page-1',
        type: 'page' as const,
        title: 'Test Page',
        description: 'A test page description',
        url: '/app/page/page-1',
        metadata: {
          projectName: 'Test Project',
          lastModified: new Date().toISOString(),
        },
      },
    ],
    projects: [
      {
        id: 'proj-1',
        type: 'project' as const,
        title: 'Test Project',
        description: '5 pages',
        url: '/app/project/proj-1',
      },
    ],
    databases: [
      {
        id: 'db-1',
        type: 'database' as const,
        title: 'Test Database',
        description: 'Database description',
        url: '/app/page/db-1',
        metadata: {
          rowCount: 10,
          projectName: 'Test Project',
        },
      },
    ],
    teamMembers: [
      {
        id: 'user-1',
        type: 'team' as const,
        title: 'John Doe',
        description: 'john@example.com',
        url: '/app/team/user-1',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useNavigate as any).mockReturnValue(mockNavigate);
  });

  it('renders when open', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        searchData={mockSearchData}
      />
    );

    expect(screen.getByPlaceholderText('Search pages, projects, commands...')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const { container } = render(
      <CommandPalette
        open={false}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
      />
    );

    expect(container.querySelector('[role="dialog"]')).toHaveAttribute('data-state', 'closed');
  });

  it('displays recent searches when no query', () => {
    const recentSearches = ['Recent 1', 'Recent 2'];
    
    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        recentSearches={recentSearches}
      />
    );

    expect(screen.getByText('Recent 1')).toBeInTheDocument();
    expect(screen.getByText('Recent 2')).toBeInTheDocument();
  });

  it('displays all search categories', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        searchData={mockSearchData}
      />
    );

    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Databases')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
  });

  it('displays search results from provided data', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        searchData={mockSearchData}
      />
    );

    expect(screen.getByText('Test Page')).toBeInTheDocument();
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('Test Database')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('filters results based on search query', async () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        searchData={mockSearchData}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search pages, projects, commands...');
    fireEvent.change(searchInput, { target: { value: 'Database' } });

    await waitFor(() => {
      expect(screen.getByText('Test Database')).toBeInTheDocument();
      expect(screen.queryByText('Test Page')).not.toBeInTheDocument();
    });
  });

  it('navigates to page when selected', async () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        searchData={mockSearchData}
      />
    );

    const pageItem = screen.getByText('Test Page').closest('[role="option"]');
    if (pageItem) {
      fireEvent.click(pageItem);
    }

    expect(mockNavigate).toHaveBeenCalledWith('/app/page/page-1');
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('executes action when action item is selected', () => {
    const mockAction = vi.fn();
    const actionItem: SearchResult = {
      id: 'action-1',
      type: 'action',
      title: 'Test Action',
      action: mockAction,
    };

    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        searchData={{
          pages: [actionItem as any],
          projects: [],
          databases: [],
          teamMembers: [],
        }}
      />
    );

    const action = screen.getByText('Test Action').closest('[role="option"]');
    if (action) {
      fireEvent.click(action);
    }

    expect(mockAction).toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onSearch when query length > 2', async () => {
    mockOnSearch.mockResolvedValue([
      {
        id: 'search-result-1',
        type: 'page',
        title: 'Search Result',
        url: '/app/page/search-1',
      },
    ]);

    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        onSearch={mockOnSearch}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search pages, projects, commands...');
    fireEvent.change(searchInput, { target: { value: 'test query' } });

    await waitFor(() => {
      expect(mockOnSearch).toHaveBeenCalledWith('test query');
    });
  });

  it('shows loading state during async search', async () => {
    mockOnSearch.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve([]), 100))
    );

    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        onSearch={mockOnSearch}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search pages, projects, commands...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Check for loading spinner
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('displays empty state when no results', async () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        searchData={{
          pages: [],
          projects: [],
          databases: [],
          teamMembers: [],
        }}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search pages, projects, commands...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText('No results found for "nonexistent"')).toBeInTheDocument();
    });
  });

  it('displays keyboard shortcuts in footer', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
      />
    );

    expect(screen.getByText('Navigate')).toBeInTheDocument();
    expect(screen.getByText('Select')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('displays quick actions', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
      />
    );

    expect(screen.getByText('Create New Page')).toBeInTheDocument();
    expect(screen.getByText('Create New Project')).toBeInTheDocument();
    expect(screen.getByText('Workspace Settings')).toBeInTheDocument();
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
  });

  it('displays metadata for pages', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        searchData={mockSearchData}
      />
    );

    // Should show project name for pages
    const pageSection = screen.getByText('Test Page').closest('div')?.parentElement;
    expect(pageSection?.textContent).toContain('Test Project');
  });

  it('displays row count for databases', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        searchData={mockSearchData}
      />
    );

    // Should show row count for databases
    const dbSection = screen.getByText('Test Database').closest('div')?.parentElement;
    expect(dbSection?.textContent).toContain('10 rows');
  });

  it('clears search when closed', () => {
    const { rerender } = render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search pages, projects, commands...') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'test' } });
    expect(searchInput.value).toBe('test');

    // Close and reopen
    rerender(
      <CommandPalette
        open={false}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
      />
    );

    rerender(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
      />
    );

    const newSearchInput = screen.getByPlaceholderText('Search pages, projects, commands...') as HTMLInputElement;
    expect(newSearchInput.value).toBe('');
  });

  it('handles keyboard shortcut to open/close', () => {
    render(
      <CommandPalette
        open={false}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
      />
    );

    // Simulate Cmd+K
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
    });
    document.dispatchEvent(event);

    expect(mockOnOpenChange).toHaveBeenCalledWith(true);
  });

  it('applies custom className', () => {
    const { container } = render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        className="custom-palette-class"
      />
    );

    const dialog = container.querySelector('.custom-palette-class');
    expect(dialog).toBeInTheDocument();
  });

  it('handles search errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockOnSearch.mockRejectedValue(new Error('Search failed'));

    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        onSearch={mockOnSearch}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search pages, projects, commands...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('Search error:', expect.any(Error));
    });

    consoleError.mockRestore();
  });

  it('filters by multiple fields', async () => {
    const searchData = {
      pages: [
        {
          id: 'page-1',
          type: 'page' as const,
          title: 'API Documentation',
          description: 'REST endpoints',
          url: '/app/page/page-1',
        },
        {
          id: 'page-2',
          type: 'page' as const,
          title: 'User Guide',
          description: 'API usage examples',
          url: '/app/page/page-2',
        },
      ],
      projects: [],
      databases: [],
      teamMembers: [],
    };

    render(
      <CommandPalette
        open={true}
        onOpenChange={mockOnOpenChange}
        workspaceId={mockWorkspaceId}
        searchData={searchData}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search pages, projects, commands...');
    
    // Search by title
    fireEvent.change(searchInput, { target: { value: 'API' } });
    
    await waitFor(() => {
      // Both should be visible as one has API in title, other in description
      expect(screen.getByText('API Documentation')).toBeInTheDocument();
      expect(screen.getByText('User Guide')).toBeInTheDocument();
    });
  });
});