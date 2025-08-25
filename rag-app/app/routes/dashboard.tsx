import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import { requireAuthenticatedUser } from '~/services/auth/unified-auth.server';
import { ChatInterface } from '~/components/chat/ChatInterface';
import { RecentPages } from '~/components/dashboard/RecentPages';
import { FileText } from 'lucide-react';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuthenticatedUser(request);
  
  return json({
    user,
    workspaceId: user.currentWorkspaceId,
    workspaceName: user.currentWorkspace.name
  });
}

export default function Dashboard() {
  const { user, workspaceId, workspaceName } = useLoaderData<typeof loader>();
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Simple header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                RAG Workspace
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Working in: {workspaceName}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/templates"
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span className="text-sm font-medium">Templates</span>
              </Link>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {user.email}
              </span>
              <Link
                to="/auth/logout"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Logout
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-8 px-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chat Interface - 2 columns */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                AI Assistant
              </h2>
              <ChatInterface workspaceId={workspaceId} />
            </div>
          </div>

          {/* Recent Pages - 1 column */}
          <div className="lg:col-span-1">
            <RecentPages workspaceId={workspaceId} />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to="/app/projects/new"
            className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow"
          >
            <h3 className="font-medium text-gray-900 dark:text-white">Create Project</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Start a new project
            </p>
          </Link>
          
          <Link
            to="/app/projects/new"
            className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow"
          >
            <h3 className="font-medium text-gray-900 dark:text-white">Page Editor</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Create and edit pages
            </p>
          </Link>
          
          <Link
            to="/app/projects"
            className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow"
          >
            <h3 className="font-medium text-gray-900 dark:text-white">Database Blocks</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Work with structured data
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}