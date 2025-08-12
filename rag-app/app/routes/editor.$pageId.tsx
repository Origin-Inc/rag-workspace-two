import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { PageEditor } from "~/components/editor/PageEditor";
import { supabase } from "~/utils/supabase.server";
import { requireAuth } from "~/services/auth/auth.server";
import type { Block } from "~/types/blocks";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { pageId } = params;
  if (!pageId) throw new Response("Page ID required", { status: 400 });

  const { user } = await requireAuth(request);

  // Get page details
  const { data: page, error: pageError } = await supabase
    .from("pages")
    .select(`
      *,
      project:projects(*),
      blocks:page_blocks(*)
    `)
    .eq("id", pageId)
    .single();

  if (pageError || !page) {
    throw new Response("Page not found", { status: 404 });
  }

  // Check permissions
  const { data: member } = await supabase
    .from("project_collaborators")
    .select("role")
    .eq("project_id", page.project_id)
    .eq("user_id", user.id)
    .single();

  const canEdit = member && ["owner", "admin", "editor"].includes(member.role);

  // Transform blocks
  const blocks: Block[] = page.blocks
    .sort((a: any, b: any) => a.position.y - b.position.y)
    .map((block: any) => ({
      id: block.id,
      type: block.type,
      content: block.content,
      properties: block.properties,
      position: block.position,
      created_at: block.created_at,
      updated_at: block.updated_at,
    }));

  return json({
    page,
    project: page.project,
    blocks,
    canEdit,
  });
}

export async function action({ params, request }: ActionFunctionArgs) {
  const { pageId } = params;
  if (!pageId) return json({ error: "Page ID required" }, { status: 400 });

  const { user } = await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save-blocks") {
    const blocksJson = formData.get("blocks") as string;
    const blocks = JSON.parse(blocksJson) as Block[];

    // Check permissions
    const { data: page } = await supabase
      .from("pages")
      .select("project_id")
      .eq("id", pageId)
      .single();

    if (!page) {
      return json({ error: "Page not found" }, { status: 404 });
    }

    const { data: member } = await supabase
      .from("project_collaborators")
      .select("role")
      .eq("project_id", page.project_id)
      .eq("user_id", user.id)
      .single();

    if (!member || !["owner", "admin", "editor"].includes(member.role)) {
      return json({ error: "Permission denied" }, { status: 403 });
    }

    // Delete existing blocks
    await supabase
      .from("page_blocks")
      .delete()
      .eq("page_id", pageId);

    // Insert new blocks
    if (blocks.length > 0) {
      const { error } = await supabase
        .from("page_blocks")
        .insert(
          blocks.map(block => ({
            id: block.id,
            page_id: pageId,
            type: block.type,
            content: block.content,
            properties: block.properties,
            position: block.position,
            created_at: block.created_at,
            updated_at: new Date().toISOString(),
          }))
        );

      if (error) {
        return json({ error: "Failed to save blocks" }, { status: 500 });
      }
    }

    // Update page modified timestamp
    await supabase
      .from("pages")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", pageId);

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
          onSave={handleSave}
          onAutoSave={canEdit ? handleAutoSave : undefined}
          autoSaveInterval={10000}
        />
      </div>
    </div>
  );
}