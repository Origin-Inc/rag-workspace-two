import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, Form } from "@remix-run/react";
import { protectedLoader } from "~/services/auth/auth.server";
import { workspaceService } from "~/services/workspace.server";
import { requirePermission } from "~/services/auth/auth.server";
import { prisma } from "~/utils/db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const user = await protectedLoader(request, async (authenticatedUser) => authenticatedUser);
  
  const slug = params.slug;
  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  // Get workspace by slug
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    include: {
      userWorkspaces: {
        where: { userId: user.id },
        include: { role: true },
      },
    },
  });

  if (!workspace) {
    throw new Response("Not Found", { status: 404 });
  }

  // Check if user has access
  if (workspace.userWorkspaces.length === 0) {
    throw new Response("Forbidden", { status: 403 });
  }

  // Get full workspace data with extended settings
  const fullWorkspace = await workspaceService.getWorkspace(workspace.id);
  
  // Check workspace limits
  const limits = await workspaceService.checkWorkspaceLimits(workspace.id);

  // Get workspace templates
  const templates = await workspaceService.getWorkspaceTemplates(workspace.id);

  return json({
    workspace: fullWorkspace,
    limits,
    templates,
    userRole: workspace.userWorkspaces[0].role,
  });
};

export async function action({ request, params }: ActionFunctionArgs) {
  const slug = params.slug;
  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
  });

  if (!workspace) {
    throw new Response("Not Found", { status: 404 });
  }

  const formData = await request.formData();
  const action = formData.get("_action");

  switch (action) {
    case "updateSettings": {
      await requirePermission(request, "workspace", "update");
      
      const settings = JSON.parse(formData.get("settings") as string || "{}");
      const updatedWorkspace = await workspaceService.updateWorkspace(
        workspace.id,
        { settings }
      );
      
      return json({ success: true, workspace: updatedWorkspace });
    }

    case "upgradeTier": {
      await requirePermission(request, "workspace", "update");
      
      const tier = formData.get("tier") as any;
      const updatedWorkspace = await workspaceService.updateWorkspace(
        workspace.id,
        { tier }
      );
      
      return json({ success: true, workspace: updatedWorkspace });
    }

    case "createTemplate": {
      await requirePermission(request, "template", "create");
      
      const pageId = formData.get("pageId") as string;
      const name = formData.get("name") as string;
      const category = formData.get("category") as string;
      const description = formData.get("description") as string;
      const isPublic = formData.get("isPublic") === "true";
      
      const template = await workspaceService.createTemplate(
        pageId,
        name,
        category,
        description,
        isPublic,
        workspace.id
      );
      
      return json({ success: true, template });
    }

    case "delete": {
      await requirePermission(request, "workspace", "delete");
      
      await workspaceService.deleteWorkspace(workspace.id);
      
      return redirect("/dashboard");
    }

    default:
      return json({ error: "Invalid action" }, { status: 400 });
  }
}

export default function WorkspacePage() {
  const { workspace, limits, templates, userRole } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  
  const isOwner = userRole.name === "Workspace Owner";
  const isAdmin = userRole.name === "Workspace Admin" || isOwner;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{workspace.name}</h1>
              <p className="text-gray-500 mt-1">/{workspace.slug}</p>
            </div>
            {isOwner && (
              <Form method="post">
                <input type="hidden" name="_action" value="delete" />
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  onClick={(e) => {
                    if (!confirm("Are you sure you want to delete this workspace?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  Delete Workspace
                </button>
              </Form>
            )}
          </div>
        </div>

        {/* Usage Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Storage Used</h3>
            <div className="mt-2">
              <p className="text-2xl font-bold text-gray-900">
                {Math.round(limits.usage.storage.used / 1024 / 1024)} MB
              </p>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${limits.usage.storage.percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                of {Math.round(limits.usage.storage.limit / 1024 / 1024 / 1024)} GB
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">AI Credits</h3>
            <div className="mt-2">
              <p className="text-2xl font-bold text-gray-900">
                {limits.usage.aiCredits.used}
              </p>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{ width: `${limits.usage.aiCredits.percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                of {limits.usage.aiCredits.limit} credits
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Team Members</h3>
            <div className="mt-2">
              <p className="text-2xl font-bold text-gray-900">
                {limits.usage.members.used}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                of {limits.usage.members.limit} members
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Pages</h3>
            <div className="mt-2">
              <p className="text-2xl font-bold text-gray-900">
                {limits.usage.pages.used}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                of {limits.usage.pages.limit} pages
              </p>
            </div>
          </div>
        </div>

        {/* Workspace Tier */}
        {workspace.extended && isOwner && (
          <div className="bg-white shadow rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Workspace Plan</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg">
                  Current Plan: <span className="font-bold capitalize">{workspace.extended.tier}</span>
                </p>
              </div>
              {workspace.extended.tier === 'free' && (
                <fetcher.Form method="post">
                  <input type="hidden" name="_action" value="upgradeTier" />
                  <input type="hidden" name="tier" value="pro" />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Upgrade to Pro
                  </button>
                </fetcher.Form>
              )}
            </div>
          </div>
        )}

        {/* Templates */}
        {templates.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Templates</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {templates.map((template) => (
                <div key={template.id} className="border rounded-lg p-4">
                  <h3 className="font-medium">{template.name}</h3>
                  <p className="text-sm text-gray-500">{template.category}</p>
                  {template.description && (
                    <p className="text-sm text-gray-600 mt-2">{template.description}</p>
                  )}
                  <div className="mt-2 flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                      Used {template.use_count} times
                    </span>
                    {template.is_public && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        Public
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings (if admin) */}
        {isAdmin && workspace.extended && (
          <div className="bg-white shadow rounded-lg p-6 mt-8">
            <h2 className="text-xl font-semibold mb-4">Workspace Settings</h2>
            <fetcher.Form method="post">
              <input type="hidden" name="_action" value="updateSettings" />
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Custom Domain
                  </label>
                  <input
                    type="text"
                    name="customDomain"
                    defaultValue={workspace.extended.custom_domain || ''}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                    placeholder="workspace.example.com"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Save Settings
                </button>
              </div>
            </fetcher.Form>
          </div>
        )}
      </div>
    </div>
  );
}