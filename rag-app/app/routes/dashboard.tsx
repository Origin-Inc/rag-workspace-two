import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import { requireUser } from '~/services/auth/auth.server';
import { ChatInterface } from '~/components/chat/ChatInterface';
import { RecentPages } from '~/components/dashboard/RecentPages';
import { FileText } from 'lucide-react';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  
  // For now, using a hardcoded workspace ID - you should get this from the user's session or database
  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  
  return json({
    user,
    workspaceId
  });
}

export default function Dashboard() {
  const { user, workspaceId } = useLoaderData<typeof loader>();
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Simple header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              RAG Workspace
            </h1>
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
            </div>
          </div>
        </div>
      </header>
      
      {/* Main content area with 70/30 split */}
      <main className="h-[calc(100vh-73px)]"> {/* Subtract header height */}
        <div className="h-full flex gap-4 p-4">
          {/* Chat Interface - 70% width */}
          <div className="flex-1" style={{ flexBasis: '70%' }}>
            <ChatInterface workspaceId={workspaceId} />
          </div>
          
          {/* Recent Pages - 30% width */}
          <div className="flex-shrink-0" style={{ width: '30%', minWidth: '300px', maxWidth: '400px' }}>
            <RecentPages />
          </div>
        </div>
      </main>
    </div>
  );
}