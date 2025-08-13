import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  WorkspaceOperations, 
  WorkspaceNotFoundError,
  WorkspaceError,
  createWorkspaceOperations 
} from '~/lib/workspace-operations';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(),
};

describe('WorkspaceOperations - Read Operations', () => {
  let workspaceOps: WorkspaceOperations;
  
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceOps = new WorkspaceOperations(mockSupabase as any);
  });

  describe('getWorkspace', () => {
    it('should fetch a workspace by ID successfully', async () => {
      const mockWorkspace = {
        id: 'ws-123',
        name: 'Test Workspace',
        slug: 'test-workspace',
        description: 'A test workspace',
        owner_id: 'user-123',
        settings: { defaultRole: 'member' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockWorkspace,
              error: null,
            }),
          }),
        }),
      });

      const result = await workspaceOps.getWorkspace('ws-123');

      expect(result).toEqual({
        id: 'ws-123',
        name: 'Test Workspace',
        slug: 'test-workspace',
        description: 'A test workspace',
        ownerId: 'user-123',
        settings: { defaultRole: 'member' },
        templateId: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        archivedAt: undefined,
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('workspaces');
    });

    it('should throw WorkspaceNotFoundError when workspace does not exist', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'Not found' },
            }),
          }),
        }),
      });

      await expect(workspaceOps.getWorkspace('ws-404')).rejects.toThrow(
        WorkspaceNotFoundError
      );
    });

    it('should throw WorkspaceError for other database errors', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST000', message: 'Database error' },
            }),
          }),
        }),
      });

      await expect(workspaceOps.getWorkspace('ws-123')).rejects.toThrow(
        WorkspaceError
      );
    });
  });

  describe('getWorkspaces', () => {
    it('should fetch all workspaces for a user', async () => {
      const mockData = [
        {
          workspace: {
            id: 'ws-1',
            name: 'Workspace 1',
            slug: 'workspace-1',
            owner_id: 'user-123',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
        {
          workspace: {
            id: 'ws-2',
            name: 'Workspace 2',
            slug: 'workspace-2',
            owner_id: 'user-456',
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockData,
              error: null,
            }),
          }),
        }),
      });

      const result = await workspaceOps.getWorkspaces('user-123');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('ws-1');
      expect(result[1].id).toBe('ws-2');
      expect(mockSupabase.from).toHaveBeenCalledWith('user_workspaces');
    });

    it('should return empty array when user has no workspaces', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      });

      const result = await workspaceOps.getWorkspaces('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('getWorkspaceBySlug', () => {
    it('should fetch a workspace by slug', async () => {
      const mockWorkspace = {
        id: 'ws-123',
        name: 'Test Workspace',
        slug: 'test-workspace',
        owner_id: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockWorkspace,
              error: null,
            }),
          }),
        }),
      });

      const result = await workspaceOps.getWorkspaceBySlug('test-workspace');

      expect(result.slug).toBe('test-workspace');
      expect(result.id).toBe('ws-123');
    });
  });

  describe('checkUserAccess', () => {
    it('should return true when user has access', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'access-123' },
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await workspaceOps.checkUserAccess('ws-123', 'user-123');

      expect(result).toBe(true);
    });

    it('should return false when user has no access', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116', message: 'Not found' },
              }),
            }),
          }),
        }),
      });

      const result = await workspaceOps.checkUserAccess('ws-123', 'user-456');

      expect(result).toBe(false);
    });
  });

  describe('getWorkspaceMembers', () => {
    it('should fetch workspace members with user and role info', async () => {
      const mockMembers = [
        {
          id: 'member-1',
          user_id: 'user-123',
          role_id: 'role-owner',
          joined_at: '2024-01-01T00:00:00Z',
          users: { id: 'user-123', email: 'owner@example.com', name: 'Owner' },
          roles: { id: 'role-owner', name: 'owner', display_name: 'Owner' },
        },
        {
          id: 'member-2',
          user_id: 'user-456',
          role_id: 'role-member',
          joined_at: '2024-01-02T00:00:00Z',
          users: { id: 'user-456', email: 'member@example.com', name: 'Member' },
          roles: { id: 'role-member', name: 'member', display_name: 'Member' },
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockMembers,
              error: null,
            }),
          }),
        }),
      });

      const result = await workspaceOps.getWorkspaceMembers('ws-123');

      expect(result).toHaveLength(2);
      expect(result[0].users.email).toBe('owner@example.com');
      expect(result[1].roles.display_name).toBe('Member');
    });
  });

  describe('getWorkspaceStats', () => {
    it('should fetch workspace statistics', async () => {
      // Mock project count
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            count: 5,
            error: null,
          }),
        }),
      });

      // Mock page count
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            count: 25,
            error: null,
          }),
        }),
      });

      // Mock member count
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            count: 3,
            error: null,
          }),
        }),
      });

      const result = await workspaceOps.getWorkspaceStats('ws-123');

      expect(result).toEqual({
        projects: 5,
        pages: 25,
        members: 3,
      });
    });

    it('should handle zero counts gracefully', async () => {
      // Mock all counts as zero
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            count: 0,
            error: null,
          }),
        }),
      });

      const result = await workspaceOps.getWorkspaceStats('ws-123');

      expect(result).toEqual({
        projects: 0,
        pages: 0,
        members: 0,
      });
    });
  });

  describe('getWorkspaceTemplates', () => {
    it('should fetch public templates when no workspace ID provided', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          name: 'Project Management',
          description: 'Template for project management',
          is_public: true,
          use_count: 100,
        },
        {
          id: 'template-2',
          name: 'Documentation',
          description: 'Template for documentation',
          is_public: true,
          use_count: 50,
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockTemplates,
              error: null,
            }),
          }),
        }),
      });

      const result = await workspaceOps.getWorkspaceTemplates();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Project Management');
    });

    it('should fetch workspace-specific and public templates when workspace ID provided', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          name: 'Custom Template',
          workspace_id: 'ws-123',
          is_public: false,
        },
        {
          id: 'template-2',
          name: 'Public Template',
          is_public: true,
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockTemplates,
              error: null,
            }),
          }),
        }),
      });

      const result = await workspaceOps.getWorkspaceTemplates('ws-123');

      expect(result).toHaveLength(2);
      expect(mockSupabase.from).toHaveBeenCalledWith('workspace_templates');
    });
  });
});