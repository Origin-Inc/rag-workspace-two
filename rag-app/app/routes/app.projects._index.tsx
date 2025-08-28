import { useLoaderData, Link, useFetcher } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { getUser } from "~/services/auth/auth.server";
import { prisma } from "~/utils/db.server";
import { useState, useEffect } from "react";
import { ProjectSidebar } from "~/components/projects/ProjectSidebar";
import { ProjectTemplates } from "~/components/projects/ProjectTemplates";
import { PlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  
  if (!user) {
    return redirect("/auth/signin");
  }

  // Get user's workspaces
  const userWorkspaces = await prisma.userWorkspace.findMany({
    where: { userId: user.id },
    include: {
      workspace: true,
      role: true,
    },
  });

  if (userWorkspaces.length === 0) {
    // Create a default workspace for the user
    const workspace = await prisma.workspace.create({
      data: {
        name: `${user.name || user.email.split('@')[0]}'s Workspace`,
        slug: `workspace-${user.id.slice(0, 8)}`,
      },
    });

    await prisma.userWorkspace.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        roleId: (await prisma.role.findFirst({ where: { name: "owner" } }))?.id!,
      },
    });

    return redirect(`/app/projects?workspaceId=${workspace.id}`);
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId") || userWorkspaces[0].workspace.id;

  // Fetch projects from API route
  const projectsResponse = await fetch(
    `${url.origin}/api/projects?workspaceId=${workspaceId}`,
    {
      headers: {
        Cookie: request.headers.get("Cookie") || "",
      },
    }
  );

  const projectsData = await projectsResponse.json();

  return json({
    user,
    workspaces: userWorkspaces.map(uw => uw.workspace),
    currentWorkspace: userWorkspaces.find(uw => uw.workspace.id === workspaceId)?.workspace || userWorkspaces[0].workspace,
    projects: projectsData.projects || [],
    hierarchy: projectsData.hierarchy || null,
  });
}

export default function ProjectsPage() {
  const { user, workspaces, currentWorkspace, projects } = useLoaderData<typeof loader>();
  const [showTemplates, setShowTemplates] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fetcher = useFetcher();

  const handleCreateFromTemplate = async (template: any) => {
    fetcher.submit(
      {
        workspaceId: currentWorkspace.id,
        name: template.name,
        description: template.description,
        templateId: template.id === "blank" ? undefined : template.id,
      },
      {
        method: "POST",
        action: "/api/projects",
        encType: "application/json",
      }
    );
    setShowTemplates(false);
  };

  if (showTemplates) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => setShowTemplates(false)}
            className="mb-4 text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back to Projects
          </button>
          <ProjectTemplates
            workspaceId={currentWorkspace.id}
            onSelectTemplate={handleCreateFromTemplate}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0">
        <ProjectSidebar
          workspaceId={currentWorkspace.id}
          projects={projects}
          currentUserId={user.id}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived(!showArchived)}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
                <p className="mt-1 text-gray-600">
                  Manage your projects and collaborate with your team
                </p>
              </div>
              <button
                onClick={() => setShowTemplates(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                New Project
              </button>
            </div>

            {/* Workspace Selector */}
            {workspaces.length > 1 && (
              <div className="mt-4">
                <select
                  value={currentWorkspace.id}
                  onChange={(e) => {
                    window.location.href = `/app/projects?workspaceId=${e.target.value}`;
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Projects Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects
              .filter((project: any) => 
                project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                project.description?.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((project: any) => (
                <Link
                  key={project.id}
                  to={`/app/project/${project.id}`}
                  className="block bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div
                      className="p-2 rounded-lg"
                      style={{ backgroundColor: project.color || "#E5E7EB" }}
                    >
                      <span className="text-2xl">{project.icon || "📁"}</span>
                    </div>
                    {project.is_archived && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        Archived
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">
                    {project.name}
                  </h3>
                  {project.description && (
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                    <span>{project.project_pages?.[0]?.count || 0} pages</span>
                    <span>Updated {new Date(project.updated_at).toLocaleDateString()}</span>
                  </div>
                </Link>
              ))}
          </div>

          {projects.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating a new project.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => setShowTemplates(true)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  New Project
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}