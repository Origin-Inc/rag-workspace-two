import { useState } from "react";
import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useNavigate, useActionData } from "@remix-run/react";
import { getUser } from "~/services/auth/auth.server";
import { prisma } from "~/utils/db.server";
import { FolderIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  
  if (!user) {
    return redirect("/auth/login");
  }

  // Get user's current workspace
  const currentWorkspace = await prisma.workspace.findFirst({
    where: {
      userWorkspaces: {
        some: { userId: user.id }
      }
    }
  });

  if (!currentWorkspace) {
    return redirect("/app");
  }

  return json({ user, currentWorkspace });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getUser(request);
  
  if (!user) {
    return redirect("/auth/login");
  }

  const formData = await request.formData();
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  if (!name || name.trim().length === 0) {
    return json({ error: "Project name is required" }, { status: 400 });
  }

  // Get user's current workspace
  const currentWorkspace = await prisma.workspace.findFirst({
    where: {
      userWorkspaces: {
        some: { userId: user.id }
      }
    }
  });

  if (!currentWorkspace) {
    return json({ error: "No workspace found" }, { status: 400 });
  }

  try {
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        workspaceId: currentWorkspace.id,
      }
    });

    return redirect(`/app/project/${project.id}`);
  } catch (error) {
    console.error("Error creating project:", error);
    return json({ error: "Failed to create project" }, { status: 500 });
  }
}

export default function NewProject() {
  const { currentWorkspace } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back
        </button>
        <div className="flex items-center">
          <FolderIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Create New Project
          </h1>
        </div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Projects help organize your documents for the RAG system
        </p>
      </div>

      {/* Form */}
      <Form method="post" className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          {actionData?.error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{actionData.error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                placeholder="e.g., Documentation, Knowledge Base, Research Papers"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                placeholder="Describe what this project will contain..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
                RAG System Features for This Project:
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                <li>• Automatic document indexing with OpenAI embeddings</li>
                <li>• Semantic search across all project documents</li>
                <li>• Vector storage in Supabase with pgvector</li>
                <li>• Smart chunking for optimal retrieval</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              type="submit"
              disabled={isSubmitting}
              onClick={() => setIsSubmitting(true)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Creating..." : "Create Project"}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Form>
    </div>
  );
}