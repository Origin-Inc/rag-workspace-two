import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireAuthenticatedUser } from "~/services/auth/auth.server";
import { prisma } from "~/utils/db.server";
import { ChatInterface } from "~/components/chat/ChatInterface";
import { FileText, Clock, Folder, ExternalLink } from "lucide-react";
import { Link } from "@remix-run/react";
import { DuckDBTest } from "~/components/duckdb-test";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuthenticatedUser(request);

  // Get recent pages from the user's current workspace
  const recentPages = await prisma.page.findMany({
    where: {
      workspaceId: user.workspaceId,
      isArchived: false
    },
    select: {
      id: true,
      title: true,
      content: true,
      icon: true,
      updatedAt: true,
      parent: {
        select: {
          id: true,
          title: true
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    },
    take: 6
  });

  // Format pages for display
  const formattedPages = recentPages.map(page => ({
    id: page.id,
    title: page.title || 'Untitled',
    preview: page.content ? 
      (typeof page.content === 'string' 
        ? page.content.substring(0, 100) + '...'
        : JSON.stringify(page.content).substring(0, 100) + '...') 
      : 'No content yet...',
    type: page.icon || 'document',
    lastAccessed: page.updatedAt,
    url: `/editor/${page.id}`,
    parentTitle: page.parent?.title
  }));

  // Get workspace details
  const workspace = await prisma.workspace.findUnique({
    where: { id: user.workspaceId }
  });

  return json({
    user,
    currentWorkspace: workspace,
    recentPages: formattedPages,
    workspaceId: user.workspaceId
  });
}

function formatTimeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'note':
      return <FileText className="w-4 h-4" />;
    case 'link':
      return <ExternalLink className="w-4 h-4" />;
    case 'document':
    default:
      return <Folder className="w-4 h-4" />;
  }
}

export default function AppIndex() {
  const { user, currentWorkspace, recentPages, workspaceId } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Welcome back, {user.name || user.email.split('@')[0]}!
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          You're working in <span className="font-medium">{currentWorkspace.name}</span>
        </p>
      </div>

      {/* DuckDB Test Component - Temporary for testing */}
      <div className="mb-8">
        <DuckDBTest />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chat Interface - Takes up 2 columns on large screens */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Ask AI Assistant
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Get help with your workspace content and documents
              </p>
            </div>
            <div className="p-4">
              <ChatInterface workspaceId={workspaceId} />
            </div>
          </div>
        </div>

        {/* Recent Pages - Single column */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Recent Pages
              </h2>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {recentPages.length > 0 ? (
                recentPages.map((page) => (
                  <Link
                    key={page.id}
                    to={page.url}
                    className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1 min-w-0">
                        <div className="flex-shrink-0 mt-1">
                          {getTypeIcon(page.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {page.title}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                            {page.preview}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 ml-2">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatTimeAgo(page.lastAccessed)}
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="p-8 text-center">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No pages yet. Create your first page to get started!
                  </p>
                  <Link
                    to="/app/pages/new"
                    className="inline-flex items-center px-4 py-2 mt-4 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    Create Page
                  </Link>
                </div>
              )}
            </div>
            {recentPages.length > 0 && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <Link
                  to="/app/pages"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  View all pages →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          to="/app/pages/new"
          className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
        >
          <h3 className="font-medium text-gray-900 dark:text-white">Create Page</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Start a new page in your workspace
          </p>
        </Link>
        
        <Link
          to="/app/pages"
          className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
        >
          <h3 className="font-medium text-gray-900 dark:text-white">Browse Pages</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            View and organize your workspace pages
          </p>
        </Link>
        
        <Link
          to="/app/settings"
          className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
        >
          <h3 className="font-medium text-gray-900 dark:text-white">Settings</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Manage workspace and integrations
          </p>
        </Link>
      </div>
    </div>
  );
}