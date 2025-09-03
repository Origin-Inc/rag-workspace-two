import { useLoaderData, useFetcher } from "@remix-run/react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { getUser } from "~/services/auth/auth.server";
import { prisma } from "~/utils/db.server";
import { DocumentIcon, PlusIcon, FolderIcon } from "@heroicons/react/24/outline";
import { useFormattedDate } from "~/hooks/useFormattedDate";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getUser(request);
  
  if (!user) {
    return redirect("/auth/signin");
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

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await getUser(request);
  
  if (!user) {
    return redirect("/auth/signin");
  }

  const projectId = params.projectId;
  if (!projectId) {
    return json({ error: "Project ID required" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create-page") {
    const title = formData.get("title") as string || "Untitled Page";
    
    // Get the project to get workspace_id
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true }
    });
    
    if (!project) {
      return json({ error: "Project not found" }, { status: 404 });
    }
    
    // Generate slug from title
    const baseSlug = title.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 100) || 'untitled';
    
    // Ensure slug is unique within project
    const existingPages = await prisma.page.findMany({
      where: {
        projectId,
        slug: {
          startsWith: baseSlug
        }
      },
      select: { slug: true }
    });
    
    let slug = baseSlug;
    if (existingPages.some(p => p.slug === slug)) {
      // Add a number suffix to make it unique
      let counter = 1;
      while (existingPages.some(p => p.slug === `${baseSlug}-${counter}`)) {
        counter++;
      }
      slug = `${baseSlug}-${counter}`;
    }
    
    try {
      // Store canvas settings in metadata
      const metadata = {
        canvasSettings: {
          grid: { columns: 12, rowHeight: 40, gap: 8 }
        }
      };
      
      console.log("Creating page with data:", {
        projectId,
        workspaceId: project.workspaceId,
        title,
        slug,
      });
      
      // Use Prisma's create method instead of raw SQL
      const page = await prisma.page.create({
        data: {
          projectId,
          workspaceId: project.workspaceId,
          title,
          slug,
          content: {},
          position: 0,
          metadata,
          isPublic: false,
          isArchived: false,
        },
        select: {
          id: true
        }
      });

      console.log("Page created successfully:", page.id);
      // Redirect to the editor for the new page
      return redirect(`/editor/${page.id}`);
    } catch (error) {
      console.error("Error creating page - Full error:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack");
      return json({ error: error instanceof Error ? error.message : "Failed to create page" }, { status: 500 });
    }
  }

  return json({ error: "Invalid intent" }, { status: 400 });
}

function PageCard({ page }: { page: any }) {
  const formattedDate = useFormattedDate(page.updatedAt);
  
  return (
    <a
      href={`/editor/${page.id}`}
      className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start">
        <DocumentIcon className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {page.title || 'Untitled'}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Updated {formattedDate}
          </p>
        </div>
      </div>
    </a>
  );
}

export default function ProjectPage() {
  const { project } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const handleCreatePage = () => {
    const title = prompt("Enter page title (or leave blank for 'Untitled'):");
    const formData = new FormData();
    formData.set("intent", "create-page");
    formData.set("title", title || "Untitled Page");
    fetcher.submit(formData, { method: "POST" });
  };

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
        <button 
          onClick={handleCreatePage}
          disabled={fetcher.state === "submitting"}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          {fetcher.state === "submitting" ? "Creating..." : "New Page"}
        </button>
      </div>

      {/* Pages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {project.pages.length > 0 ? (
          project.pages.map((page) => (
            <PageCard key={page.id} page={page} />
          ))
        ) : (
          <div className="col-span-full bg-white rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
            <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No pages</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating a new page.
            </p>
            <div className="mt-6">
              <button 
                onClick={handleCreatePage}
                disabled={fetcher.state === "submitting"}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                {fetcher.state === "submitting" ? "Creating..." : "New Page"}
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