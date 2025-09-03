import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/services/auth/auth.server";
import { createSupabaseAdmin } from "~/utils/supabase.server";
import { z } from "zod";

// Validation schemas
const createProjectSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  parentProjectId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  settings: z.record(z.any()).optional(),
  isArchived: z.boolean().optional(),
});

// GET /api/projects - List projects for a workspace
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const search = url.searchParams.get("search");
  const parentId = url.searchParams.get("parentId");
  const templateOnly = url.searchParams.get("templateOnly") === "true";

  if (!workspaceId) {
    return json({ error: "Workspace ID is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  // Build query
  let query = supabase
    .from("projects")
    .select(`
      *,
      project_pages!project_pages_project_id_fkey(count),
      project_collaborators!project_collaborators_project_id_fkey(
        user_id,
        role
      ),
      project_activity!project_activity_project_id_fkey(
        created_at
      )
    `)
    .eq("workspace_id", workspaceId);

  // Apply filters
  if (!includeArchived) {
    query = query.eq("is_archived", false);
  }

  if (templateOnly) {
    query = query.eq("is_template", true);
  }

  if (parentId) {
    query = query.eq("parent_project_id", parentId);
  } else if (!url.searchParams.get("includeNested")) {
    query = query.is("parent_project_id", null);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  // Execute query
  const { data: projects, error } = await query
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching projects:", error);
    return json({ error: "Failed to fetch projects" }, { status: 500 });
  }

  // Get project hierarchy if requested
  let hierarchy = null;
  if (url.searchParams.get("includeHierarchy") === "true") {
    const { data: hierarchyData } = await supabase
      .rpc("get_project_hierarchy", { workspace_uuid: workspaceId });
    hierarchy = hierarchyData;
  }

  return json({
    projects: projects || [],
    hierarchy,
    total: projects?.length || 0,
  });
}

// POST/PUT/DELETE /api/projects - Create, update, or delete projects
export async function action({ request }: ActionFunctionArgs) {
  const user = await getUser(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const method = request.method;
  const supabase = createSupabaseAdmin();

  switch (method) {
    case "POST": {
      // Create new project
      try {
        const body = await request.json();
        const validated = createProjectSchema.parse(body);

        // Generate slug from name
        const slug = validated.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

        // Check if user has permission to create projects in this workspace
        const { data: userWorkspace } = await supabase
          .from("user_workspaces")
          .select("role_id")
          .eq("user_id", user.id)
          .eq("workspace_id", validated.workspaceId)
          .single();

        if (!userWorkspace) {
          return json({ error: "Access denied" }, { status: 403 });
        }

        // If using a template, duplicate it
        if (validated.templateId) {
          const { data: newProjectId, error: templateError } = await supabase
            .rpc("duplicate_project_from_template", {
              template_id: validated.templateId,
              new_workspace_id: validated.workspaceId,
              new_name: validated.name,
              new_slug: slug,
            });

          if (templateError) {
            console.error("Template duplication error:", templateError);
            return json({ error: "Failed to create project from template" }, { status: 500 });
          }

          // Fetch the created project
          const { data: project } = await supabase
            .from("projects")
            .select("*")
            .eq("id", newProjectId)
            .single();

          return json({ project });
        }

        // Create regular project
        const { data: project, error: createError } = await supabase
          .from("projects")
          .insert({
            workspace_id: validated.workspaceId,
            name: validated.name,
            slug,
            description: validated.description,
            icon: validated.icon,
            color: validated.color,
            parent_project_id: validated.parentProjectId,
            created_by: user.id,
          })
          .select()
          .single();

        if (createError) {
          if (createError.code === "23505") {
            return json({ error: "A project with this name already exists" }, { status: 409 });
          }
          console.error("Project creation error:", createError);
          return json({ error: "Failed to create project" }, { status: 500 });
        }

        // Add creator as owner
        await supabase
          .from("project_collaborators")
          .insert({
            project_id: project.id,
            user_id: user.id,
            role: "owner",
          });

        // Track activity
        await supabase
          .from("project_activity")
          .insert({
            project_id: project.id,
            user_id: user.id,
            action: "created",
            entity_type: "project",
            entity_id: project.id,
            entity_name: project.name,
          });

        return json({ project });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return json({ error: "Invalid input", details: error.errors }, { status: 400 });
        }
        console.error("Unexpected error:", error);
        return json({ error: "Internal server error" }, { status: 500 });
      }
    }

    case "PUT": {
      // Update project
      try {
        const url = new URL(request.url);
        const projectId = url.pathname.split("/").pop();
        
        if (!projectId) {
          return json({ error: "Project ID is required" }, { status: 400 });
        }

        const body = await request.json();
        const validated = updateProjectSchema.parse(body);

        // Check if user has permission to update this project
        const { data: collaborator } = await supabase
          .from("project_collaborators")
          .select("role")
          .eq("project_id", projectId)
          .eq("user_id", user.id)
          .single();

        if (!collaborator || !["owner", "admin", "editor"].includes(collaborator.role)) {
          return json({ error: "Access denied" }, { status: 403 });
        }

        // Update project
        const { data: project, error: updateError } = await supabase
          .from("projects")
          .update({
            ...validated,
            updated_at: new Date().toISOString(),
          })
          .eq("id", projectId)
          .select()
          .single();

        if (updateError) {
          console.error("Project update error:", updateError);
          return json({ error: "Failed to update project" }, { status: 500 });
        }

        // Track activity
        await supabase
          .from("project_activity")
          .insert({
            project_id: projectId,
            user_id: user.id,
            action: validated.isArchived ? "archived" : "updated",
            entity_type: "project",
            entity_id: projectId,
            entity_name: project.name,
            details: validated,
          });

        return json({ project });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return json({ error: "Invalid input", details: error.errors }, { status: 400 });
        }
        console.error("Unexpected error:", error);
        return json({ error: "Internal server error" }, { status: 500 });
      }
    }

    case "DELETE": {
      // Delete or archive project
      const url = new URL(request.url);
      const projectId = url.pathname.split("/").pop();
      const permanent = url.searchParams.get("permanent") === "true";

      if (!projectId) {
        return json({ error: "Project ID is required" }, { status: 400 });
      }

      // Check if user has permission to delete this project
      const { data: collaborator } = await supabase
        .from("project_collaborators")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .single();

      if (!collaborator || !["owner", "admin"].includes(collaborator.role)) {
        return json({ error: "Access denied" }, { status: 403 });
      }

      if (permanent) {
        // Permanently delete project
        const { error: deleteError } = await supabase
          .from("projects")
          .delete()
          .eq("id", projectId);

        if (deleteError) {
          console.error("Project deletion error:", deleteError);
          return json({ error: "Failed to delete project" }, { status: 500 });
        }

        return json({ success: true, message: "Project deleted permanently" });
      } else {
        // Soft delete (archive)
        const { data: project, error: archiveError } = await supabase
          .from("projects")
          .update({
            is_archived: true,
            archived_at: new Date().toISOString(),
          })
          .eq("id", projectId)
          .select()
          .single();

        if (archiveError) {
          console.error("Project archive error:", archiveError);
          return json({ error: "Failed to archive project" }, { status: 500 });
        }

        // Track activity
        await supabase
          .from("project_activity")
          .insert({
            project_id: projectId,
            user_id: user.id,
            action: "archived",
            entity_type: "project",
            entity_id: projectId,
            entity_name: project.name,
          });

        return json({ success: true, message: "Project archived", project });
      }
    }

    default:
      return json({ error: "Method not allowed" }, { status: 405 });
  }
}