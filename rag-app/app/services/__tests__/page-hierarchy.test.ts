import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PageHierarchyService } from '../page-hierarchy.server';
import { prisma } from '~/utils/db.server';
import type { Page, Workspace, User } from '@prisma/client';

// Mock Prisma
vi.mock('~/utils/db.server', () => ({
  prisma: {
    page: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn()
    },
    workspace: {
      findUnique: vi.fn()
    },
    userWorkspace: {
      findFirst: vi.fn()
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn()
  }
}));

describe('PageHierarchyService', () => {
  let service: PageHierarchyService;
  let mockWorkspace: Workspace;
  let mockUser: User;
  let mockPages: Page[];

  beforeEach(() => {
    service = new PageHierarchyService();
    
    mockWorkspace = {
      id: 'workspace-1',
      name: 'Test Workspace',
      slug: 'test-workspace',
      description: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      workspaceId: 'workspace-1',
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      hashedPassword: 'hash',
      twoFactorEnabled: false,
      twoFactorSecret: null,
      loginAttempts: 0,
      lockoutUntil: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockPages = [
      {
        id: 'page-1',
        workspaceId: 'workspace-1',
        projectId: null,
        parentId: null,
        title: 'Root Page',
        slug: 'root-page',
        content: {},
        blocks: [],
        icon: '📄',
        coverImage: null,
        position: 0,
        isArchived: false,
        isPublished: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'page-2',
        workspaceId: 'workspace-1',
        projectId: null,
        parentId: 'page-1',
        title: 'Child Page',
        slug: 'child-page',
        content: {},
        blocks: [],
        icon: '📄',
        coverImage: null,
        position: 0,
        isArchived: false,
        isPublished: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'page-3',
        workspaceId: 'workspace-1',
        projectId: null,
        parentId: 'page-2',
        title: 'Grandchild Page',
        slug: 'grandchild-page',
        content: {},
        blocks: [],
        icon: '📄',
        coverImage: null,
        position: 0,
        isArchived: false,
        isPublished: false,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createWorkspacePage', () => {
    it('should create a page directly under a workspace', async () => {
      const input = {
        workspaceId: 'workspace-1',
        title: 'New Page',
        userId: 'user-1'
      };

      vi.mocked(prisma.workspace.findUnique).mockResolvedValue(mockWorkspace);
      vi.mocked(prisma.userWorkspace.findFirst).mockResolvedValue({
        id: 'uw-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        roleId: 'role-1',
        joinedAt: new Date()
      });
      vi.mocked(prisma.page.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.page.create).mockResolvedValue({
        ...mockPages[0],
        title: 'New Page'
      });

      const result = await service.createWorkspacePage(input);

      expect(result).toBeDefined();
      expect(result.title).toBe('New Page');
      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where: { id: 'workspace-1' }
      });
    });

    it('should validate parent page exists and belongs to same workspace', async () => {
      const input = {
        workspaceId: 'workspace-1',
        parentId: 'page-1',
        title: 'New Child Page',
        userId: 'user-1'
      };

      vi.mocked(prisma.workspace.findUnique).mockResolvedValue(mockWorkspace);
      vi.mocked(prisma.userWorkspace.findFirst).mockResolvedValue({
        id: 'uw-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        roleId: 'role-1',
        joinedAt: new Date()
      });
      vi.mocked(prisma.page.findUnique).mockResolvedValue(mockPages[0]);
      vi.mocked(prisma.page.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.page.create).mockResolvedValue({
        ...mockPages[1],
        title: 'New Child Page'
      });

      const result = await service.createWorkspacePage(input);

      expect(result).toBeDefined();
      expect(prisma.page.findUnique).toHaveBeenCalledWith({
        where: { id: 'page-1' }
      });
    });

    it('should throw error if workspace not found', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue(null);

      await expect(
        service.createWorkspacePage({
          workspaceId: 'invalid',
          title: 'Test',
          userId: 'user-1'
        })
      ).rejects.toThrow('Workspace not found');
    });

    it('should throw error if user lacks workspace access', async () => {
      vi.mocked(prisma.workspace.findUnique).mockResolvedValue(mockWorkspace);
      vi.mocked(prisma.userWorkspace.findFirst).mockResolvedValue(null);

      await expect(
        service.createWorkspacePage({
          workspaceId: 'workspace-1',
          title: 'Test',
          userId: 'user-1'
        })
      ).rejects.toThrow('User does not have access to this workspace');
    });
  });

  describe('getPageWithAncestors', () => {
    it('should retrieve page with full ancestor chain', async () => {
      const pageWithParent = {
        ...mockPages[2],
        parent: {
          ...mockPages[1],
          parent: mockPages[0]
        }
      };

      vi.mocked(prisma.page.findUnique).mockResolvedValue(pageWithParent as any);

      const result = await service.getPageWithAncestors('page-3');

      expect(result).toBeDefined();
      expect(result?.ancestors).toHaveLength(2);
      expect(result?.depth).toBe(2);
      expect(result?.path).toEqual(['Root Page', 'Child Page', 'Grandchild Page']);
    });

    it('should return null for non-existent page', async () => {
      vi.mocked(prisma.page.findUnique).mockResolvedValue(null);

      const result = await service.getPageWithAncestors('invalid');

      expect(result).toBeNull();
    });
  });

  describe('moveSubtree', () => {
    it('should move a page to a new parent', async () => {
      vi.mocked(prisma.page.findUnique)
        .mockResolvedValueOnce(mockPages[1]) // Source page
        .mockResolvedValueOnce(mockPages[0]); // Target parent

      vi.mocked(prisma.page.findMany).mockResolvedValue([mockPages[2]]); // Descendants
      vi.mocked(prisma.page.update).mockResolvedValue({
        ...mockPages[1],
        parentId: 'page-1'
      });

      const result = await service.moveSubtree('page-2', 'page-1', 'user-1');

      expect(result).toBeDefined();
      expect(prisma.page.update).toHaveBeenCalledWith({
        where: { id: 'page-2' },
        data: { parentId: 'page-1' }
      });
    });

    it('should prevent circular references', async () => {
      vi.mocked(prisma.page.findUnique).mockResolvedValue(mockPages[1]);
      vi.mocked(prisma.page.findMany).mockResolvedValue([mockPages[2]]); // page-3 is descendant of page-2

      await expect(
        service.moveSubtree('page-1', 'page-3', 'user-1') // Try to move page-1 under its descendant
      ).rejects.toThrow('Cannot move page to its own descendant');
    });

    it('should handle moving to root (null parent)', async () => {
      vi.mocked(prisma.page.findUnique).mockResolvedValue(mockPages[1]);
      vi.mocked(prisma.page.update).mockResolvedValue({
        ...mockPages[1],
        parentId: null
      });

      const result = await service.moveSubtree('page-2', null, 'user-1');

      expect(result).toBeDefined();
      expect(result.parentId).toBeNull();
    });
  });

  describe('getAllDescendants', () => {
    it('should retrieve all descendants of a page', async () => {
      vi.mocked(prisma.page.findMany)
        .mockResolvedValueOnce([mockPages[1]]) // Direct children
        .mockResolvedValueOnce([mockPages[2]]) // Grandchildren
        .mockResolvedValueOnce([]); // No more descendants

      const descendants = await service.getAllDescendants('page-1');

      expect(descendants).toHaveLength(2);
      expect(descendants[0].id).toBe('page-2');
      expect(descendants[1].id).toBe('page-3');
    });

    it('should return empty array for page with no children', async () => {
      vi.mocked(prisma.page.findMany).mockResolvedValue([]);

      const descendants = await service.getAllDescendants('page-3');

      expect(descendants).toHaveLength(0);
    });
  });

  describe('getPageTree', () => {
    it('should build complete page tree for workspace', async () => {
      vi.mocked(prisma.page.findMany)
        .mockResolvedValueOnce([mockPages[0]]) // Root pages
        .mockResolvedValueOnce([mockPages[1]]) // Children of page-1
        .mockResolvedValueOnce([mockPages[2]]) // Children of page-2
        .mockResolvedValueOnce([]); // No children for page-3

      const tree = await service.getPageTree('workspace-1', 3);

      expect(tree).toHaveLength(1);
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children![0].children).toHaveLength(1);
    });

    it('should respect max depth limit', async () => {
      vi.mocked(prisma.page.findMany)
        .mockResolvedValueOnce([mockPages[0]]) // Root pages
        .mockResolvedValueOnce([mockPages[1]]); // Children of page-1

      const tree = await service.getPageTree('workspace-1', 1);

      expect(tree).toHaveLength(1);
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children![0].children).toHaveLength(0); // Limited by depth
    });
  });

  describe('validatePageHierarchyPermissions', () => {
    it('should validate permissions through workspace role', async () => {
      vi.mocked(prisma.page.findUnique).mockResolvedValue(mockPages[0]);
      vi.mocked(prisma.userWorkspace.findFirst).mockResolvedValue({
        id: 'uw-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        roleId: 'role-1',
        joinedAt: new Date(),
        role: {
          id: 'role-1',
          name: 'editor',
          permissions: [
            {
              id: 'perm-1',
              roleId: 'role-1',
              permissionId: 'p-1',
              createdAt: new Date(),
              permission: {
                id: 'p-1',
                name: 'page:edit',
                resource: 'page',
                action: 'edit',
                description: 'Can edit pages',
                createdAt: new Date(),
                updatedAt: new Date()
              }
            }
          ],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      } as any);

      const hasPermission = await service.validatePageHierarchyPermissions(
        'user-1',
        'page-1',
        'page:edit'
      );

      expect(hasPermission).toBe(true);
    });

    it('should return false for user without workspace access', async () => {
      vi.mocked(prisma.page.findUnique).mockResolvedValue(mockPages[0]);
      vi.mocked(prisma.userWorkspace.findFirst).mockResolvedValue(null);

      const hasPermission = await service.validatePageHierarchyPermissions(
        'user-2',
        'page-1',
        'page:edit'
      );

      expect(hasPermission).toBe(false);
    });
  });

  describe('checkCircularReference', () => {
    it('should detect self-reference', async () => {
      const isCircular = await service.checkCircularReference('page-1', 'page-1');
      expect(isCircular).toBe(true);
    });

    it('should detect descendant reference', async () => {
      vi.mocked(prisma.page.findMany)
        .mockResolvedValueOnce([mockPages[1]])
        .mockResolvedValueOnce([mockPages[2]])
        .mockResolvedValueOnce([]);

      const isCircular = await service.checkCircularReference('page-1', 'page-3');
      expect(isCircular).toBe(true);
    });

    it('should allow valid moves', async () => {
      vi.mocked(prisma.page.findMany).mockResolvedValue([]);

      const isCircular = await service.checkCircularReference('page-3', 'page-1');
      expect(isCircular).toBe(false);
    });
  });
});