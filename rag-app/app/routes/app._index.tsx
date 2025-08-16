import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { getUser } from "~/services/auth/auth.server";
import { prisma } from "~/utils/db.server";
import { ChatInterface } from "~/components/chat/ChatInterface";
import { FileText, Clock, Folder, ExternalLink } from "lucide-react";
import { Link } from "@remix-run/react";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  
  if (!user) {
    return redirect("/auth/login");
  }

  // Get user's current workspace
  const currentWorkspace = user.workspaceId 
    ? await prisma.workspace.findUnique({
        where: { id: user.workspaceId }
      })
    : await prisma.workspace.findFirst({
        where: {
          userWorkspaces: {
            some: { userId: user.id }
          }
        }
      });

  if (!currentWorkspace) {
    return redirect("/onboarding/workspace");
  }

  // Get recent pages (mock data for now)
  const recentPages = [
    {
      id: '1',
      title: 'Project Documentation',
      preview: 'Overview of the RAG system architecture and implementation details...',
      type: 'document',
      lastAccessed: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
      url: '/app/projects/1/pages/1'
    },
    {
      id: '2',
      title: 'Meeting Notes - Q1 Planning',
      preview: 'Discussed roadmap priorities and resource allocation for Q1...',
      type: 'note',
      lastAccessed: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      url: '/app/projects/1/pages/2'
    },
    {
      id: '3',
      title: 'API Reference Guide',
      preview: 'Complete API documentation for all endpoints and services...',
      type: 'document',
      lastAccessed: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      url: '/app/projects/1/pages/3'
    },
    {
      id: '4',
      title: 'Research: Vector Databases',
      preview: 'Comparison of different vector database solutions for RAG...',
      type: 'link',
      lastAccessed: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
      url: '/app/projects/1/pages/4'
    },
    {
      id: '5',
      title: 'Task List - Sprint 3',
      preview: 'Sprint 3 deliverables and task assignments...',
      type: 'note',
      lastAccessed: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      url: '/app/projects/1/pages/5'
    },
    {
      id: '6',
      title: 'Architecture Diagram',
      preview: 'System architecture and component relationships...',
      type: 'document',
      lastAccessed: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
      url: '/app/projects/1/pages/6'
    }
  ];

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000'; // Hardcoded for now

  return json({
    user,
    currentWorkspace,
    recentPages,
    workspaceId
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
  return `${days}d ago`;
}

function getPageIcon(type: string) {
  switch (type) {
    case 'document':
      return <FileText className="w-5 h-5" />;
    case 'note':
      return <FileText className="w-5 h-5" />;
    case 'link':
      return <ExternalLink className="w-5 h-5" />;
    default:
      return <Folder className="w-5 h-5" />;
  }
}

export default function AppHome() {
  const { user, currentWorkspace, recentPages, workspaceId } = useLoaderData<typeof loader>();

  return (
    <div className="p-6 lg:p-10 space-y-20">
      {/* Row 1: Chat Interface with heading */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
          What can I help you with today?
        </h1>
        <div className="h-[500px] border border-gray-200 dark:border-gray-700 rounded-lg">
          <ChatInterface workspaceId={workspaceId} />
        </div>
      </div>

      {/* Row 2: Recently Used Pages in Tile Form */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recently Used Pages
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-6 gap-4">
          {recentPages.map((page) => (
            <Link
              key={page.id}
              to={page.url}
              className="w-40 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow p-2 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 group aspect-square"
            >
              <div className="flex flex-col items-start gap-3">
                <div className="text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {getPageIcon(page.type)}
                </div>
                <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 overflow-hidden">
                  {page.title}
                </h3>
                  <div className="flex items-center gap-2 mt-3">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-500">
                      {formatTimeAgo(page.lastAccessed)}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                      {page.type}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
        
        {recentPages.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              No recent pages yet
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Pages you visit will appear here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}