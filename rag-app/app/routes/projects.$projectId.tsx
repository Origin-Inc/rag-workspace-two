import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, useFetcher } from "@remix-run/react";
import { supabase } from "~/utils/supabase.server";
import { requireUser } from "~/services/auth/auth.server";
import {
  DocumentIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { projectId } = params;
  if (!projectId) throw new Response("Project ID required", { status: 400 });

  const user = await requireUser(request);

  // Get project with pages
  const { data: project, error } = await supabase
    .from("projects")
    .select(`
      *,
      pages:pages(*),
      members:project_collaborators(*)
    `)
    .eq("id", projectId)
    .single();

  if (error || !project) {
    throw new Response("Project not found", { status: 404 });
  }

  // Check if user has access
  const isMember = project.owner_id === user.id || 
    project.members.some((m: any) => m.user_id === user.id);
  
  if (!isMember) {
    throw new Response("Access denied", { status: 403 });
  }

  return json({ project, user });
}

export async function action({ params, request }: ActionFunctionArgs) {
  const { projectId } = params;
  if (!projectId) return json({ error: "Project ID required" }, { status: 400 });

  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create-page") {
    const title = formData.get("title") as string;
    
    const { data: page, error } = await supabase
      .from("pages")
      .insert({
        project_id: projectId,
        title,
        content: {},
        canvas_settings: {
          grid: { columns: 12, rowHeight: 40, gap: 8 }
        },
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return json({ error: "Failed to create page" }, { status: 500 });
    }

    return json({ page });
  }

  if (intent === "delete-page") {
    const pageId = formData.get("pageId") as string;
    
    const { error } = await supabase
      .from("pages")
      .delete()
      .eq("id", pageId)
      .eq("project_id", projectId);

    if (error) {
      return json({ error: "Failed to delete page" }, { status: 500 });
    }

    return json({ success: true });
  }

  return json({ error: "Invalid intent" }, { status: 400 });
}

export default function ProjectDetailPage() {
  const { project, user } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const isOwner = project.owner_id === user.id;

  const handleCreatePage = () => {
    const title = prompt("Enter page title:");
    if (title) {
      const formData = new FormData();
      formData.set("intent", "create-page");
      formData.set("title", title);
      fetcher.submit(formData, { method: "POST" });
    }
  };

  const handleDeletePage = (pageId: string, title: string) => {
    if (confirm(`Delete page "${title}"?`)) {
      const formData = new FormData();
      formData.set("intent", "delete-page");
      formData.set("pageId", pageId);
      fetcher.submit(formData, { method: "POST" });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/projects"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to projects
          </Link>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
              {project.description && (
                <p className="mt-2 text-gray-600">{project.description}</p>
              )}
            </div>
            
            {isOwner && (
              <Link
                to={`/projects/${project.id}/settings`}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Settings
              </Link>
            )}
          </div>
        </div>

        {/* Pages section */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Pages</h2>
            <button
              onClick={handleCreatePage}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4" />
              New Page
            </button>
          </div>

          <div className="divide-y divide-gray-200">
            {project.pages.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <DocumentIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No pages yet</p>
                <button
                  onClick={handleCreatePage}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <PlusIcon className="h-5 w-5" />
                  Create your first page
                </button>
              </div>
            ) : (
              project.pages.map((page: any) => (
                <div
                  key={page.id}
                  className="px-6 py-4 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <DocumentIcon className="h-5 w-5 text-gray-400" />
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {page.title || "Untitled Page"}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Updated {new Date(page.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/editor/${page.id}`}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Edit page"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Link>
                    {isOwner && (
                      <button
                        onClick={() => handleDeletePage(page.id, page.title)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete page"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}