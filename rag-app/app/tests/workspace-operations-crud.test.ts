import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  WorkspaceOperations, 
  WorkspaceError,
  WorkspaceAccessDeniedError,
  createWorkspaceOperations 
} from '~/lib/workspace-operations';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(),
};

describe('WorkspaceOperations - CRUD Operations', () => {
  let workspaceOps: WorkspaceOperations;
  
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceOps = new WorkspaceOperations(mockSupabase as any);
  });

  describe('createWorkspace', () => {
    it('should create a new workspace successfully', async () => {
      const mockWorkspace = {
        id: 'ws-new-123',
        name: 'New Workspace',
        slug: 'new-workspace',
        description: 'A brand new workspace',
        owner_id: 'user-123',
        settings: { defaultRole: 'member' },
        template_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockOwnerRole = {
        id: 'role-owner',
        name: 'owner',
      };

      // Mock slug check (no existing workspace)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      // Mock workspace insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockWorkspace,
              error: null,
            }),
          }),
        }),
      });

      // Mock get owner role
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockOwnerRole,
              error: null,
            }),
          }),
        }),
      });

      // Mock user_workspaces insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({
          data: { id: 'member-123' },
          error: null,
        }),
      });

      const result = await workspaceOps.createWorkspace(
        {
          name: 'New Workspace',
          description: 'A brand new workspace',
          settings: { defaultRole: 'member' },
        },
        'user-123'
      );

      expect(result).toEqual({
        id: 'ws-new-123',
        name: 'New Workspace',
        slug: 'new-workspace',
        description: 'A brand new workspace',
        ownerId: 'user-123',
        settings: { defaultRole: 'member' },
        templateId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        archivedAt: undefined,
      });
    });

    it('should generate unique slug when name conflicts exist', async () => {
      const mockWorkspace = {
        id: 'ws-new-456',
        name: 'Test Workspace',
        slug: 'test-workspace-2',
        owner_id: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock first slug check (existing workspace found)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'existing-ws' },
              error: null,
            }),
          }),
        }),
      });

      // Mock second slug check (existing workspace found)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'existing-ws-2' },
              error: null,
            }),
          }),
        }),
      });

      // Mock third slug check (no existing workspace)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      // Mock workspace insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockWorkspace,
              error: null,
            }),
          }),
        }),
      });

      // Mock get owner role
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'role-owner' },
              error: null,
            }),
          }),
        }),
      });

      // Mock user_workspaces insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({
          data: { id: 'member-456' },
          error: null,
        }),
      });

      const result = await workspaceOps.createWorkspace(
        { name: 'Test Workspace' },
        'user-123'
      );

      expect(result.slug).toBe('test-workspace-2');
    });

    it('should apply template when templateId is provided', async () => {
      const mockTemplate = {
        id: 'template-123',
        name: 'Project Template',
        settings: { aiEnabled: true },
        default_pages: [{ title: 'Welcome' }],
        use_count: 5,
      };

      // Mock slug check
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      // Mock workspace insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'ws-123', name: 'Workspace', slug: 'workspace', owner_id: 'user-123' },
              error: null,
            }),
          }),
        }),
      });

      // Mock get owner role
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'role-owner' },
              error: null,
            }),
          }),
        }),
      });

      // Mock user_workspaces insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({
          error: null,
        }),
      });

      // Mock template fetch
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockTemplate,
              error: null,
            }),
          }),
        }),
      });

      // Mock template use count update
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: null,
          }),
        }),
      });

      // Mock workspace settings update
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: null,
          }),
        }),
      });

      await workspaceOps.createWorkspace(
        {
          name: 'Workspace',
          templateId: 'template-123',
        },
        'user-123'
      );

      // Verify template was fetched
      expect(mockSupabase.from).toHaveBeenCalledWith('workspace_templates');
    });

    it('should rollback workspace creation if member addition fails', async () => {
      // Mock slug check
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      // Mock workspace insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'ws-123', name: 'Workspace', slug: 'workspace', owner_id: 'user-123' },
              error: null,
            }),
          }),
        }),
      });

      // Mock get owner role
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'role-owner' },
              error: null,
            }),
          }),
        }),
      });

      // Mock user_workspaces insert failure
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({
          error: { message: 'Failed to add member' },
        }),
      });

      // Mock workspace deletion (rollback)
      mockSupabase.from.mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: null,
          }),
        }),
      });

      await expect(
        workspaceOps.createWorkspace({ name: 'Workspace' }, 'user-123')
      ).rejects.toThrow('Failed to add owner to workspace');

      // Verify rollback was attempted
      expect(mockSupabase.from).toHaveBeenCalledWith('workspaces');
    });
  });

  describe('updateWorkspace', () => {
    it('should update workspace successfully', async () => {
      const updatedWorkspace = {
        id: 'ws-123',
        name: 'Updated Workspace',
        description: 'Updated description',
        settings: { defaultRole: 'editor', aiEnabled: true },
        owner_id: 'user-123',
        updated_at: '2024-01-02T00:00:00Z',
      };

      // Mock checkUserAccess - user has access
      mockSupabase.from.mockReturnValueOnce({
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

      // Mock get existing workspace settings
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { settings: { defaultRole: 'member' } },
              error: null,
            }),
          }),
        }),
      });

      // Mock workspace update
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: updatedWorkspace,
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await workspaceOps.updateWorkspace(
        'ws-123',
        {
          name: 'Updated Workspace',
          description: 'Updated description',
          settings: { aiEnabled: true },
        },
        'user-123'
      );

      expect(result.name).toBe('Updated Workspace');
      expect(result.description).toBe('Updated description');
      expect(result.settings).toEqual({ defaultRole: 'editor', aiEnabled: true });
    });

    it('should throw AccessDeniedError when user lacks permission', async () => {
      // Mock checkUserAccess - user has no access
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        }),
      });

      await expect(
        workspaceOps.updateWorkspace('ws-123', { name: 'New Name' }, 'user-456')
      ).rejects.toThrow(WorkspaceAccessDeniedError);
    });

    it('should merge settings with existing ones', async () => {
      // Mock checkUserAccess
      mockSupabase.from.mockReturnValueOnce({
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

      // Mock get existing settings
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { 
                settings: { 
                  defaultRole: 'member',
                  timezone: 'UTC',
                  features: { aiEnabled: true }
                } 
              },
              error: null,
            }),
          }),
        }),
      });

      // Mock workspace update
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { 
                id: 'ws-123',
                settings: { 
                  defaultRole: 'editor',
                  timezone: 'UTC',
                  features: { aiEnabled: true, ragEnabled: true }
                }
              },
              error: null,
            }),
          }),
        }),
      });

      mockSupabase.from.mockReturnValueOnce({
        update: updateMock,
      });

      await workspaceOps.updateWorkspace(
        'ws-123',
        {
          settings: {
            defaultRole: 'editor',
            features: { ragEnabled: true }
          },
        },
        'user-123'
      );

      // Verify merged settings were sent
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            defaultRole: 'editor',
            timezone: 'UTC',
            features: { ragEnabled: true }
          })
        })
      );
    });
  });

  describe('deleteWorkspace', () => {
    it('should soft delete workspace when user is owner', async () => {
      // Create nested mock structure for chained calls
      const singleMock = vi.fn().mockResolvedValue({
        data: {
          role_id: 'role-owner',
          roles: { name: 'owner' },
        },
        error: null,
      });
      
      const eqMock2 = vi.fn().mockReturnValue({
        single: singleMock,
      });
      
      const eqMock1 = vi.fn().mockReturnValue({
        eq: eqMock2,
      });
      
      const selectMock = vi.fn().mockReturnValue({
        eq: eqMock1,
      });

      // Mock member check - user is owner
      mockSupabase.from.mockReturnValueOnce({
        select: selectMock,
      });

      // Mock workspace soft delete
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: null,
          }),
        }),
      });

      await workspaceOps.deleteWorkspace('ws-123', 'user-123');

      // Verify soft delete was called
      expect(mockSupabase.from).toHaveBeenCalledWith('workspaces');
    });

    it('should throw error when user is not owner', async () => {
      // Mock member check - user is member, not owner
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  role_id: 'role-member',
                  roles: { name: 'member' },
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      await expect(
        workspaceOps.deleteWorkspace('ws-123', 'user-456')
      ).rejects.toThrow('Only workspace owners can delete workspaces');
    });

    it('should throw AccessDeniedError when user is not a member', async () => {
      // Mock member check - user not found
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        }),
      });

      await expect(
        workspaceOps.deleteWorkspace('ws-123', 'user-999')
      ).rejects.toThrow(WorkspaceAccessDeniedError);
    });

    it('should set archived_at timestamp on deletion', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: null,
        }),
      });

      // Mock member check - user is owner
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  role_id: 'role-owner',
                  roles: { name: 'owner' },
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      // Mock workspace update
      mockSupabase.from.mockReturnValueOnce({
        update: updateMock,
      });

      await workspaceOps.deleteWorkspace('ws-123', 'user-123');

      // Verify archived_at was set
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          archived_at: expect.any(String),
          updated_at: expect.any(String),
        })
      );
    });
  });

  describe('restoreWorkspace', () => {
    it('should restore archived workspace when user is owner', async () => {
      const restoredWorkspace = {
        id: 'ws-123',
        name: 'Restored Workspace',
        slug: 'restored-workspace',
        owner_id: 'user-123',
        archived_at: null,
        updated_at: '2024-01-03T00:00:00Z',
      };

      // Mock member check - user is owner
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  role_id: 'role-owner',
                  roles: { name: 'owner' },
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      // Mock workspace restore
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: restoredWorkspace,
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await workspaceOps.restoreWorkspace('ws-123', 'user-123');

      expect(result.archivedAt).toBeUndefined();
      expect(result.id).toBe('ws-123');
    });

    it('should throw error when user is not owner', async () => {
      // Mock member check - user is member, not owner
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  role_id: 'role-member',
                  roles: { name: 'member' },
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      await expect(
        workspaceOps.restoreWorkspace('ws-123', 'user-456')
      ).rejects.toThrow('Only workspace owners can restore workspaces');
    });

    it('should clear archived_at on restoration', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'ws-123', archived_at: null },
              error: null,
            }),
          }),
        }),
      });

      // Mock member check - user is owner
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  role_id: 'role-owner',
                  roles: { name: 'owner' },
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      // Mock workspace update
      mockSupabase.from.mockReturnValueOnce({
        update: updateMock,
      });

      await workspaceOps.restoreWorkspace('ws-123', 'user-123');

      // Verify archived_at was cleared
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          archived_at: null,
          updated_at: expect.any(String),
        })
      );
    });
  });

  describe('Factory function', () => {
    it('should create WorkspaceOperations instance using factory', () => {
      const instance = createWorkspaceOperations(mockSupabase as any);
      expect(instance).toBeInstanceOf(WorkspaceOperations);
    });
  });
});