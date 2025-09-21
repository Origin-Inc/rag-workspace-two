import { Outlet, useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { getUser } from "~/services/auth/auth.server";
import { prisma } from "~/utils/db.server";
import { pageHierarchyService } from "~/services/page-hierarchy.server";
import type { PageTreeNode } from "~/components/navigation/PageTreeNavigation";
import { useState, useEffect } from "react";
import { CommandPalette } from "~/components/navigation/CommandPalette";
import { ClientOnly } from "~/components/ClientOnly";
import { ThemeToggle } from "~/components/theme/ThemeToggle";
import { redisHealthChecker } from "~/services/redis-health-check.server";
import { AppSidebar } from "~/components/layout/AppSidebar";
import { 
  BellIcon,
  Bars3Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  
  if (!user) {
    return redirect("/auth/signin");
  }

  // Get user's workspaces
  let userWorkspaces: Array<{
    id: string;
    userId: string;
    workspaceId: string;
    roleId: string;
    workspace: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
    };
    role: {
      id: string;
      name: string;
    };
  }> = [];
  try {
    userWorkspaces = await prisma.userWorkspace.findMany({
      where: { userId: user.id },
      include: {
        workspace: true,
        role: true,
      },
      orderBy: {
        workspace: {
          name: 'asc'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    // Continue with empty array
  }

  if (userWorkspaces.length === 0) {
    // Create a default workspace for the user
    const slug = `workspace-${user.id.slice(0, 8)}-${Date.now()}`; // Add timestamp to ensure uniqueness
    
    try {
      // Get owner role ID
      const ownerRole = await prisma.role.findUnique({
        where: { name: 'owner' }
      });
      
      if (!ownerRole) {
        throw new Error('Owner role not found');
      }
      
      // Create workspace and user association
      await prisma.workspace.create({
        data: {
          name: 'My Workspace',
          slug,
          description: 'Default workspace',
          userWorkspaces: {
            create: {
              userId: user.id,
              roleId: ownerRole.id
            }
          }
        }
      });
    } catch (e) {
      console.error('Error creating default workspace:', e);
      // If workspace creation fails, don't redirect - show error instead
      return json({ 
        error: 'Unable to create workspace. Please try again or contact support.',
        user,
        workspaces: [],
        currentWorkspace: null,
        pageTree: []
      }, { status: 500 });
    }

    // Only redirect if workspace was successfully created
    return redirect("/app");
  }

  // Get current workspace from cookie/session or use first one
  const currentWorkspaceId = user.workspaceId || userWorkspaces[0]?.workspace.id;
  const currentWorkspace = userWorkspaces.find(uw => uw?.workspace.id === currentWorkspaceId)?.workspace || userWorkspaces[0]?.workspace || null;

  // Get page tree for current workspace
  let pageTree: PageTreeNode[] = [];
  if (currentWorkspace) {
    try {
      pageTree = await pageHierarchyService.getPageTree(currentWorkspace.id, 5);
    } catch (e) {
      console.error('Error fetching page tree:', e);
      // Continue with empty array
    }
  }
  
  // Check Redis health in background (non-blocking)
  redisHealthChecker.checkHealth().then(status => {
    if (status.warnings.length > 0) {
      console.warn('Redis health warnings:', status.warnings);
      status.warnings.forEach(warning => {
        if (warning.includes('Eviction policy')) {
          console.log(warning); // This will appear in logs
        }
      });
    }
  }).catch(error => {
    console.error('Redis health check failed:', error);
  });

  return json({
    user,
    workspaces: userWorkspaces,
    currentWorkspace,
    pageTree,
  });
}

export default function AppLayout() {
  const { user, workspaces, currentWorkspace, pageTree } = useLoaderData<typeof loader>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  return (
    <div className="h-full flex">
      {/* Skip to main content link for keyboard navigation */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 px-4 py-2 bg-blue-600 text-white rounded-lg"
      >
        Skip to main content
      </a>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-gray-600 bg-opacity-75"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Unified Sidebar Component */}
      <AppSidebar
        user={user}
        currentWorkspace={currentWorkspace}
        workspaces={workspaces}
        pageTree={pageTree as PageTreeNode[]}
        isOpen={sidebarOpen}
        onToggle={setSidebarOpen}
        onCommandPaletteOpen={() => setCommandPaletteOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header id="top-header" className="flex-shrink-0 bg-white dark:bg-[rgba(33,33,33,1)] dark:border-[rgba(33, 33, 33, 1)]">
          
          
          <div className="flex items-center justify-between h-12 px-4 lg:px-6">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </button>

            {/* Spacer */}
            <div className="flex-1"></div>

            {/* Right side buttons */}
            <div className="flex items-center space-x-3">
              <ThemeToggle />
              <button className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <BellIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main id="main-content" className="flex-1 overflow-y-auto bg-white dark:bg-[rgba(33,33,33,1)]" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      
      {/* Command Palette - rendered as modal */}
      <ClientOnly fallback={null}>
        <CommandPalette 
          open={commandPaletteOpen} 
          onClose={() => setCommandPaletteOpen(false)} 
        />
      </ClientOnly>
    </div>
  );
}