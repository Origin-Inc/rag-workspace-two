import { prisma } from "~/utils/db.server";

// Default system roles
export const SYSTEM_ROLES = {
  SUPER_ADMIN: "super_admin",
  WORKSPACE_OWNER: "workspace_owner",
  WORKSPACE_ADMIN: "workspace_admin",
  WORKSPACE_MEMBER: "workspace_member",
  WORKSPACE_VIEWER: "workspace_viewer",
} as const;

// Permission resources and actions
export const PERMISSIONS = {
  // Workspace permissions
  WORKSPACE: {
    resource: "workspace",
    actions: {
      CREATE: "create",
      READ: "read",
      UPDATE: "update",
      DELETE: "delete",
      MANAGE_MEMBERS: "manage_members",
      MANAGE_SETTINGS: "manage_settings",
    },
  },
  // Page permissions
  PAGE: {
    resource: "page",
    actions: {
      CREATE: "create",
      READ: "read",
      UPDATE: "update",
      DELETE: "delete",
      PUBLISH: "publish",
    },
  },
  // Document permissions
  DOCUMENT: {
    resource: "document",
    actions: {
      CREATE: "create",
      READ: "read",
      UPDATE: "update",
      DELETE: "delete",
      PROCESS: "process",
    },
  },
  // Query permissions
  QUERY: {
    resource: "query",
    actions: {
      CREATE: "create",
      READ: "read",
      READ_ALL: "read_all",
    },
  },
  // User permissions
  USER: {
    resource: "user",
    actions: {
      READ: "read",
      UPDATE: "update",
      DELETE: "delete",
      MANAGE_ROLES: "manage_roles",
    },
  },
} as const;

/**
 * Initialize default roles and permissions
 */
export async function initializeRoles(): Promise<void> {
  // Create super admin role
  await prisma.role.upsert({
    where: { name: SYSTEM_ROLES.SUPER_ADMIN },
    update: {},
    create: {
      name: SYSTEM_ROLES.SUPER_ADMIN,
      displayName: "Super Administrator",
      description: "Full system access",
      isSystem: true,
    },
  });

  // Create workspace owner role
  await prisma.role.upsert({
    where: { name: SYSTEM_ROLES.WORKSPACE_OWNER },
    update: {},
    create: {
      name: SYSTEM_ROLES.WORKSPACE_OWNER,
      displayName: "Workspace Owner",
      description: "Full access to workspace",
      isSystem: true,
    },
  });

  // Create workspace admin role
  await prisma.role.upsert({
    where: { name: SYSTEM_ROLES.WORKSPACE_ADMIN },
    update: {},
    create: {
      name: SYSTEM_ROLES.WORKSPACE_ADMIN,
      displayName: "Workspace Administrator",
      description: "Manage workspace and members",
      isSystem: true,
    },
  });

  // Create workspace member role
  await prisma.role.upsert({
    where: { name: SYSTEM_ROLES.WORKSPACE_MEMBER },
    update: {},
    create: {
      name: SYSTEM_ROLES.WORKSPACE_MEMBER,
      displayName: "Workspace Member",
      description: "Create and manage own content",
      isSystem: true,
    },
  });

  // Create workspace viewer role
  await prisma.role.upsert({
    where: { name: SYSTEM_ROLES.WORKSPACE_VIEWER },
    update: {},
    create: {
      name: SYSTEM_ROLES.WORKSPACE_VIEWER,
      displayName: "Workspace Viewer",
      description: "View content only",
      isSystem: true,
    },
  });

  // Create permissions
  const permissions = [];
  
  // Workspace permissions
  for (const action of Object.values(PERMISSIONS.WORKSPACE.actions)) {
    permissions.push({
      resource: PERMISSIONS.WORKSPACE.resource,
      action,
    });
  }

  // Page permissions
  for (const action of Object.values(PERMISSIONS.PAGE.actions)) {
    permissions.push({
      resource: PERMISSIONS.PAGE.resource,
      action,
    });
  }

  // Document permissions
  for (const action of Object.values(PERMISSIONS.DOCUMENT.actions)) {
    permissions.push({
      resource: PERMISSIONS.DOCUMENT.resource,
      action,
    });
  }

  // Query permissions
  for (const action of Object.values(PERMISSIONS.QUERY.actions)) {
    permissions.push({
      resource: PERMISSIONS.QUERY.resource,
      action,
    });
  }

  // User permissions
  for (const action of Object.values(PERMISSIONS.USER.actions)) {
    permissions.push({
      resource: PERMISSIONS.USER.resource,
      action,
    });
  }

  // Create all permissions
  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: {
        resource_action: {
          resource: perm.resource,
          action: perm.action,
        },
      },
      update: {},
      create: perm,
    });
  }

  // Assign permissions to roles
  await assignDefaultPermissions();
}

/**
 * Assign default permissions to system roles
 */
async function assignDefaultPermissions(): Promise<void> {
  // Super admin gets all permissions
  const allPermissions = await prisma.permission.findMany();
  const superAdminRole = await prisma.role.findUnique({
    where: { name: SYSTEM_ROLES.SUPER_ADMIN },
  });

  if (superAdminRole) {
    for (const permission of allPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: superAdminRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: superAdminRole.id,
          permissionId: permission.id,
        },
      });
    }
  }

  // Workspace owner gets all workspace-related permissions
  const ownerPermissions = await prisma.permission.findMany({
    where: {
      OR: [
        { resource: "workspace" },
        { resource: "page" },
        { resource: "document" },
        { resource: "query" },
        { 
          resource: "user",
          action: { in: ["read", "manage_roles"] },
        },
      ],
    },
  });

  const ownerRole = await prisma.role.findUnique({
    where: { name: SYSTEM_ROLES.WORKSPACE_OWNER },
  });

  if (ownerRole) {
    for (const permission of ownerPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: ownerRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: ownerRole.id,
          permissionId: permission.id,
        },
      });
    }
  }

  // Admin permissions (no delete workspace)
  const adminPermissions = await prisma.permission.findMany({
    where: {
      OR: [
        { 
          resource: "workspace",
          action: { in: ["read", "update", "manage_members", "manage_settings"] },
        },
        { resource: "page" },
        { resource: "document" },
        { resource: "query" },
        { 
          resource: "user",
          action: "read",
        },
      ],
    },
  });

  const adminRole = await prisma.role.findUnique({
    where: { name: SYSTEM_ROLES.WORKSPACE_ADMIN },
  });

  if (adminRole) {
    for (const permission of adminPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      });
    }
  }

  // Member permissions
  const memberPermissions = await prisma.permission.findMany({
    where: {
      OR: [
        { 
          resource: "workspace",
          action: "read",
        },
        { 
          resource: "page",
          action: { in: ["create", "read", "update", "delete"] },
        },
        { 
          resource: "document",
          action: { in: ["create", "read", "update", "delete", "process"] },
        },
        { 
          resource: "query",
          action: { in: ["create", "read"] },
        },
        { 
          resource: "user",
          action: "read",
        },
      ],
    },
  });

  const memberRole = await prisma.role.findUnique({
    where: { name: SYSTEM_ROLES.WORKSPACE_MEMBER },
  });

  if (memberRole) {
    for (const permission of memberPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: memberRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: memberRole.id,
          permissionId: permission.id,
        },
      });
    }
  }

  // Viewer permissions (read only)
  const viewerPermissions = await prisma.permission.findMany({
    where: {
      action: "read",
    },
  });

  const viewerRole = await prisma.role.findUnique({
    where: { name: SYSTEM_ROLES.WORKSPACE_VIEWER },
  });

  if (viewerRole) {
    for (const permission of viewerPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: viewerRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: viewerRole.id,
          permissionId: permission.id,
        },
      });
    }
  }
}

/**
 * Check if a user has a specific permission in a workspace
 */
export async function hasPermission(
  userId: string,
  workspaceId: string,
  resource: string,
  action: string
): Promise<boolean> {
  const userWorkspace = await prisma.userWorkspace.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  if (!userWorkspace) {
    return false;
  }

  return userWorkspace.role.permissions.some(
    (rp) => rp.permission.resource === resource && rp.permission.action === action
  );
}

/**
 * Get all permissions for a user in a workspace
 */
export async function getUserPermissions(
  userId: string,
  workspaceId: string
): Promise<string[]> {
  const userWorkspace = await prisma.userWorkspace.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  if (!userWorkspace) {
    return [];
  }

  return userWorkspace.role.permissions.map(
    (rp) => `${rp.permission.resource}:${rp.permission.action}`
  );
}

/**
 * Add user to workspace with role
 */
export async function addUserToWorkspace(
  userId: string,
  workspaceId: string,
  roleName: string = SYSTEM_ROLES.WORKSPACE_MEMBER
): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
  });

  if (!role) {
    throw new Error(`Role ${roleName} not found`);
  }

  await prisma.userWorkspace.create({
    data: {
      userId,
      workspaceId,
      roleId: role.id,
    },
  });
}