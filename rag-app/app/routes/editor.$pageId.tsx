import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { PageEditor } from "~/components/editor/PageEditor";
import { prisma } from "~/utils/db.server";
import { requireUser } from "~/services/auth/auth.server";
import type { Block } from "~/types/blocks";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { pageId } = params;
  if (!pageId) throw new Response("Page ID required", { status: 400 });

  const user = await requireUser(request);

  // Get page details with project
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      project: {
        include: {
          workspace: true
        }
      }
    }
  });

  if (!page) {
    throw new Response("Page not found", { status: 404 });
  }

  // Check if user has access to this project's workspace
  const hasAccess = await prisma.userWorkspace.findFirst({
    where: {
      userId: user.id,
      workspaceId: page.project.workspaceId,
    }
  });

  if (!hasAccess) {
    throw new Response("Access denied", { status: 403 });
  }

  // For now, allow editing if user has access
  const canEdit = true;

  // Extract canvas settings from metadata or use defaults
  const metadata = typeof page.metadata === 'object' && page.metadata ? page.metadata : {};
  const canvasSettings = (metadata as any).canvasSettings || {
    grid: { columns: 12, rowHeight: 40, gap: 8, maxWidth: 1200 },
    snapToGrid: true,
    showGrid: true,
    autoArrange: false,
  };

  // Extract blocks from metadata if they exist, otherwise empty array
  const blocks: Block[] = (metadata as any).blocks || [];

  return json({
    page: {
      ...page,
      canvasSettings  // Add canvas settings to page object
    },
    project: page.project,
    blocks,
    canEdit,
  });
}

export async function action({ params, request }: ActionFunctionArgs) {
  const { pageId } = params;
  if (!pageId) return json({ error: "Page ID required" }, { status: 400 });

  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save-blocks") {
    const blocksJson = formData.get("blocks") as string;
    const blocks = JSON.parse(blocksJson) as Block[];

    // Check permissions - verify page exists and user has access
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        project: true
      }
    });

    if (!page) {
      return json({ error: "Page not found" }, { status: 404 });
    }

    const hasAccess = await prisma.userWorkspace.findFirst({
      where: {
        userId: user.id,
        workspaceId: page.project.workspaceId,
      }
    });

    if (!hasAccess) {
      return json({ error: "Permission denied" }, { status: 403 });
    }

    // TODO: Implement page_blocks table operations
    // For now, just save the blocks data in the page's metadata
    await prisma.page.update({
      where: { id: pageId },
      data: {
        metadata: {
          ...(typeof page.metadata === 'object' ? page.metadata : {}),
          blocks: blocks.map(block => ({
            id: block.id,
            type: block.type,
            content: block.content,
            properties: block.properties,
            position: block.position,
            created_at: block.created_at,
            updated_at: new Date().toISOString(),
          }))
        }
      }
    });

    return json({ success: true });
  }

  return json({ error: "Invalid intent" }, { status: 400 });
}

export default function EditorPage() {
  const { page, project, blocks, canEdit } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const handleSave = async (updatedBlocks: Block[]) => {
    const formData = new FormData();
    formData.set("intent", "save-blocks");
    formData.set("blocks", JSON.stringify(updatedBlocks));
    fetcher.submit(formData, { method: "POST" });
  };

  const handleAutoSave = (updatedBlocks: Block[]) => {
    // Debounced auto-save
    const formData = new FormData();
    formData.set("intent", "save-blocks");
    formData.set("blocks", JSON.stringify(updatedBlocks));
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">
              {project.name} / {page.parent_id ? "..." : "Pages"}
            </div>
            <h1 className="text-xl font-semibold text-gray-900">
              {page.title || "Untitled Page"}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {page.is_template && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                Template
              </span>
            )}
            {page.is_public && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                Public
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1">
        <PageEditor
          pageId={page.id}
          initialBlocks={blocks}
          isReadOnly={!canEdit}
          canvasSettings={page.canvasSettings}
          onSave={handleSave}
          onAutoSave={canEdit ? handleAutoSave : undefined}
          autoSaveInterval={10000}
        />
      </div>
    </div>
  );
}