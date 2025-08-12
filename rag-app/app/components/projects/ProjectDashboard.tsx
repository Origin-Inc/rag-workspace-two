import { useState, useEffect } from "react";
import { Link } from "@remix-run/react";
import {
  FolderIcon,
  DocumentIcon,
  PlusIcon,
  UserGroupIcon,
  ClockIcon,
  ChartBarIcon,
  StarIcon,
  EllipsisVerticalIcon,
  ArchiveBoxIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { formatDistanceToNow } from "~/utils/date";

interface ProjectDashboardProps {
  projectId: string;
  project: any;
  pages: any[];
  collaborators: any[];
  activity: any[];
  onRefresh?: () => void;
}

export function ProjectDashboard({
  projectId,
  project,
  pages,
  collaborators,
  activity,
  onRefresh,
}: ProjectDashboardProps) {
  const [isStarred, setIsStarred] = useState(false);
  const [stats, setStats] = useState({
    totalPages: 0,
    recentlyUpdated: 0,
    archivedPages: 0,
    activeCollaborators: 0,
  });

  useEffect(() => {
    // Calculate stats
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    setStats({
      totalPages: pages.filter(p => !p.is_archived).length,
      recentlyUpdated: pages.filter(p => new Date(p.updated_at) > weekAgo).length,
      archivedPages: pages.filter(p => p.is_archived).length,
      activeCollaborators: collaborators.filter(c => c.is_active).length,
    });

    // Check if project is starred by current user
    setIsStarred(project.starred_by?.includes(currentUserId) || false);
  }, [pages, collaborators, project]);

  const handleStar = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/star`, {
        method: isStarred ? "DELETE" : "POST",
      });
      if (response.ok) {
        setIsStarred(!isStarred);
      }
    } catch (error) {
      console.error("Error starring project:", error);
    }
  };

  const recentPages = pages
    .filter(p => !p.is_archived)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  const recentActivity = activity
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Project Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <FolderIcon className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
                <button
                  onClick={handleStar}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label={isStarred ? "Unstar project" : "Star project"}
                >
                  {isStarred ? (
                    <StarIconSolid className="h-6 w-6 text-yellow-500" />
                  ) : (
                    <StarIcon className="h-6 w-6 text-gray-400" />
                  )}
                </button>
              </div>
              {project.description && (
                <p className="mt-1 text-gray-600">{project.description}</p>
              )}
              {project.tags?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {project.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-md"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Link
              to={`/app/projects/${projectId}/new-page`}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              New Page
            </Link>
            <button
              onClick={onRefresh}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Refresh"
            >
              <ArrowPathIcon className="h-5 w-5" />
            </button>
            <button
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="More options"
            >
              <EllipsisVerticalIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <DocumentIcon className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-2xl font-semibold text-gray-900">{stats.totalPages}</p>
              <p className="text-sm text-gray-600">Total Pages</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <ClockIcon className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-2xl font-semibold text-gray-900">{stats.recentlyUpdated}</p>
              <p className="text-sm text-gray-600">Updated This Week</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <UserGroupIcon className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-2xl font-semibold text-gray-900">{stats.activeCollaborators}</p>
              <p className="text-sm text-gray-600">Collaborators</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <ArchiveBoxIcon className="h-8 w-8 text-gray-600" />
            <div className="ml-4">
              <p className="text-2xl font-semibold text-gray-900">{stats.archivedPages}</p>
              <p className="text-sm text-gray-600">Archived</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Pages */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recent Pages</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {recentPages.length > 0 ? (
                recentPages.map((page) => (
                  <Link
                    key={page.id}
                    to={`/app/pages/${page.id}`}
                    className="flex items-center px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <DocumentIcon className="h-5 w-5 text-gray-400 mr-3" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {page.title || "Untitled"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Updated {formatDistanceToNow(page.updated_at)}
                      </p>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="px-6 py-12 text-center">
                  <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-600">No pages yet</p>
                  <Link
                    to={`/app/projects/${projectId}/new-page`}
                    className="mt-3 inline-flex items-center text-sm text-blue-600 hover:text-blue-700"
                  >
                    <PlusIcon className="h-4 w-4 mr-1" />
                    Create your first page
                  </Link>
                </div>
              )}
            </div>
            {recentPages.length > 0 && (
              <div className="px-6 py-3 border-t border-gray-200">
                <Link
                  to={`/app/projects/${projectId}/pages`}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  View all pages →
                </Link>
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="mt-8 bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {recentActivity.length > 0 ? (
                recentActivity.map((item) => (
                  <div key={item.id} className="px-6 py-4">
                    <div className="flex items-start">
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{item.user_name || "System"}</span>
                          {" "}
                          {getActivityDescription(item)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {formatDistanceToNow(item.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-12 text-center">
                  <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-600">No activity yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Collaborators */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Collaborators</h2>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {collaborators.slice(0, 5).map((collaborator) => (
                  <div key={collaborator.id} className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">
                        {collaborator.user?.name?.charAt(0) || collaborator.user?.email?.charAt(0)}
                      </span>
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {collaborator.user?.name || collaborator.user?.email}
                      </p>
                      <p className="text-xs text-gray-500">{collaborator.role}</p>
                    </div>
                  </div>
                ))}
              </div>
              {collaborators.length > 5 && (
                <Link
                  to={`/app/projects/${projectId}/settings/collaborators`}
                  className="mt-4 block text-sm text-blue-600 hover:text-blue-700"
                >
                  View all {collaborators.length} collaborators →
                </Link>
              )}
              <Link
                to={`/app/projects/${projectId}/settings/collaborators`}
                className="mt-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-700"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add collaborator
              </Link>
            </div>
          </div>

          {/* Project Info */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Project Info</h2>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <p className="text-xs text-gray-500">Created</p>
                <p className="text-sm text-gray-900">
                  {new Date(project.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Last Updated</p>
                <p className="text-sm text-gray-900">
                  {formatDistanceToNow(project.updated_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Visibility</p>
                <p className="text-sm text-gray-900 capitalize">{project.visibility}</p>
              </div>
              {project.parent_project_id && (
                <div>
                  <p className="text-xs text-gray-500">Parent Project</p>
                  <Link
                    to={`/app/projects/${project.parent_project_id}`}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    View Parent →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getActivityDescription(activity: any): string {
  switch (activity.action) {
    case "created":
      return `created the project`;
    case "updated":
      return `updated project settings`;
    case "archived":
      return `archived the project`;
    case "page_added":
      return `added a new page "${activity.entity_name}"`;
    case "page_removed":
      return `removed page "${activity.entity_name}"`;
    case "pages_moved":
      return `moved ${activity.details?.count || 0} pages`;
    case "pages_archived":
      return `archived ${activity.details?.count || 0} pages`;
    case "pages_restored":
      return `restored ${activity.details?.count || 0} pages`;
    case "pages_deleted":
      return `deleted ${activity.details?.count || 0} pages`;
    case "pages_reordered":
      return `reordered pages`;
    case "collaborator_added":
      return `added ${activity.entity_name} as ${activity.details?.role}`;
    case "collaborator_removed":
      return `removed ${activity.entity_name} from the project`;
    case "collaborator_updated":
      return `updated collaborator permissions`;
    default:
      return activity.action.replace(/_/g, " ");
  }
}

// Placeholder for current user ID - should come from auth context
const currentUserId = "current-user-id";