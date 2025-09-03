import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { supabase } from "~/utils/supabase.server";
import { requireUser } from "~/services/auth/auth.server";
import {
  FolderIcon,
  DocumentIcon,
  PlusIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);

  // Get user's projects
  const { data: projects } = await supabase
    .from("projects")
    .select(`
      *,
      pages:pages(count),
      members:project_collaborators(count)
    `)
    .or(`owner_id.eq.${user.id},project_collaborators.user_id.eq.${user.id}`)
    .order("updated_at", { ascending: false });

  return json({ projects: projects || [] });
}

export default function ProjectsPage() {
  const { projects } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <p className="mt-2 text-gray-600">
            Manage your projects and pages
          </p>
        </div>

        {/* Create new project */}
        <div className="mb-8">
          <Link
            to="/projects/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <PlusIcon className="h-5 w-5" />
            New Project
          </Link>
        </div>

        {/* Projects grid */}
        {projects.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FolderIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No projects yet
            </h3>
            <p className="text-gray-500 mb-4">
              Create your first project to get started
            </p>
            <Link
              to="/projects/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <PlusIcon className="h-5 w-5" />
              Create Project
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <FolderIcon className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {project.name}
                        </h3>
                        {project.description && (
                          <p className="text-sm text-gray-500 mt-1">
                            {project.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <DocumentIcon className="h-4 w-4" />
                      {project.pages?.[0]?.count || 0} pages
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      {project.members?.[0]?.count || 1} members
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <Link
                      to={`/projects/${project.id}`}
                      className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
                    >
                      Open project
                      <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                    
                    {/* Quick action to create new page */}
                    <Link
                      to={`/projects/${project.id}/pages/new`}
                      className="text-gray-500 hover:text-gray-700 text-sm"
                    >
                      New page
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}