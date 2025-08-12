import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/services/auth/auth.server";
import { createSupabaseAdmin } from "~/utils/supabase.server";
import { z } from "zod";

const pageOrderSchema = z.object({
  pageIds: z.array(z.string().uuid()),
  folderPath: z.string().optional(),
});

const bulkOperationSchema = z.object({
  pageIds: z.array(z.string().uuid()),
  operation: z.enum(["move", "archive", "delete", "restore"]),
  targetProjectId: z.string().uuid().optional(),
  targetFolderPath: z.string().optional(),
});

// GET /api/projects/:projectId/pages
export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getUser(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = params;
  if (!projectId) {
    return json({ error: "Project ID is required" }, { status: 400 });
  }

  const url = new URL(request.url);
  const folderPath = url.searchParams.get("folderPath") || "/";
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const search = url.searchParams.get("search");
  const sortBy = url.searchParams.get("sortBy") || "position";
  const sortOrder = url.searchParams.get("sortOrder") || "asc";
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const supabase = createSupabaseAdmin();

  // Check user access
  const { data: project } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .single();

  if (!project) {
    return json({ error: "Project not found" }, { status: 404 });
  }

  const { data: userWorkspace } = await supabase
    .from("user_workspaces")
    .select("*")
    .eq("user_id", user.id)
    .eq("workspace_id", project.workspace_id)
    .single();

  if (!userWorkspace) {
    return json({ error: "Access denied" }, { status: 403 });
  }

  // Build pages query
  let query = supabase
    .from("project_pages")
    .select(`
      *,
      page:pages!project_pages_page_id_fkey(
        id,
        title,
        slug,
        icon,
        cover_image,
        content,
        metadata,
        is_archived,
        created_at,
        updated_at
      )
    `)
    .eq("project_id", projectId);

  // Apply filters
  if (folderPath !== "*") {
    query = query.eq("folder_path", folderPath);
  }

  if (!includeArchived) {
    query = query.eq("page.is_archived", false);
  }

  if (search) {
    query = query.ilike("page.title", `%${search}%`);
  }

  // Apply sorting
  const sortColumn = sortBy === "title" ? "page.title" : 
                    sortBy === "updated" ? "page.updated_at" :
                    sortBy === "created" ? "page.created_at" : "position";
  
  query = query.order(sortColumn, { ascending: sortOrder === "asc" });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  // Execute query
  const { data: projectPages, error, count } = await query;

  if (error) {
    console.error("Error fetching project pages:", error);
    return json({ error: "Failed to fetch pages" }, { status: 500 });
  }

  // Get folder structure if requested
  let folders = null;
  if (url.searchParams.get("includeFolders") === "true") {
    const { data: folderData } = await supabase
      .from("project_folders")
      .select("*")
      .eq("project_id", projectId)
      .order("path", { ascending: true });
    folders = folderData;
  }

  return json({
    pages: projectPages?.map(pp => ({
      ...pp.page,
      projectPageId: pp.id,
      position: pp.position,
      folderPath: pp.folder_path,
      isPinned: pp.is_pinned,
    })) || [],
    folders,
    total: count || 0,
    limit,
    offset,
  });
}

// POST/PUT/DELETE /api/projects/:projectId/pages
export async function action({ request, params }: ActionFunctionArgs) {
  const user = await getUser(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = params;
  if (!projectId) {
    return json({ error: "Project ID is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const method = request.method;

  // Check if user has permission to manage pages
  const { data: collaborator } = await supabase
    .from("project_collaborators")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  const hasEditPermission = collaborator && ["owner", "admin", "editor"].includes(collaborator.role);

  switch (method) {
    case "POST": {
      // Add pages to project or reorder pages
      if (!hasEditPermission) {
        return json({ error: "Access denied" }, { status: 403 });
      }

      const body = await request.json();

      // Check if this is a reorder operation
      if (body.pageIds && Array.isArray(body.pageIds)) {
        // Reorder pages
        try {
          const validated = pageOrderSchema.parse(body);
          
          // Update positions for all pages
          const updates = validated.pageIds.map((pageId, index) => 
            supabase
              .from("project_pages")
              .update({ 
                position: index,
                folder_path: validated.folderPath || "/",
              })
              .eq("project_id", projectId)
              .eq("page_id", pageId)
          );

          await Promise.all(updates);

          // Track activity
          await supabase
            .from("project_activity")
            .insert({
              project_id: projectId,
              user_id: user.id,
              action: "pages_reordered",
              entity_type: "pages",
              details: { count: validated.pageIds.length },
            });

          return json({ success: true, message: "Pages reordered" });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return json({ error: "Invalid input", details: error.errors }, { status: 400 });
          }
          return json({ error: "Failed to reorder pages" }, { status: 500 });
        }
      }

      // Add single page to project
      const { pageId, folderPath = "/", position } = body;

      if (!pageId) {
        return json({ error: "Page ID is required" }, { status: 400 });
      }

      // Check if page already in project
      const { data: existing } = await supabase
        .from("project_pages")
        .select("id")
        .eq("project_id", projectId)
        .eq("page_id", pageId)
        .single();

      if (existing) {
        return json({ error: "Page already in project" }, { status: 409 });
      }

      // Get next position if not specified
      let finalPosition = position;
      if (finalPosition === undefined) {
        const { data: lastPage } = await supabase
          .from("project_pages")
          .select("position")
          .eq("project_id", projectId)
          .eq("folder_path", folderPath)
          .order("position", { ascending: false })
          .limit(1)
          .single();

        finalPosition = (lastPage?.position || 0) + 1;
      }

      // Add page to project
      const { data: projectPage, error: insertError } = await supabase
        .from("project_pages")
        .insert({
          project_id: projectId,
          page_id: pageId,
          folder_path: folderPath,
          position: finalPosition,
          added_by: user.id,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error adding page to project:", insertError);
        return json({ error: "Failed to add page to project" }, { status: 500 });
      }

      // Update page's project_id for backward compatibility
      await supabase
        .from("pages")
        .update({ project_id: projectId })
        .eq("id", pageId);

      // Track activity
      await supabase
        .from("project_activity")
        .insert({
          project_id: projectId,
          user_id: user.id,
          action: "page_added",
          entity_type: "page",
          entity_id: pageId,
        });

      return json({ projectPage });
    }

    case "PUT": {
      // Bulk operations on pages
      if (!hasEditPermission) {
        return json({ error: "Access denied" }, { status: 403 });
      }

      try {
        const body = await request.json();
        const validated = bulkOperationSchema.parse(body);

        switch (validated.operation) {
          case "move": {
            if (!validated.targetProjectId) {
              return json({ error: "Target project ID is required for move operation" }, { status: 400 });
            }

            // Move pages to another project
            const { error: deleteError } = await supabase
              .from("project_pages")
              .delete()
              .eq("project_id", projectId)
              .in("page_id", validated.pageIds);

            if (deleteError) {
              console.error("Error removing pages from source project:", deleteError);
              return json({ error: "Failed to move pages" }, { status: 500 });
            }

            // Add to target project
            const insertData = validated.pageIds.map((pageId, index) => ({
              project_id: validated.targetProjectId,
              page_id: pageId,
              folder_path: validated.targetFolderPath || "/",
              position: index,
              added_by: user.id,
            }));

            const { error: insertError } = await supabase
              .from("project_pages")
              .insert(insertData);

            if (insertError) {
              console.error("Error adding pages to target project:", insertError);
              return json({ error: "Failed to move pages" }, { status: 500 });
            }

            // Update pages' project_id
            await supabase
              .from("pages")
              .update({ project_id: validated.targetProjectId })
              .in("id", validated.pageIds);

            // Track activity
            await supabase
              .from("project_activity")
              .insert({
                project_id: projectId,
                user_id: user.id,
                action: "pages_moved",
                entity_type: "pages",
                details: { 
                  count: validated.pageIds.length,
                  targetProjectId: validated.targetProjectId,
                },
              });

            return json({ success: true, message: `Moved ${validated.pageIds.length} pages` });
          }

          case "archive": {
            // Archive pages
            const { error: archiveError } = await supabase
              .from("pages")
              .update({ 
                is_archived: true,
                updated_at: new Date().toISOString(),
              })
              .in("id", validated.pageIds);

            if (archiveError) {
              console.error("Error archiving pages:", archiveError);
              return json({ error: "Failed to archive pages" }, { status: 500 });
            }

            // Track activity
            await supabase
              .from("project_activity")
              .insert({
                project_id: projectId,
                user_id: user.id,
                action: "pages_archived",
                entity_type: "pages",
                details: { count: validated.pageIds.length },
              });

            return json({ success: true, message: `Archived ${validated.pageIds.length} pages` });
          }

          case "restore": {
            // Restore archived pages
            const { error: restoreError } = await supabase
              .from("pages")
              .update({ 
                is_archived: false,
                updated_at: new Date().toISOString(),
              })
              .in("id", validated.pageIds);

            if (restoreError) {
              console.error("Error restoring pages:", restoreError);
              return json({ error: "Failed to restore pages" }, { status: 500 });
            }

            // Track activity
            await supabase
              .from("project_activity")
              .insert({
                project_id: projectId,
                user_id: user.id,
                action: "pages_restored",
                entity_type: "pages",
                details: { count: validated.pageIds.length },
              });

            return json({ success: true, message: `Restored ${validated.pageIds.length} pages` });
          }

          case "delete": {
            // Check if user has delete permission
            if (!collaborator || !["owner", "admin"].includes(collaborator.role)) {
              return json({ error: "Only owners and admins can delete pages" }, { status: 403 });
            }

            // Remove from project_pages
            const { error: unlinkError } = await supabase
              .from("project_pages")
              .delete()
              .eq("project_id", projectId)
              .in("page_id", validated.pageIds);

            if (unlinkError) {
              console.error("Error unlinking pages:", unlinkError);
              return json({ error: "Failed to delete pages" }, { status: 500 });
            }

            // Delete pages permanently
            const { error: deleteError } = await supabase
              .from("pages")
              .delete()
              .in("id", validated.pageIds);

            if (deleteError) {
              console.error("Error deleting pages:", deleteError);
              return json({ error: "Failed to delete pages" }, { status: 500 });
            }

            // Track activity
            await supabase
              .from("project_activity")
              .insert({
                project_id: projectId,
                user_id: user.id,
                action: "pages_deleted",
                entity_type: "pages",
                details: { count: validated.pageIds.length },
              });

            return json({ success: true, message: `Deleted ${validated.pageIds.length} pages` });
          }

          default:
            return json({ error: "Invalid operation" }, { status: 400 });
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          return json({ error: "Invalid input", details: error.errors }, { status: 400 });
        }
        console.error("Unexpected error:", error);
        return json({ error: "Internal server error" }, { status: 500 });
      }
    }

    case "DELETE": {
      // Remove page from project
      if (!hasEditPermission) {
        return json({ error: "Access denied" }, { status: 403 });
      }

      const url = new URL(request.url);
      const pageId = url.searchParams.get("pageId");

      if (!pageId) {
        return json({ error: "Page ID is required" }, { status: 400 });
      }

      const { error: deleteError } = await supabase
        .from("project_pages")
        .delete()
        .eq("project_id", projectId)
        .eq("page_id", pageId);

      if (deleteError) {
        console.error("Error removing page from project:", deleteError);
        return json({ error: "Failed to remove page" }, { status: 500 });
      }

      // Track activity
      await supabase
        .from("project_activity")
        .insert({
          project_id: projectId,
          user_id: user.id,
          action: "page_removed",
          entity_type: "page",
          entity_id: pageId,
        });

      return json({ success: true, message: "Page removed from project" });
    }

    default:
      return json({ error: "Method not allowed" }, { status: 405 });
  }
}