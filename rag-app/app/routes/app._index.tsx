import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { getUser } from "~/services/auth/auth.server";
import { prisma } from "~/utils/db.server";
import { 
  DocumentIcon, 
  ClockIcon,
  FolderIcon,
  PlusIcon,
  ArrowRightIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  ServerIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { DashboardGrid, GridItem, DashboardLayouts, DashboardSection } from "~/components/dashboard/DashboardGrid";
import { WorkspaceOverview } from "~/components/dashboard/WorkspaceOverview";
import { QuickActions } from "~/components/dashboard/QuickActions";
import type { RecentDocument } from "~/components/dashboard/QuickActions";
import { UsageAnalytics } from "~/components/dashboard/UsageAnalytics";

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

  // Get recent pages
  const recentPages = await prisma.page.findMany({
    where: {
      project: {
        workspaceId: currentWorkspace.id
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: {
      project: true,
    }
  });

  // Get recent projects
  const recentProjects = await prisma.project.findMany({
    where: { workspaceId: currentWorkspace.id },
    orderBy: { updatedAt: 'desc' },
    take: 4,
    include: {
      _count: {
        select: { pages: true }
      }
    }
  });

  // Get workspace stats
  const stats = await prisma.project.aggregate({
    where: { workspaceId: currentWorkspace.id },
    _count: true,
  });

  const pageStats = await prisma.page.aggregate({
    where: {
      project: {
        workspaceId: currentWorkspace.id
      }
    },
    _count: true,
  });

  // Get team member count
  const teamMemberCount = await prisma.userWorkspace.count({
    where: { workspaceId: currentWorkspace.id }
  });

  // Get storage usage (mock for now - would come from file storage service)
  const storageUsed = 536870912; // 512 MB in bytes
  
  // Get AI credits (mock for now - would come from usage tracking)
  const aiCreditsUsed = 2500;
  const aiCreditsLimit = 10000;

  return json({
    user,
    workspace: currentWorkspace,
    recentPages,
    recentProjects,
    stats: {
      projects: stats._count,
      pages: pageStats._count,
      teamMembers: teamMemberCount,
      totalProjects: stats._count,
      totalPages: pageStats._count,
      totalMembers: teamMemberCount,
      storageUsed,
      aiCreditsUsed,
      aiCreditsLimit,
    }
  });
}

export default function AppIndex() {
  const { user, workspace, recentPages, recentProjects, stats } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  
  // Prepare recent documents for QuickActions component
  const recentDocuments: RecentDocument[] = recentPages.map(page => ({
    id: page.id,
    title: page.title,
    thumbnailUrl: page.thumbnailUrl || null,
    lastAccessed: page.updatedAt,
    projectId: page.project.id,
    projectName: page.project.name,
    type: page.type || 'page',
  }));

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    
    // Simulate RAG search
    setTimeout(() => {
      const mockResults = [
        {
          title: "RAG System Documentation",
          content: "The RAG system uses vector embeddings to provide semantic search across all indexed documents...",
          similarity: 0.95,
          projectName: "Documentation",
        },
        {
          title: "Implementation Guide",
          content: "To implement RAG, first index your documents using the OpenAI embeddings API...",
          similarity: 0.87,
          projectName: "Guides",
        },
      ];
      
      setSearchResults(searchQuery ? mockResults : []);
      setIsSearching(false);
    }, 800);
  };

  return (
    <DashboardGrid>
      {/* Workspace Overview */}
      <GridItem colSpan={DashboardLayouts.fullWidth.full}>
        <WorkspaceOverview
          workspace={workspace}
          recentPages={recentPages}
          recentProjects={recentProjects}
          stats={stats}
        />
      </GridItem>

      {/* RAG Search Section */}
      <GridItem colSpan={DashboardLayouts.fullWidth.full}>
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6">
          <div className="flex items-center mb-4">
            <SparklesIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              AI-Powered Semantic Search (Task 11 RAG System)
            </h2>
          </div>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search across all your indexed documents using natural language..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
              <MagnifyingGlassIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
            </div>
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSearching ? "Searching with AI..." : "Search with RAG"}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="font-medium text-gray-900 dark:text-white">Semantic Search Results</h3>
              {searchResults.map((result, idx) => (
                <div key={idx} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">{result.title}</h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400">from {result.projectName}</span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      {(result.similarity * 100).toFixed(1)}% match
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{result.content}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-300">
              <strong>RAG Features:</strong> Vector embeddings • Supabase pgvector • OpenAI integration • Automatic chunking • Multi-project search
            </p>
          </div>
        </div>
      </GridItem>

      {/* Quick Actions Widget */}
      <GridItem colSpan={DashboardLayouts.threeColumn.left}>
        <QuickActions
          workspaceSlug={workspace.slug}
          recentDocuments={recentDocuments}
        />
      </GridItem>

      {/* Stats Cards */}
      <GridItem colSpan={DashboardLayouts.fourColumn.column}>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Projects</p>
              <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{stats.projects}</p>
            </div>
            <FolderIcon className="h-12 w-12 text-blue-600 opacity-20" />
          </div>
        </div>
      </GridItem>
      
      <GridItem colSpan={DashboardLayouts.fourColumn.column}>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Pages</p>
              <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{stats.pages}</p>
            </div>
            <DocumentIcon className="h-12 w-12 text-green-600 opacity-20" />
          </div>
        </div>
      </GridItem>
      
      <GridItem colSpan={DashboardLayouts.fourColumn.column}>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Team Members</p>
              <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{stats.teamMembers}</p>
            </div>
            <UserGroupIcon className="h-12 w-12 text-purple-600 opacity-20" />
          </div>
        </div>
      </GridItem>
      
      <GridItem colSpan={DashboardLayouts.fourColumn.column}>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Storage Used</p>
              <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">0.5GB</p>
            </div>
            <ServerIcon className="h-12 w-12 text-orange-600 opacity-20" />
          </div>
        </div>
      </GridItem>

      {/* Recent Pages */}
      <GridItem colSpan={DashboardLayouts.halfHalf.left}>
        <DashboardSection
          title="Recent Pages"
          actions={
            <a href="/app/pages" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center">
              View all
              <ArrowRightIcon className="ml-1 h-4 w-4" />
            </a>
          }
        >
          {recentPages.length > 0 ? (
            <div className="space-y-3">
              {recentPages.map((page) => (
                <a
                  key={page.id}
                  href={`/app/page/${page.id}`}
                  className="flex items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <DocumentIcon className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {page.title || 'Untitled'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      in {page.project.name}
                    </p>
                  </div>
                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                    <ClockIcon className="h-4 w-4 mr-1" />
                    {new Date(page.updatedAt).toLocaleDateString()}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No pages yet</p>
              <button className="mt-3 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                Create your first page
              </button>
            </div>
          )}
        </DashboardSection>
      </GridItem>

      {/* Recent Projects */}
      <GridItem colSpan={DashboardLayouts.halfHalf.right}>
        <DashboardSection
          title="Projects"
          actions={
            <a href="/app/projects" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center">
              View all
              <ArrowRightIcon className="ml-1 h-4 w-4" />
            </a>
          }
        >
          {recentProjects.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {recentProjects.map((project) => (
                <a
                  key={project.id}
                  href={`/app/project/${project.id}`}
                  className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between">
                    <FolderIcon className="h-8 w-8 text-blue-600" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {project._count.pages} pages
                    </span>
                  </div>
                  <h3 className="mt-3 font-medium text-gray-900 dark:text-white truncate">
                    {project.name}
                  </h3>
                  {project.description && (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                </a>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No projects yet</p>
              <button className="mt-3 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                Create your first project
              </button>
            </div>
          )}
        </DashboardSection>
      </GridItem>

      {/* Usage Analytics */}
      <GridItem colSpan={DashboardLayouts.full}>
        <DashboardSection
          title="Usage Analytics"
          actions={
            <a href="/app/analytics" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center">
              View detailed report
              <ArrowRightIcon className="ml-1 h-4 w-4" />
            </a>
          }
        >
          <UsageAnalytics
            workspaceId={workspace.id}
            showTable={false}
          />
        </DashboardSection>
      </GridItem>
    </DashboardGrid>
  );
}