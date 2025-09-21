import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { json } from "@remix-run/node";
import { requireUser } from "~/services/auth/auth.server";
import { pageHierarchyService } from "~/services/page-hierarchy.server";
import { prisma } from "~/utils/db.server";
import { useState } from "react";
import { DocumentIcon, FolderIcon } from "@heroicons/react/24/outline";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const parentId = url.searchParams.get("parentId");
  
  // Get user's current workspace
  const userWorkspace = await prisma.userWorkspace.findFirst({
    where: { userId: user.id },
    include: { workspace: true }
  });

  if (!userWorkspace) {
    throw new Response("Workspace not found", { status: 404 });
  }

  let parentPage = null;
  if (parentId) {
    parentPage = await prisma.page.findUnique({
      where: { id: parentId },
      select: { id: true, title: true }
    });
  }

  return json({
    workspace: userWorkspace.workspace,
    parentPage
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  
  const title = formData.get("title") as string;
  const parentId = formData.get("parentId") as string | null;
  const icon = formData.get("icon") as string | null;
  
  if (!title) {
    return json({ error: "Title is required" }, { status: 400 });
  }

  // Get user's current workspace
  const userWorkspace = await prisma.userWorkspace.findFirst({
    where: { userId: user.id },
    include: { workspace: true }
  });

  if (!userWorkspace) {
    throw new Response("Workspace not found", { status: 404 });
  }

  try {
    const page = await pageHierarchyService.createWorkspacePage({
      workspaceId: userWorkspace.workspace.id,
      parentId: parentId || undefined,
      title,
      icon: icon || undefined,
      userId: user.id,
      content: { type: "doc", content: [] },
      blocks: []
    });

    return redirect(`/editor/${page.id}`);
  } catch (error) {
    console.error("Error creating page:", error);
    return json({ error: "Failed to create page" }, { status: 500 });
  }
}

export default function NewPage() {
  const { workspace, parentPage } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedIcon, setSelectedIcon] = useState<string>("📄");
  
  const commonIcons = ["📄", "📁", "📝", "📊", "📈", "🎯", "💡", "🚀", "⭐", "🔧"];

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="bg-theme-bg-primary rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Create New Page
        </h1>
        
        {parentPage && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Creating subpage under: <strong>{parentPage.title}</strong>
            </p>
          </div>
        )}

        <Form method="post" className="space-y-6">
          {parentPage && (
            <input type="hidden" name="parentId" value={parentPage.id} />
          )}
          
          {/* Icon Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Icon
            </label>
            <div className="flex gap-2 flex-wrap">
              {commonIcons.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  className={`
                    w-10 h-10 flex items-center justify-center rounded-lg border-2 transition-colors
                    ${selectedIcon === icon 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    }
                  `}
                >
                  <span className="text-lg">{icon}</span>
                </button>
              ))}
            </div>
            <input type="hidden" name="icon" value={selectedIcon} />
          </div>

          {/* Title Input */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Page Title
            </label>
            <input
              type="text"
              id="title"
              name="title"
              required
              autoFocus
              className="w-full px-4 py-2 bg-theme-text-highlight"
              placeholder="Enter page title..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
            >
              Create Page
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}