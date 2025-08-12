import { Outlet, useLoaderData, Link, NavLink, useLocation } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { getUser } from "~/services/auth/auth.server";
import { prisma } from "~/utils/db.server";
import { workspaceService } from "~/services/workspace.server";
import { useState, useEffect } from "react";
import { Breadcrumbs } from "~/components/navigation/Breadcrumbs";
import { CommandPalette } from "~/components/navigation/CommandPalette";
import { UserMenu } from "~/components/navigation/UserMenu";
import { ThemeToggle } from "~/components/theme/ThemeToggle";
import { 
  HomeIcon, 
  DocumentIcon, 
  FolderIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  BellIcon,
  UserCircleIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
  PlusIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  
  if (!user) {
    return redirect("/auth/login");
  }

  // Get user's workspaces
  const userWorkspaces = await prisma.userWorkspace.findMany({
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

  if (userWorkspaces.length === 0) {
    // Create a default workspace for the user
    const defaultWorkspace = await prisma.workspace.create({
      data: {
        name: "My Workspace",
        slug: `workspace-${user.id.slice(0, 8)}`,
        description: "Default workspace",
      },
    });

    // Get or create default role
    let defaultRole = await prisma.role.findFirst({
      where: { name: "owner" },
    });

    if (!defaultRole) {
      defaultRole = await prisma.role.create({
        data: {
          name: "owner",
          displayName: "Owner",
          description: "Full access to the workspace",
          isSystem: true,
        },
      });
    }

    // Add user to workspace
    await prisma.userWorkspace.create({
      data: {
        userId: user.id,
        workspaceId: defaultWorkspace.id,
        roleId: defaultRole.id,
      },
    });

    // Redirect to refresh the page with the new workspace
    return redirect("/app");
  }

  // Get current workspace from cookie/session or use first one
  const currentWorkspaceId = user.workspaceId || userWorkspaces[0].workspace.id;
  const currentWorkspace = userWorkspaces.find(uw => uw.workspace.id === currentWorkspaceId)?.workspace || userWorkspaces[0].workspace;

  // Get projects for current workspace
  const projects = await prisma.project.findMany({
    where: { workspaceId: currentWorkspace.id },
    orderBy: { name: 'asc' },
    take: 10,
  });

  return json({
    user,
    workspaces: userWorkspaces,
    currentWorkspace,
    projects,
  });
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  current?: boolean;
}

export default function AppLayout() {
  const { user, workspaces, currentWorkspace, projects } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  // Main navigation items
  const navigation: NavigationItem[] = [
    { name: 'Home', href: '/app', icon: HomeIcon },
    { name: 'Search', href: '/app/search', icon: MagnifyingGlassIcon },
    { name: 'Settings', href: '/app/settings', icon: Cog6ToothIcon },
  ];

  // Close mobile sidebar when route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-dropdown="workspace"]')) {
        setWorkspaceDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

      {/* Sidebar */}
      <aside 
        className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 
          bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-300 ease-in-out
          flex flex-col h-full
        `}
        aria-label="Main navigation"
      >
        {/* Workspace Switcher */}
        <div className="flex-shrink-0 p-4 border-b border-gray-200">
          <div className="relative" data-dropdown="workspace">
            <button
              onClick={() => setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              aria-label="Switch workspace"
              aria-expanded={workspaceDropdownOpen}
              aria-haspopup="true"
            >
              <div className="flex items-center min-w-0">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold">
                  {currentWorkspace.name.charAt(0).toUpperCase()}
                </div>
                <span className="ml-3 truncate">{currentWorkspace.name}</span>
              </div>
              <ChevronDownIcon className="ml-2 h-4 w-4 text-gray-500 flex-shrink-0" />
            </button>

            {/* Workspace Dropdown */}
            {workspaceDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Workspaces
                </div>
                {workspaces.map((uw) => (
                  <Link
                    key={uw.workspace.id}
                    to={`/app/workspace/${uw.workspace.slug}`}
                    className={`
                      flex items-center px-3 py-2 text-sm hover:bg-gray-50
                      ${uw.workspace.id === currentWorkspace.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
                    `}
                  >
                    <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-gray-400 to-gray-500 rounded flex items-center justify-center text-white text-xs font-semibold">
                      {uw.workspace.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="ml-3 truncate">{uw.workspace.name}</span>
                    <span className="ml-auto text-xs text-gray-500">{uw.role.name}</span>
                  </Link>
                ))}
                <div className="border-t border-gray-200 mt-1 pt-1">
                  <Link
                    to="/app/workspace/new"
                    className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <PlusIcon className="h-4 w-4 mr-3 text-gray-400" />
                    Create workspace
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1" aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) => `
                  flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                  ${isActive 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.name}
              </NavLink>
            );
          })}

          {/* Projects Section */}
          <div className="pt-4">
            <button
              onClick={() => setProjectsExpanded(!projectsExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              aria-expanded={projectsExpanded}
              aria-controls="projects-list"
            >
              <div className="flex items-center">
                <FolderIcon className="mr-3 h-5 w-5" />
                Projects
              </div>
              <ChevronRightIcon className={`h-4 w-4 transition-transform ${projectsExpanded ? 'rotate-90' : ''}`} />
            </button>
            
            {projectsExpanded && (
              <div className="mt-1 space-y-1">
                {projects.length > 0 ? (
                  projects.map((project) => (
                    <NavLink
                      key={project.id}
                      to={`/app/project/${project.id}`}
                      className={({ isActive }) => `
                        flex items-center pl-11 pr-3 py-2 text-sm rounded-lg transition-colors
                        ${isActive 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'text-gray-600 hover:bg-gray-50'
                        }
                      `}
                    >
                      <DocumentIcon className="mr-3 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </NavLink>
                  ))
                ) : (
                  <div className="pl-11 pr-3 py-2 text-sm text-gray-500">
                    No projects yet
                  </div>
                )}
                <Link
                  to="/app/projects/new"
                  className="flex items-center pl-11 pr-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
                >
                  <PlusIcon className="mr-3 h-4 w-4" />
                  New project
                </Link>
              </div>
            )}
          </div>
        </nav>

        {/* User Menu */}
        <div className="flex-shrink-0 p-4 border-t border-gray-200">
          <UserMenu user={user} currentWorkspace={currentWorkspace} />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          {/* Breadcrumbs */}
          <div className="px-4 lg:px-6 py-3 border-b border-gray-200">
            <Breadcrumbs />
          </div>
          
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
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

            {/* Search Bar / Command Palette */}
            <div className="flex-1 max-w-2xl mx-4">
              <CommandPalette />
            </div>

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
        <main id="main-content" className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}