import { Link } from "@remix-run/react";
import {
  DocumentIcon,
  FolderIcon,
  ClockIcon,
  UserGroupIcon,
  ServerIcon,
  ChartBarIcon,
  ArrowRightIcon,
  CalendarIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "~/utils/date";
import { cn } from "~/utils/cn";

interface WorkspaceOverviewProps {
  workspace: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    createdAt: string | Date;
    updatedAt: string | Date;
  };
  recentPages: Array<{
    id: string;
    title: string | null;
    updatedAt: string | Date;
    project: {
      id: string;
      name: string;
    };
    thumbnailUrl?: string | null;
  }>;
  recentProjects: Array<{
    id: string;
    name: string;
    description?: string | null;
    updatedAt: string | Date;
    _count: {
      pages: number;
    };
  }>;
  stats: {
    totalProjects: number;
    totalPages: number;
    totalMembers: number;
    storageUsed: number; // in bytes
    aiCreditsUsed: number;
    aiCreditsLimit: number;
  };
}

export function WorkspaceOverview({
  workspace,
  recentPages,
  recentProjects,
  stats,
}: WorkspaceOverviewProps) {
  // Format storage for display
  const formatStorage = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Calculate workspace age
  const workspaceAge = formatDistanceToNow(workspace.createdAt).replace(' ago', '');

  // Calculate credits percentage
  const creditsPercentage = stats.aiCreditsLimit > 0 
    ? Math.round((stats.aiCreditsUsed / stats.aiCreditsLimit) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Workspace Header Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                {workspace.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {workspace.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  /{workspace.slug}
                </p>
              </div>
            </div>
            {workspace.description && (
              <p className="mt-3 text-gray-600 dark:text-gray-300">
                {workspace.description}
              </p>
            )}
            <div className="mt-4 flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center">
                <CalendarIcon className="h-4 w-4 mr-1" />
                Created {workspaceAge} ago
              </div>
              <div className="flex items-center">
                <ClockIcon className="h-4 w-4 mr-1" />
                Updated {formatDistanceToNow(workspace.updatedAt)}
              </div>
            </div>
          </div>
          <Link
            to={`/workspace/${workspace.slug}/settings`}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Settings
          </Link>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Projects
              </p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {stats.totalProjects}
              </p>
            </div>
            <FolderIcon className="h-8 w-8 text-blue-500 opacity-50" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Pages
              </p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {stats.totalPages}
              </p>
            </div>
            <DocumentIcon className="h-8 w-8 text-green-500 opacity-50" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Members
              </p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {stats.totalMembers}
              </p>
            </div>
            <UserGroupIcon className="h-8 w-8 text-purple-500 opacity-50" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Storage
              </p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                {formatStorage(stats.storageUsed)}
              </p>
            </div>
            <ServerIcon className="h-8 w-8 text-orange-500 opacity-50" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                AI Credits
              </p>
              <div className="mt-1 flex items-baseline">
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {creditsPercentage}%
                </p>
                <p className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                  used
                </p>
              </div>
              <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    creditsPercentage > 80
                      ? "bg-red-500"
                      : creditsPercentage > 60
                      ? "bg-yellow-500"
                      : "bg-green-500"
                  )}
                  style={{ width: `${Math.min(creditsPercentage, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Items Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Pages */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Recent Pages
              </h3>
              <Link
                to="/app/pages"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
              >
                View all
                <ArrowRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {recentPages.length > 0 ? (
              recentPages.slice(0, 5).map((page) => (
                <Link
                  key={page.id}
                  to={`/app/page/${page.id}`}
                  className="flex items-center px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {page.thumbnailUrl ? (
                    <img
                      src={page.thumbnailUrl}
                      alt=""
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <DocumentIcon className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {page.title || "Untitled"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      in {page.project.name}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDistanceToNow(page.updatedAt)}
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-6 py-8 text-center">
                <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  No pages yet
                </p>
                <Link
                  to="/app/pages/new"
                  className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Create your first page
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent Projects */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Active Projects
              </h3>
              <Link
                to="/app/projects"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
              >
                View all
                <ArrowRightIcon className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="p-6">
            {recentProjects.length > 0 ? (
              <div className="space-y-4">
                {recentProjects.slice(0, 4).map((project) => (
                  <Link
                    key={project.id}
                    to={`/app/project/${project.id}`}
                    className="block p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                          <FolderIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {project.name}
                          </p>
                          {project.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                              {project.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center">
                          <DocumentIcon className="h-3 w-3 mr-1" />
                          {project._count.pages}
                        </span>
                        <span>
                          {formatDistanceToNow(project.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FolderIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  No projects yet
                </p>
                <Link
                  to="/app/projects/new"
                  className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Create your first project
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CubeIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Quick Actions
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Link
              to="/app/pages/new"
              className="px-3 py-1 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              New Page
            </Link>
            <Link
              to="/app/projects/new"
              className="px-3 py-1 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              New Project
            </Link>
            <Link
              to="/app/import"
              className="px-3 py-1 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Import
            </Link>
            <Link
              to="/app/team"
              className="px-3 py-1 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Invite Team
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}