import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/services/auth/auth.server";
import { createSupabaseAdmin } from "~/utils/supabase.server";
import { z } from "zod";

const collaboratorSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["owner", "admin", "editor", "viewer", "commenter"]),
  permissions: z.record(z.boolean()).optional(),
});

// GET /api/projects/:projectId/collaborators
export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getUser(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = params;
  if (!projectId) {
    return json({ error: "Project ID is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  // Check if user has access to view collaborators
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

  // Fetch collaborators with user details
  const { data: collaborators, error } = await supabase
    .from("project_collaborators")
    .select(`
      *,
      user:auth.users!project_collaborators_user_id_fkey(
        id,
        email,
        raw_user_meta_data
      )
    `)
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("role", { ascending: true })
    .order("invited_at", { ascending: false });

  if (error) {
    console.error("Error fetching collaborators:", error);
    return json({ error: "Failed to fetch collaborators" }, { status: 500 });
  }

  // Transform user data to include name from metadata
  const transformedCollaborators = collaborators?.map(collab => ({
    ...collab,
    user: {
      id: collab.user.id,
      email: collab.user.email,
      name: collab.user.raw_user_meta_data?.name || collab.user.email.split("@")[0],
      avatar: collab.user.raw_user_meta_data?.avatar_url,
    }
  }));

  return json({ collaborators: transformedCollaborators || [] });
}

// POST /api/projects/:projectId/collaborators
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

  // Check if user has permission to manage collaborators
  const { data: userCollaborator } = await supabase
    .from("project_collaborators")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!userCollaborator || !["owner", "admin"].includes(userCollaborator.role)) {
    return json({ error: "Only project owners and admins can manage collaborators" }, { status: 403 });
  }

  switch (method) {
    case "POST": {
      // Add collaborator
      try {
        const body = await request.json();
        const validated = collaboratorSchema.parse(body);

        // Check if user exists
        const { data: targetUser } = await supabase
          .from("auth.users")
          .select("id, email")
          .eq("id", validated.userId)
          .single();

        if (!targetUser) {
          return json({ error: "User not found" }, { status: 404 });
        }

        // Check if already a collaborator
        const { data: existing } = await supabase
          .from("project_collaborators")
          .select("id")
          .eq("project_id", projectId)
          .eq("user_id", validated.userId)
          .single();

        if (existing) {
          // Update existing collaborator
          const { data: collaborator, error: updateError } = await supabase
            .from("project_collaborators")
            .update({
              role: validated.role,
              permissions: validated.permissions,
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .select()
            .single();

          if (updateError) {
            console.error("Error updating collaborator:", updateError);
            return json({ error: "Failed to update collaborator" }, { status: 500 });
          }

          return json({ collaborator, updated: true });
        }

        // Add new collaborator
        const { data: collaborator, error: insertError } = await supabase
          .from("project_collaborators")
          .insert({
            project_id: projectId,
            user_id: validated.userId,
            role: validated.role,
            permissions: validated.permissions,
            invited_by: user.id,
          })
          .select()
          .single();

        if (insertError) {
          console.error("Error adding collaborator:", insertError);
          return json({ error: "Failed to add collaborator" }, { status: 500 });
        }

        // Track activity
        await supabase
          .from("project_activity")
          .insert({
            project_id: projectId,
            user_id: user.id,
            action: "collaborator_added",
            entity_type: "collaborator",
            entity_id: validated.userId,
            entity_name: targetUser.email,
            details: { role: validated.role },
          });

        return json({ collaborator });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return json({ error: "Invalid input", details: error.errors }, { status: 400 });
        }
        console.error("Unexpected error:", error);
        return json({ error: "Internal server error" }, { status: 500 });
      }
    }

    case "PUT": {
      // Update collaborator role/permissions
      const url = new URL(request.url);
      const collaboratorId = url.pathname.split("/").pop();

      if (!collaboratorId) {
        return json({ error: "Collaborator ID is required" }, { status: 400 });
      }

      try {
        const body = await request.json();
        const validated = collaboratorSchema.partial().parse(body);

        // Can't change owner role
        const { data: targetCollaborator } = await supabase
          .from("project_collaborators")
          .select("role, user_id")
          .eq("id", collaboratorId)
          .single();

        if (targetCollaborator?.role === "owner" && validated.role !== "owner") {
          return json({ error: "Cannot change owner role" }, { status: 403 });
        }

        const { data: collaborator, error: updateError } = await supabase
          .from("project_collaborators")
          .update({
            ...validated,
            updated_at: new Date().toISOString(),
          })
          .eq("id", collaboratorId)
          .select()
          .single();

        if (updateError) {
          console.error("Error updating collaborator:", updateError);
          return json({ error: "Failed to update collaborator" }, { status: 500 });
        }

        // Track activity
        await supabase
          .from("project_activity")
          .insert({
            project_id: projectId,
            user_id: user.id,
            action: "collaborator_updated",
            entity_type: "collaborator",
            entity_id: targetCollaborator.user_id,
            details: validated,
          });

        return json({ collaborator });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return json({ error: "Invalid input", details: error.errors }, { status: 400 });
        }
        console.error("Unexpected error:", error);
        return json({ error: "Internal server error" }, { status: 500 });
      }
    }

    case "DELETE": {
      // Remove collaborator
      const url = new URL(request.url);
      const collaboratorId = url.pathname.split("/").pop();

      if (!collaboratorId) {
        return json({ error: "Collaborator ID is required" }, { status: 400 });
      }

      // Can't remove owner
      const { data: targetCollaborator } = await supabase
        .from("project_collaborators")
        .select("role, user_id")
        .eq("id", collaboratorId)
        .single();

      if (targetCollaborator?.role === "owner") {
        return json({ error: "Cannot remove project owner" }, { status: 403 });
      }

      const { error: deleteError } = await supabase
        .from("project_collaborators")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", collaboratorId);

      if (deleteError) {
        console.error("Error removing collaborator:", deleteError);
        return json({ error: "Failed to remove collaborator" }, { status: 500 });
      }

      // Track activity
      await supabase
        .from("project_activity")
        .insert({
          project_id: projectId,
          user_id: user.id,
          action: "collaborator_removed",
          entity_type: "collaborator",
          entity_id: targetCollaborator.user_id,
        });

      return json({ success: true, message: "Collaborator removed" });
    }

    default:
      return json({ error: "Method not allowed" }, { status: 405 });
  }
}