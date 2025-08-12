import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Breadcrumbs } from '~/components/navigation/Breadcrumbs';

// Mock useMatches and useLocation
vi.mock('@remix-run/react', async () => {
  const actual = await vi.importActual('@remix-run/react');
  return {
    ...actual,
    useLocation: vi.fn(),
    useMatches: vi.fn(),
    Link: ({ children, to, className }: any) => (
      <a href={to} className={className}>{children}</a>
    ),
  };
});

import { useLocation, useMatches } from '@remix-run/react';

describe('Breadcrumbs Component', () => {
  it('should not render breadcrumbs on home page', () => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/app' } as any);
    vi.mocked(useMatches).mockReturnValue([]);
    
    const { container } = render(
      <MemoryRouter>
        <Breadcrumbs />
      </MemoryRouter>
    );
    
    expect(container.firstChild).toBeNull();
  });

  it('should render breadcrumbs for project page', () => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/app/project/123' } as any);
    vi.mocked(useMatches).mockReturnValue([
      {
        id: 'routes/app',
        pathname: '/app',
        params: {},
        data: { currentWorkspace: { name: 'My Workspace' } },
        handle: undefined,
      },
      {
        id: 'routes/app.project.$projectId',
        pathname: '/app/project/123',
        params: { projectId: '123' },
        data: { project: { name: 'Test Project' } },
        handle: undefined,
      }
    ] as any);
    
    render(
      <MemoryRouter>
        <Breadcrumbs />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });

  it('should render breadcrumbs for settings page', () => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/app/settings' } as any);
    vi.mocked(useMatches).mockReturnValue([
      {
        id: 'routes/app',
        pathname: '/app',
        params: {},
        data: {},
        handle: undefined,
      },
      {
        id: 'routes/app.settings',
        pathname: '/app/settings',
        params: {},
        data: {},
        handle: undefined,
      }
    ] as any);
    
    render(
      <MemoryRouter>
        <Breadcrumbs />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should make last breadcrumb non-clickable', () => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/app/settings' } as any);
    vi.mocked(useMatches).mockReturnValue([
      {
        id: 'routes/app',
        pathname: '/app',
        params: {},
        data: {},
        handle: undefined,
      },
      {
        id: 'routes/app.settings',
        pathname: '/app/settings',
        params: {},
        data: {},
        handle: undefined,
      }
    ] as any);
    
    render(
      <MemoryRouter>
        <Breadcrumbs />
      </MemoryRouter>
    );
    
    const homeLink = screen.getByText('Home').closest('a');
    const settingsElement = screen.getByText('Settings');
    
    expect(homeLink).toHaveAttribute('href', '/app');
    expect(settingsElement.closest('a')).toBeNull(); // Last item should not be a link
    expect(settingsElement.closest('span')).toBeInTheDocument(); // Should be a span
  });
});