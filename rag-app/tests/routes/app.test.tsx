import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loader } from '~/routes/app';
import { getUser } from '~/services/auth/auth.server';
import { prisma } from '~/utils/db.server';

// Mock dependencies
vi.mock('~/services/auth/auth.server');
vi.mock('~/utils/db.server', () => ({
  prisma: {
    userWorkspace: {
      findMany: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
    },
  },
}));

describe('App Layout Route', () => {
  const mockRequest = new Request('http://localhost:3000/app');
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    workspaceId: 'workspace-123',
  };

  const mockUserWorkspaces = [
    {
      workspace: {
        id: 'workspace-123',
        name: 'Test Workspace',
        slug: 'test-workspace',
      },
      role: {
        id: 'role-123',
        name: 'owner',
      },
    },
  ];

  const mockProjects = [
    {
      id: 'project-123',
      name: 'Test Project',
      slug: 'test-project',
      workspaceId: 'workspace-123',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should redirect to login if user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const response = await loader({ request: mockRequest, params: {}, context: {} });
    
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/auth/login');
  });

  it('should redirect to onboarding if user has no workspaces', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser);
    vi.mocked(prisma.userWorkspace.findMany).mockResolvedValue([]);

    const response = await loader({ request: mockRequest, params: {}, context: {} });
    
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/onboarding/workspace');
  });

  it('should load user workspaces and projects when authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser);
    vi.mocked(prisma.userWorkspace.findMany).mockResolvedValue(mockUserWorkspaces);
    vi.mocked(prisma.project.findMany).mockResolvedValue(mockProjects);

    const response = await loader({ request: mockRequest, params: {}, context: {} });
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.user).toEqual(mockUser);
    expect(data.workspaces).toEqual(mockUserWorkspaces);
    expect(data.currentWorkspace).toEqual(mockUserWorkspaces[0].workspace);
    expect(data.projects).toEqual(mockProjects);
  });

  it('should use first workspace if user.workspaceId is not set', async () => {
    const userWithoutWorkspaceId = { ...mockUser, workspaceId: null };
    vi.mocked(getUser).mockResolvedValue(userWithoutWorkspaceId);
    vi.mocked(prisma.userWorkspace.findMany).mockResolvedValue(mockUserWorkspaces);
    vi.mocked(prisma.project.findMany).mockResolvedValue(mockProjects);

    const response = await loader({ request: mockRequest, params: {}, context: {} });
    const data = await response.json();
    
    expect(data.currentWorkspace.id).toBe(mockUserWorkspaces[0].workspace.id);
  });

  it('should fetch projects for the current workspace', async () => {
    vi.mocked(getUser).mockResolvedValue(mockUser);
    vi.mocked(prisma.userWorkspace.findMany).mockResolvedValue(mockUserWorkspaces);
    vi.mocked(prisma.project.findMany).mockResolvedValue(mockProjects);

    await loader({ request: mockRequest, params: {}, context: {} });
    
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-123' },
      orderBy: { name: 'asc' },
      take: 10,
    });
  });
});