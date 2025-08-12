import { Link, useLocation, useMatches } from "@remix-run/react";
import { ChevronRightIcon, HomeIcon } from "@heroicons/react/24/outline";
import { Fragment } from "react";

interface BreadcrumbItem {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function Breadcrumbs() {
  const location = useLocation();
  const matches = useMatches();
  
  // Build breadcrumb items from route matches
  const breadcrumbs: BreadcrumbItem[] = [];
  
  // Always start with home
  breadcrumbs.push({
    label: "Home",
    href: "/app",
    icon: HomeIcon,
  });
  
  // Parse the current path to build breadcrumbs
  const pathSegments = location.pathname.split('/').filter(Boolean);
  
  // Skip 'app' segment as it's our base
  const relevantSegments = pathSegments.slice(1);
  
  // Get route data from matches for better labels
  const currentMatch = matches[matches.length - 1];
  const routeData = currentMatch?.data as any;
  
  // Build breadcrumbs based on path segments
  relevantSegments.forEach((segment, index) => {
    const pathUpToSegment = '/app/' + relevantSegments.slice(0, index + 1).join('/');
    
    // Try to get a better label from route data or format the segment
    let label = segment;
    
    // Handle specific segment types
    if (segment === 'project' && relevantSegments[index + 1]) {
      // Skip the 'project' segment, will be handled by project ID
      return;
    }
    
    if (segment === 'page' && relevantSegments[index + 1]) {
      // Skip the 'page' segment, will be handled by page ID
      return;
    }
    
    if (relevantSegments[index - 1] === 'project' && routeData?.project) {
      // This is a project ID, use project name
      label = routeData.project.name || 'Project';
    } else if (relevantSegments[index - 1] === 'page' && routeData?.page) {
      // This is a page ID, use page title
      label = routeData.page.title || 'Page';
    } else if (segment === 'settings') {
      label = 'Settings';
    } else if (segment === 'search') {
      label = 'Search';
    } else if (segment === 'projects') {
      label = 'Projects';
    } else if (segment === 'new') {
      label = 'New';
    } else if (segment === 'edit') {
      label = 'Edit';
    } else if (segment === 'workspace' && relevantSegments[index + 1]) {
      // Skip workspace segment if followed by a workspace slug
      return;
    } else if (relevantSegments[index - 1] === 'workspace' && routeData?.currentWorkspace) {
      // This is a workspace slug, use workspace name
      label = routeData.currentWorkspace.name || 'Workspace';
    }
    
    // Don't add duplicate breadcrumbs
    const isDuplicate = breadcrumbs.some(b => b.href === pathUpToSegment);
    if (!isDuplicate && label) {
      breadcrumbs.push({
        label: label.charAt(0).toUpperCase() + label.slice(1),
        href: pathUpToSegment,
      });
    }
  });
  
  // Don't show breadcrumbs if we're just on the home page
  if (breadcrumbs.length === 1 && location.pathname === '/app') {
    return null;
  }
  
  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-sm">
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        const Icon = crumb.icon;
        
        return (
          <Fragment key={crumb.href}>
            {index > 0 && (
              <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
            )}
            {isLast ? (
              <span className="flex items-center text-gray-900 font-medium">
                {Icon && <Icon className="h-4 w-4 mr-1.5" />}
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.href}
                className="flex items-center text-gray-500 hover:text-gray-700 transition-colors"
              >
                {Icon && <Icon className="h-4 w-4 mr-1.5" />}
                {crumb.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}