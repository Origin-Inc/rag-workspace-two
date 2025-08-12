import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { getUser } from "~/services/auth/auth.server";
import { prisma } from "~/utils/db.server";
import { DocumentIcon, PlusIcon, FolderIcon } from "@heroicons/react/24/outline";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getUser(request);
  
  if (!user) {
    return redirect("/auth/login");
  }

  const projectId = params.projectId;
  if (!projectId) {
    throw new Response("Project ID is required", { status: 400 });
  }

  // Get project with pages
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      pages: {
        where: { isArchived: false },
        orderBy: { position: 'asc' },
        take: 20,
      },
      workspace: true,
    }
  });

  if (!project) {
    throw new Response("Project not found", { status: 404 });
  }

  // Verify user has access to this project's workspace
  const hasAccess = await prisma.userWorkspace.findFirst({
    where: {
      userId: user.id,
      workspaceId: project.workspaceId,
    }
  });

  if (!hasAccess) {
    throw new Response("Access denied", { status: 403 });
  }

  return json({
    user,
    project,
    currentWorkspace: project.workspace,
  });
}

export default function ProjectPage() {
  const { project } = useLoaderData<typeof loader>();

  return (
    <div className="p-6 lg:p-8">
      {/* Project Header */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <FolderIcon className="h-8 w-8 text-blue-600 mr-3" />
          <h1 className="text-3xl font-bold text-gray-900">
            {project.name}
          </h1>
        </div>
        {project.description && (
          <p className="text-gray-600">{project.description}</p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <PlusIcon className="h-5 w-5 mr-2" />
          New Page
        </button>
      </div>

      {/* Pages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {project.pages.length > 0 ? (
          project.pages.map((page) => (
            <a
              key={page.id}
              href={`/app/page/${page.id}`}
              className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start">
                <DocumentIcon className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {page.title || 'Untitled'}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Updated {new Date(page.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </a>
          ))
        ) : (
          <div className="col-span-full bg-white rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
            <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No pages</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating a new page.
            </p>
            <div className="mt-6">
              <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                <PlusIcon className="h-5 w-5 mr-2" />
                New Page
              </button>
            </div>
          </div>
        )}
      </div>

      {project.pages.length >= 20 && (
        <div className="mt-8 text-center">
          <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            Load more pages
          </button>
        </div>
      )}
    </div>
  );
}