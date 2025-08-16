import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { WorkspaceOverview } from '~/components/dashboard/WorkspaceOverview';

// Mock the date utility
vi.mock('~/utils/date', () => ({
  formatDistanceToNow: vi.fn((date) => '2 days ago'),
}));

const mockWorkspace = {
  id: 'ws-123',
  name: 'Test Workspace',
  slug: 'test-workspace',
  description: 'A test workspace for unit testing',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-15'),
};

const mockRecentPages = [
  {
    id: 'page-1',
    title: 'Getting Started',
    updatedAt: new Date('2024-01-14'),
    project: {
      id: 'proj-1',
      name: 'Documentation',
    },
  },
  {
    id: 'page-2',
    title: 'API Reference',
    updatedAt: new Date('2024-01-13'),
    project: {
      id: 'proj-2',
      name: 'API Docs',
    },
    thumbnailUrl: 'https://example.com/thumb.jpg',
  },
];

const mockRecentProjects = [
  {
    id: 'proj-1',
    name: 'Documentation',
    description: 'Main documentation project',
    updatedAt: new Date('2024-01-14'),
    _count: {
      pages: 15,
    },
  },
  {
    id: 'proj-2',
    name: 'API Docs',
    updatedAt: new Date('2024-01-13'),
    _count: {
      pages: 8,
    },
  },
];

const mockStats = {
  totalProjects: 5,
  totalPages: 42,
  totalMembers: 3,
  storageUsed: 536870912, // 512 MB
  aiCreditsUsed: 2500,
  aiCreditsLimit: 10000,
};

const renderComponent = (props = {}) => {
  return render(
    <BrowserRouter>
      <WorkspaceOverview
        workspace={mockWorkspace}
        recentPages={mockRecentPages}
        recentProjects={mockRecentProjects}
        stats={mockStats}
        {...props}
      />
    </BrowserRouter>
  );
};

describe('WorkspaceOverview', () => {
  it('renders workspace header with name and slug', () => {
    renderComponent();
    
    expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    expect(screen.getByText('/test-workspace')).toBeInTheDocument();
    expect(screen.getByText('A test workspace for unit testing')).toBeInTheDocument();
  });

  it('displays workspace creation and update times', () => {
    renderComponent();
    
    expect(screen.getByText(/Created.*ago/)).toBeInTheDocument();
    expect(screen.getByText(/Updated.*ago/)).toBeInTheDocument();
  });

  it('shows all quick stats correctly', () => {
    renderComponent();
    
    // Projects stat
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    
    // Pages stat
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    
    // Members stat
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    
    // Storage stat
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByText('512 MB')).toBeInTheDocument();
    
    // AI Credits stat
    expect(screen.getByText('AI Credits')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument(); // 2500/10000 = 25%
    expect(screen.getByText('used')).toBeInTheDocument();
  });

  it('displays recent pages with correct information', () => {
    renderComponent();
    
    expect(screen.getByText('Recent Pages')).toBeInTheDocument();
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('in Documentation')).toBeInTheDocument();
    expect(screen.getByText('API Reference')).toBeInTheDocument();
    expect(screen.getByText('in API Docs')).toBeInTheDocument();
  });

  it('shows thumbnail for pages that have one', () => {
    const { container } = renderComponent();
    
    const thumbnail = container.querySelector('img');
    expect(thumbnail).toBeTruthy();
    expect(thumbnail).toHaveAttribute('src', 'https://example.com/thumb.jpg');
  });

  it('displays active projects with page counts', () => {
    renderComponent();
    
    expect(screen.getByText('Active Projects')).toBeInTheDocument();
    expect(screen.getByText('Documentation')).toBeInTheDocument();
    expect(screen.getByText('Main documentation project')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument(); // Page count
    
    expect(screen.getByText('API Docs')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument(); // Page count
  });

  it('shows empty states when no data', () => {
    renderComponent({
      recentPages: [],
      recentProjects: [],
    });
    
    expect(screen.getByText('No pages yet')).toBeInTheDocument();
    expect(screen.getByText('Create your first page')).toBeInTheDocument();
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByText('Create your first project')).toBeInTheDocument();
  });

  it('renders quick actions bar with all buttons', () => {
    renderComponent();
    
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText('New Page')).toBeInTheDocument();
    expect(screen.getByText('New Project')).toBeInTheDocument();
    expect(screen.getByText('Import')).toBeInTheDocument();
    expect(screen.getByText('Invite Team')).toBeInTheDocument();
  });

  it('has correct links for navigation', () => {
    renderComponent();
    
    const settingsLink = screen.getByText('Settings');
    expect(settingsLink).toHaveAttribute('href', '/workspace/test-workspace/settings');
    
    const viewAllPagesLink = screen.getAllByText('View all')[0];
    expect(viewAllPagesLink.closest('a')).toHaveAttribute('href', '/app/pages');
    
    const viewAllProjectsLink = screen.getAllByText('View all')[1];
    expect(viewAllProjectsLink.closest('a')).toHaveAttribute('href', '/app/projects');
  });

  it('calculates and displays AI credits percentage correctly', () => {
    renderComponent();
    
    // 2500/10000 = 25%
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('shows warning color for high credit usage', () => {
    renderComponent({
      stats: {
        ...mockStats,
        aiCreditsUsed: 8500,
        aiCreditsLimit: 10000,
      },
    });
    
    // 8500/10000 = 85% (should show red)
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('formats storage size correctly', () => {
    renderComponent({
      stats: {
        ...mockStats,
        storageUsed: 1073741824, // 1 GB
      },
    });
    
    expect(screen.getByText('1 GB')).toBeInTheDocument();
  });

  it('limits displayed items to configured maximums', () => {
    const manyPages = Array.from({ length: 10 }, (_, i) => ({
      id: `page-${i}`,
      title: `Page ${i}`,
      updatedAt: new Date(),
      project: { id: 'proj-1', name: 'Project' },
    }));
    
    const manyProjects = Array.from({ length: 10 }, (_, i) => ({
      id: `proj-${i}`,
      name: `Project ${i}`,
      updatedAt: new Date(),
      _count: { pages: 5 },
    }));
    
    renderComponent({
      recentPages: manyPages,
      recentProjects: manyProjects,
    });
    
    // Should only show 5 pages
    const pageLinks = screen.getAllByText(/^Page \d$/);
    expect(pageLinks).toHaveLength(5);
    
    // Should only show 4 projects
    const projectLinks = screen.getAllByText(/^Project \d$/);
    expect(projectLinks).toHaveLength(4);
  });
});