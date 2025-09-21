import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from '@remix-run/react';
import {
  HomeIcon,
  MagnifyingGlassIcon,
  Cog6ToothIcon,
  DocumentIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { cn } from '~/utils/cn';
import { ResizeHandle } from '~/components/ui/ResizeHandle';
import { useLayoutStore } from '~/stores/layout-store';
import { PageTreeNavigation } from '~/components/navigation/PageTreeNavigation';
import { UserMenu } from '~/components/navigation/UserMenu';
import type { AuthUser } from '~/services/auth/auth.server';
import type { PageTreeNode } from '~/components/navigation/PageTreeNavigation';

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SidebarProps {
  user: AuthUser;
  currentWorkspace: { id: string; name: string; slug: string } | null;
  workspaces: Array<{
    workspace: { id: string; name: string; slug: string };
    role: { name: string };
  }>;
  pageTree?: PageTreeNode[];
  currentPageId?: string;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  onCommandPaletteOpen?: () => void;
  className?: string;
}

const LAYOUT_CONSTANTS = {
  COLLAPSED_MENU_WIDTH: 64,
  MIN_MENU_WIDTH: 200,
  DEFAULT_MENU_WIDTH: 256,
  MAX_MENU_WIDTH: 400,
};

// Main navigation items - matching editor page
const navigation: NavigationItem[] = [
  { name: 'Home', href: '/app', icon: HomeIcon },
  { name: 'Search', href: '/app/search', icon: MagnifyingGlassIcon },
  { name: 'Settings', href: '/app/settings', icon: Cog6ToothIcon },
];

export function AppSidebar({
  user,
  currentWorkspace,
  workspaces,
  pageTree = [],
  currentPageId,
  isOpen,
  onToggle,
  onCommandPaletteOpen,
  className,
}: SidebarProps) {
  const location = useLocation();
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const {
    isMenuCollapsed,
    setMenuCollapsed,
    menuSidebarWidth,
    setMenuSidebarWidth,
  } = useLayoutStore();

  // Close workspace dropdown when clicking outside
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

  // Close mobile sidebar when route changes
  useEffect(() => {
    onToggle(false);
  }, [location.pathname, onToggle]);

  return (
    <aside 
      className={cn(
        "relative bg-theme-bg-secondary border-r border-theme-border-primary transition-all duration-300 ease-in-out",
        "flex flex-col h-full",
        // Mobile behavior
        isOpen ? "fixed inset-y-0 left-0 z-50 translate-x-0" : "fixed inset-y-0 left-0 z-50 -translate-x-full",
        // Desktop behavior
        "lg:relative lg:translate-x-0",
        className
      )}
      style={{ 
        width: isOpen && !isMenuCollapsed ? '256px' : // Mobile always full width
               isMenuCollapsed ? `${LAYOUT_CONSTANTS.COLLAPSED_MENU_WIDTH}px` : 
               `${menuSidebarWidth}px` 
      }}
      aria-label="Main navigation"
    >
      {/* Resize handle for desktop */}
      {!isMenuCollapsed && (
        <ResizeHandle
          orientation="vertical"
          onResize={(delta) => setMenuSidebarWidth(menuSidebarWidth + delta)}
          className="absolute right-0 top-0 h-full translate-x-1/2 z-10 hidden lg:block"
        />
      )}
      
      {/* Collapse/Expand Button for Desktop */}
      <button
        onClick={() => setMenuCollapsed(!isMenuCollapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 hidden lg:flex w-6 h-6 bg-theme-text-highlight border border-theme-border-primary rounded-full items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 z-20 transition-colors"
        aria-label={isMenuCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isMenuCollapsed ? (
          <ChevronRightIcon className="w-3 h-3" />
        ) : (
          <ChevronLeftIcon className="w-3 h-3" />
        )}
      </button>

      {/* Workspace Icon - Always at top */}
      <div className={cn(
        "flex-shrink-0",
        isMenuCollapsed ? "p-2" : "p-2"
      )}>
        <div className="relative" data-dropdown="workspace">
          <button
            onClick={() => isMenuCollapsed ? null : setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
            className={cn(
              "w-full flex items-center rounded-lg transition-colors",
              isMenuCollapsed 
                ? "justify-center p-2 hover:bg-gray-100 dark:hover:bg-gray-800" 
                : "justify-between px-3 py-0.7 text-sm font-medium text-theme-text-primary bg-theme-bg-secondary hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            )}
            aria-label="Switch workspace"
            aria-expanded={workspaceDropdownOpen}
            aria-haspopup="true"
            title={isMenuCollapsed ? currentWorkspace?.name || 'Workspace' : undefined}
          >
            <div className={cn(
              "flex items-center",
              isMenuCollapsed && "justify-center"
            )}>
              <div className={cn(
                "flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold",
                isMenuCollapsed ? "w-9 h-9" : "w-8 h-8"
              )}>
                {currentWorkspace?.name.charAt(0).toUpperCase() || 'W'}
              </div>
              {!isMenuCollapsed && (
                <span className="ml-3 truncate">{currentWorkspace?.name || 'Workspace'}</span>
              )}
            </div>
            {!isMenuCollapsed && (
              <ChevronDownIcon className="ml-2 h-4 w-4 text-gray-500 flex-shrink-0" />
            )}
          </button>

          {/* Workspace Dropdown */}
          {workspaceDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-lg border border-theme-border-primary py-1 z-10 bg-theme-bg-primary">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Workspaces
              </div>
              {workspaces.map((uw) => uw && (
                <Link
                  key={uw.workspace.id}
                  to={`/app/workspace/${uw.workspace.slug}`}
                  className={`
                    flex items-center px-3 py-2 text-sm hover:bg-theme-text-highlight
                    ${uw.workspace.id === currentWorkspace?.id ? 'text-blue-700 dark:text-white' : 'text-gray-700'}
                  `}
                >
                  <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-gray-400 to-gray-500 rounded flex items-center justify-center text-white text-xs font-semibold">
                    {uw.workspace.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="ml-3 truncate">{uw.workspace.name}</span>
                  <span className="ml-auto text-xs text-gray-500">{uw.role.name}</span>
                </Link>
              ))}
              <div className="border-t border-theme-border-secondary mt-1 pt-1">
                <Link
                  to="/app/workspace/new"
                  className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-theme-bg-text-highlight"
                >
                  <PlusIcon className="h-4 w-4 mr-3 text-gray-400" />
                  Create workspace
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation - Icons only when collapsed */}
      <nav className={cn(
        "flex-1 overflow-y-auto space-y-1",
        isMenuCollapsed ? "px-2 py-2" : "p-4"
      )} aria-label="Primary navigation">
        {navigation.map((item) => {
          const Icon = item.icon;
          
          // Special handling for Search - opens command palette instead of navigating
          if (item.name === 'Search' && onCommandPaletteOpen) {
            return (
              <button
                key={item.name}
                onClick={() => onCommandPaletteOpen()}
                className={cn(
                  "w-full flex items-center text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700",
                  isMenuCollapsed ? "justify-center p-2" : "px-3 py-2"
                )}
                title={isMenuCollapsed ? item.name : undefined}
              >
                <Icon className={cn(
                  "h-5 w-5 flex-shrink-0",
                  !isMenuCollapsed && "mr-3"
                )} />
                {!isMenuCollapsed && item.name}
              </button>
            );
          }
          
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) => cn(
                "flex items-center text-sm font-medium rounded-lg transition-colors",
                isActive 
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700",
                isMenuCollapsed ? "justify-center p-2" : "px-3 py-2"
              )}
              title={isMenuCollapsed ? item.name : undefined}
            >
              <Icon className={cn(
                "h-5 w-5 flex-shrink-0",
                !isMenuCollapsed && "mr-3"
              )} />
              {!isMenuCollapsed && item.name}
            </NavLink>
          );
        })}

        {/* Pages Section - ONLY show when expanded */}
        {!isMenuCollapsed && pageTree && pageTree.length > 0 && (
          <div className="pt-4">
            <div className="flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <div className="flex items-center">
                <DocumentIcon className="h-5 w-5 mr-3" />
                <span>Pages</span>
              </div>
              <Link
                to="/app/pages/new"
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                aria-label="Create new page"
              >
                <PlusIcon className="h-4 w-4" />
              </Link>
            </div>
            
            {/* Page Tree Navigation */}
            <div className="mt-1">
              <PageTreeNavigation
                workspaceSlug={currentWorkspace?.slug || ''}
                pages={pageTree}
                currentPageId={currentPageId}
                onCreatePage={(parentId) => {
                  // Navigate to create page route
                  window.location.href = `/app/pages/new${parentId ? `?parentId=${parentId}` : ''}`;
                }}
                onMovePage={async (pageId, newParentId) => {
                  // Call API to move page
                  const formData = new FormData();
                  if (newParentId) formData.append('parentId', newParentId);
                  
                  const response = await fetch(`/api/pages/${pageId}`, {
                    method: 'PATCH',
                    body: formData
                  });
                  
                  if (response.ok) {
                    window.location.reload();
                  } else {
                    console.error('Failed to move page');
                  }
                }}
                onDeletePage={async (pageId) => {
                  // Call API to delete page
                  const response = await fetch(`/api/pages/${pageId}`, {
                    method: 'DELETE'
                  });
                  
                  if (response.ok) {
                    window.location.reload();
                  } else {
                    console.error('Failed to delete page');
                  }
                }}
                onRenamePage={async (pageId, newTitle) => {
                  // Call API to rename page
                  const formData = new FormData();
                  formData.append('title', newTitle);
                  
                  const response = await fetch(`/api/pages/${pageId}`, {
                    method: 'PATCH',
                    body: formData
                  });
                  
                  if (response.ok) {
                    window.location.reload();
                  } else {
                    console.error('Failed to rename page');
                  }
                }}
              />
            </div>
          </div>
        )}
      </nav>

      {/* User Profile at Bottom */}
      <div className={cn(
        "flex-shrink-0 border-t border-theme-border-primary",
        isMenuCollapsed ? "p-2" : "p-4"
      )}>
        {isMenuCollapsed ? (
          // Collapsed: Just show user avatar centered
          <div className="flex justify-center">
            <button
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={user.name || user.email}
              onClick={() => setMenuCollapsed(false)}
            >
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                {(user.name || user.email || '?').charAt(0).toUpperCase()}
              </div>
            </button>
          </div>
        ) : (
          // Expanded: Show full UserMenu
          <UserMenu user={user} currentWorkspace={currentWorkspace ? { id: currentWorkspace.id, name: currentWorkspace.name } : undefined} />
        )}
      </div>
    </aside>
  );
}