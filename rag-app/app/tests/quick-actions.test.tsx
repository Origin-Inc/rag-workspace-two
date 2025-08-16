import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QuickActions } from '~/components/dashboard/QuickActions';
import type { RecentDocument } from '~/components/dashboard/QuickActions';

// Mock the date utility
vi.mock('~/utils/date', () => ({
  formatDistanceToNow: vi.fn((date) => '2 hours ago'),
}));

const mockRecentDocuments: RecentDocument[] = [
  {
    id: 'doc-1',
    title: 'Meeting Notes',
    lastAccessed: new Date('2024-01-14T10:00:00'),
    projectId: 'proj-1',
    projectName: 'Q1 Planning',
    type: 'page',
  },
  {
    id: 'doc-2',
    title: 'API Documentation',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    lastAccessed: new Date('2024-01-14T09:00:00'),
    projectId: 'proj-2',
    projectName: 'Engineering Docs',
    type: 'page',
  },
  {
    id: 'doc-3',
    title: 'Task Database',
    lastAccessed: new Date('2024-01-14T08:00:00'),
    projectId: 'proj-1',
    projectName: 'Q1 Planning',
    type: 'database',
  },
  {
    id: 'doc-4',
    title: 'Design Canvas',
    lastAccessed: new Date('2024-01-13T16:00:00'),
    projectId: 'proj-3',
    projectName: 'Design System',
    type: 'canvas',
  },
];

const renderComponent = (props = {}) => {
  return render(
    <BrowserRouter>
      <QuickActions
        workspaceSlug="test-workspace"
        {...props}
      />
    </BrowserRouter>
  );
};

describe('QuickActions', () => {
  it('renders all quick action buttons', () => {
    renderComponent();
    
    expect(screen.getByText('New Page')).toBeInTheDocument();
    expect(screen.getByText('New Project')).toBeInTheDocument();
    expect(screen.getByText('From Template')).toBeInTheDocument();
    expect(screen.getByText('Import')).toBeInTheDocument();
    expect(screen.getByText('Invite Team')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('displays action descriptions', () => {
    renderComponent();
    
    expect(screen.getByText('Create a blank page')).toBeInTheDocument();
    expect(screen.getByText('Start a new project')).toBeInTheDocument();
    expect(screen.getByText('Use a template')).toBeInTheDocument();
    expect(screen.getByText('Import documents')).toBeInTheDocument();
    expect(screen.getByText('Add team members')).toBeInTheDocument();
    expect(screen.getByText('View analytics')).toBeInTheDocument();
  });

  it('renders as links when no onClick handlers provided', () => {
    renderComponent();
    
    const newPageLink = screen.getByText('New Page').closest('a');
    expect(newPageLink).toHaveAttribute('href', '/app/pages/new');
    
    const newProjectLink = screen.getByText('New Project').closest('a');
    expect(newProjectLink).toHaveAttribute('href', '/app/projects/new');
    
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveAttribute('href', '/workspace/test-workspace/dashboard');
  });

  it('renders as buttons when onClick handlers provided', () => {
    const onCreatePage = vi.fn();
    const onCreateProject = vi.fn();
    
    renderComponent({
      onCreatePage,
      onCreateProject,
    });
    
    const newPageButton = screen.getByText('New Page').closest('button');
    expect(newPageButton).toBeInTheDocument();
    expect(newPageButton?.tagName).toBe('BUTTON');
    
    fireEvent.click(newPageButton!);
    expect(onCreatePage).toHaveBeenCalled();
  });

  it('displays recent documents section when documents provided', () => {
    renderComponent({ recentDocuments: mockRecentDocuments });
    
    expect(screen.getByText('Recent Documents')).toBeInTheDocument();
    expect(screen.getByText('Meeting Notes')).toBeInTheDocument();
    expect(screen.getByText('API Documentation')).toBeInTheDocument();
    expect(screen.getByText('Task Database')).toBeInTheDocument();
    expect(screen.getByText('Design Canvas')).toBeInTheDocument();
  });

  it('shows project names for recent documents', () => {
    renderComponent({ recentDocuments: mockRecentDocuments });
    
    // Use getAllByText since Q1 Planning appears twice (for two documents in same project)
    const q1PlanningElements = screen.getAllByText('Q1 Planning');
    expect(q1PlanningElements).toHaveLength(2); // Two documents in Q1 Planning project
    
    expect(screen.getByText('Engineering Docs')).toBeInTheDocument();
    expect(screen.getByText('Design System')).toBeInTheDocument();
  });

  it('displays thumbnail when available', () => {
    const { container } = renderComponent({ recentDocuments: mockRecentDocuments });
    
    const thumbnail = container.querySelector('img[src="https://example.com/thumb.jpg"]');
    expect(thumbnail).toBeInTheDocument();
  });

  it('shows placeholder icon when no thumbnail', () => {
    renderComponent({ recentDocuments: [mockRecentDocuments[0]] });
    
    // Should have an icon container for doc without thumbnail
    const iconContainer = screen.getByText('Meeting Notes')
      .closest('a')
      ?.querySelector('.bg-gray-100');
    expect(iconContainer).toBeInTheDocument();
  });

  it('limits recent documents to 6 items', () => {
    const manyDocs = Array.from({ length: 10 }, (_, i) => ({
      id: `doc-${i}`,
      title: `Document ${i}`,
      lastAccessed: new Date(),
      projectId: 'proj-1',
      projectName: 'Project',
      type: 'page' as const,
    }));
    
    renderComponent({ recentDocuments: manyDocs });
    
    // Should only show first 6
    expect(screen.getByText('Document 0')).toBeInTheDocument();
    expect(screen.getByText('Document 5')).toBeInTheDocument();
    expect(screen.queryByText('Document 6')).not.toBeInTheDocument();
  });

  it('shows empty state when no recent documents', () => {
    renderComponent({ recentDocuments: [] });
    
    expect(screen.queryByText('Recent Documents')).not.toBeInTheDocument();
  });

  it('displays "View all" link for recent documents', () => {
    renderComponent({ recentDocuments: mockRecentDocuments });
    
    const viewAllLink = screen.getByText('View all');
    expect(viewAllLink).toHaveAttribute('href', '/app/pages');
  });

  it('shows time since last access for documents', () => {
    renderComponent({ recentDocuments: mockRecentDocuments });
    
    // formatDistanceToNow is mocked to return '2 hours ago'
    const timeElements = screen.getAllByText('2 hours ago');
    expect(timeElements.length).toBe(4); // One for each document
  });

  it('handles untitled documents gracefully', () => {
    const untitledDoc: RecentDocument = {
      id: 'doc-untitled',
      title: null,
      lastAccessed: new Date(),
      projectId: 'proj-1',
      projectName: 'Project',
    };
    
    renderComponent({ recentDocuments: [untitledDoc] });
    
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('displays productivity tip', () => {
    renderComponent();
    
    expect(screen.getByText('Productivity Tip')).toBeInTheDocument();
    expect(screen.getByText(/to quickly search/)).toBeInTheDocument();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });

  it('applies custom className when provided', () => {
    const { container } = renderComponent({ className: 'custom-class' });
    
    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('custom-class');
  });

  it('uses different icons for different document types', () => {
    renderComponent({ recentDocuments: mockRecentDocuments });
    
    // Each document type should render (database, canvas, page types present)
    const links = screen.getAllByRole('link');
    const documentLinks = links.filter(link => 
      link.getAttribute('href')?.startsWith('/app/page/')
    );
    
    expect(documentLinks).toHaveLength(4);
  });

  it('calls all provided callback functions', () => {
    const callbacks = {
      onCreatePage: vi.fn(),
      onCreateProject: vi.fn(),
      onOpenTemplateGallery: vi.fn(),
      onImportContent: vi.fn(),
      onInviteTeam: vi.fn(),
    };
    
    renderComponent(callbacks);
    
    fireEvent.click(screen.getByText('New Page').closest('button')!);
    expect(callbacks.onCreatePage).toHaveBeenCalled();
    
    fireEvent.click(screen.getByText('New Project').closest('button')!);
    expect(callbacks.onCreateProject).toHaveBeenCalled();
    
    fireEvent.click(screen.getByText('From Template').closest('button')!);
    expect(callbacks.onOpenTemplateGallery).toHaveBeenCalled();
    
    fireEvent.click(screen.getByText('Import').closest('button')!);
    expect(callbacks.onImportContent).toHaveBeenCalled();
    
    fireEvent.click(screen.getByText('Invite Team').closest('button')!);
    expect(callbacks.onInviteTeam).toHaveBeenCalled();
  });

  it('creates correct links for document navigation', () => {
    renderComponent({ recentDocuments: mockRecentDocuments });
    
    const meetingNotesLink = screen.getByText('Meeting Notes').closest('a');
    expect(meetingNotesLink).toHaveAttribute('href', '/app/page/doc-1');
    
    const apiDocsLink = screen.getByText('API Documentation').closest('a');
    expect(apiDocsLink).toHaveAttribute('href', '/app/page/doc-2');
  });
});