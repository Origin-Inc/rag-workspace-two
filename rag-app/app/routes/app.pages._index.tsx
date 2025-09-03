import { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { json } from "@remix-run/node";
import { requireUser } from "~/services/auth/auth.server";
import { pageHierarchyService } from "~/services/page-hierarchy.server";
import { prisma } from "~/utils/db.server";
import { PageTreeNavigation } from "~/components/navigation/PageTreeNavigation";
import { DocumentIcon, PlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  
  // Get user's current workspace
  const userWorkspace = await prisma.userWorkspace.findFirst({
    where: { userId: user.id },
    include: { workspace: true }
  });

  if (!userWorkspace) {
    throw new Response("Workspace not found", { status: 404 });
  }

  // Get page tree for the workspace
  const pageTree = await pageHierarchyService.getPageTree(userWorkspace.workspace.id, 10);
  
  // Get recent pages
  const recentPages = await prisma.page.findMany({
    where: {
      workspaceId: userWorkspace.workspace.id,
      isArchived: false
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      title: true,
      icon: true,
      updatedAt: true
    }
  });

  return json({
    workspace: userWorkspace.workspace,
    pageTree,
    recentPages
  });
}

export default function PagesIndex() {
  const { workspace, pageTree, recentPages } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pages</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Organize your workspace content with nested pages
            </p>
          </div>
          <Link
            to="/app/pages/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            New Page
          </Link>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Page Tree - Takes up 2 columns */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Page Hierarchy
              </h2>
            </div>
            <div className="p-4">
              {pageTree.length > 0 ? (
                <PageTreeNavigation
                  workspaceSlug={workspace.slug}
                  pages={pageTree}
                  onCreatePage={(parentId) => {
                    window.location.href = `/app/pages/new${parentId ? `?parentId=${parentId}` : ''}`;
                  }}
                  onMovePage={async (pageId, newParentId) => {
                    const formData = new FormData();
                    if (newParentId) formData.append('parentId', newParentId);
                    
                    const response = await fetch(`/api/pages/${pageId}`, {
                      method: 'PATCH',
                      body: formData
                    });
                    
                    if (response.ok) {
                      window.location.reload();
                    }
                  }}
                  onDeletePage={async (pageId) => {
                    const response = await fetch(`/api/pages/${pageId}`, {
                      method: 'DELETE'
                    });
                    
                    if (response.ok) {
                      window.location.reload();
                    }
                  }}
                />
              ) : (
                <div className="text-center py-8">
                  <DocumentIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    No pages yet. Create your first page to get started!
                  </p>
                  <Link
                    to="/app/pages/new"
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <PlusIcon className="h-5 w-5 mr-2" />
                    Create First Page
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Pages - Single column */}
        <div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Recently Updated
              </h2>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {recentPages.map(page => (
                <Link
                  key={page.id}
                  to={`/editor/${page.id}`}
                  className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center">
                    <span className="text-lg mr-3">{page.icon || "📄"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {page.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(page.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              Workspace Stats
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Total Pages</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {pageTree.reduce(function countPages(total, page): number {
                    return total + 1 + (page.children?.reduce(countPages, 0) || 0);
                  }, 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Root Pages</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {pageTree.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}