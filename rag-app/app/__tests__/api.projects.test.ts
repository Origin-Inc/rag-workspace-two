import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { action, loader } from "./api.projects";
import * as authServer from "~/services/auth/auth.server";
import * as supabaseServer from "~/utils/supabase.server";

// Mock modules
vi.mock("~/services/auth/auth.server");
vi.mock("~/utils/supabase.server");

describe("Project API Routes", () => {
  let mockSupabase: any;
  let mockUser: any;

  beforeEach(() => {
    mockUser = { id: "user-123", email: "test@example.com" };
    
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      rpc: vi.fn().mockReturnThis(),
    };

    vi.mocked(authServer.getUser).mockResolvedValue(mockUser);
    vi.mocked(supabaseServer.createSupabaseAdmin).mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("loader", () => {
    it("should return 401 if user is not authenticated", async () => {
      vi.mocked(authServer.getUser).mockResolvedValue(null);

      const request = new Request("http://localhost:3000/api/projects?workspaceId=workspace-123");
      const response = await loader({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("should return 400 if workspaceId is missing", async () => {
      const request = new Request("http://localhost:3000/api/projects");
      const response = await loader({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Workspace ID is required");
    });

    it("should fetch projects for a workspace", async () => {
      const mockProjects = [
        { id: "project-1", name: "Project 1", workspace_id: "workspace-123" },
        { id: "project-2", name: "Project 2", workspace_id: "workspace-123" },
      ];

      mockSupabase.order.mockResolvedValue({
        data: mockProjects,
        error: null,
      });

      const request = new Request("http://localhost:3000/api/projects?workspaceId=workspace-123");
      const response = await loader({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.projects).toEqual(mockProjects);
      expect(data.total).toBe(2);
      expect(mockSupabase.from).toHaveBeenCalledWith("projects");
      expect(mockSupabase.eq).toHaveBeenCalledWith("workspace_id", "workspace-123");
    });

    it("should filter archived projects by default", async () => {
      mockSupabase.order.mockResolvedValue({
        data: [],
        error: null,
      });

      const request = new Request("http://localhost:3000/api/projects?workspaceId=workspace-123");
      await loader({ request, params: {}, context: {} } as any);

      expect(mockSupabase.eq).toHaveBeenCalledWith("is_archived", false);
    });

    it("should include archived projects when requested", async () => {
      mockSupabase.order.mockResolvedValue({
        data: [],
        error: null,
      });

      const request = new Request("http://localhost:3000/api/projects?workspaceId=workspace-123&includeArchived=true");
      await loader({ request, params: {}, context: {} } as any);

      expect(mockSupabase.eq).not.toHaveBeenCalledWith("is_archived", false);
    });

    it("should search projects by name and description", async () => {
      mockSupabase.order.mockResolvedValue({
        data: [],
        error: null,
      });

      const request = new Request("http://localhost:3000/api/projects?workspaceId=workspace-123&search=test");
      await loader({ request, params: {}, context: {} } as any);

      expect(mockSupabase.or).toHaveBeenCalledWith("name.ilike.%test%,description.ilike.%test%");
    });

    it("should include hierarchy when requested", async () => {
      const mockHierarchy = [
        { id: "project-1", level: 0, path: "Project 1" },
        { id: "project-2", level: 1, path: "Project 1 > Project 2" },
      ];

      mockSupabase.order.mockResolvedValue({
        data: [],
        error: null,
      });

      mockSupabase.rpc.mockResolvedValue({
        data: mockHierarchy,
        error: null,
      });

      const request = new Request("http://localhost:3000/api/projects?workspaceId=workspace-123&includeHierarchy=true");
      const response = await loader({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(mockSupabase.rpc).toHaveBeenCalledWith("get_project_hierarchy", { workspace_uuid: "workspace-123" });
      expect(data.hierarchy).toEqual(mockHierarchy);
    });
  });

  describe("action - POST", () => {
    it("should create a new project", async () => {
      const newProject = {
        workspaceId: "workspace-123",
        name: "New Project",
        description: "Test description",
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: { role_id: "role-editor" },
        error: null,
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: "project-new", ...newProject, slug: "new-project" },
        error: null,
      });

      const request = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        body: JSON.stringify(newProject),
      });

      const response = await action({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.project.name).toBe("New Project");
      expect(mockSupabase.insert).toHaveBeenCalled();
    });

    it("should validate project input", async () => {
      const invalidProject = {
        workspaceId: "not-a-uuid",
        name: "",
      };

      const request = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        body: JSON.stringify(invalidProject),
      });

      const response = await action({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid input");
      expect(data.details).toBeDefined();
    });

    it("should handle duplicate project names", async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { role_id: "role-editor" },
        error: null,
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { code: "23505", message: "Duplicate" },
      });

      const request = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "workspace-123",
          name: "Existing Project",
        }),
      });

      const response = await action({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe("A project with this name already exists");
    });

    it("should create project from template", async () => {
      const projectFromTemplate = {
        workspaceId: "workspace-123",
        name: "New from Template",
        templateId: "template-123",
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: { role_id: "role-editor" },
        error: null,
      });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: "project-from-template",
        error: null,
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: "project-from-template", name: "New from Template" },
        error: null,
      });

      const request = new Request("http://localhost:3000/api/projects", {
        method: "POST",
        body: JSON.stringify(projectFromTemplate),
      });

      const response = await action({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockSupabase.rpc).toHaveBeenCalledWith("duplicate_project_from_template", expect.any(Object));
    });
  });

  describe("action - PUT", () => {
    it("should update a project", async () => {
      const updates = {
        name: "Updated Project",
        description: "Updated description",
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: { role: "editor" },
        error: null,
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: "project-123", ...updates },
        error: null,
      });

      const request = new Request("http://localhost:3000/api/projects/project-123", {
        method: "PUT",
        body: JSON.stringify(updates),
      });

      const response = await action({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.project.name).toBe("Updated Project");
      expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining(updates));
    });

    it("should check permissions before updating", async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { role: "viewer" },
        error: null,
      });

      const request = new Request("http://localhost:3000/api/projects/project-123", {
        method: "PUT",
        body: JSON.stringify({ name: "Updated" }),
      });

      const response = await action({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Access denied");
    });
  });

  describe("action - DELETE", () => {
    it("should archive a project by default", async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { role: "admin" },
        error: null,
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: "project-123", is_archived: true },
        error: null,
      });

      const request = new Request("http://localhost:3000/api/projects/project-123", {
        method: "DELETE",
      });

      const response = await action({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe("Project archived");
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({ is_archived: true })
      );
    });

    it("should permanently delete when requested", async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { role: "owner" },
        error: null,
      });

      mockSupabase.delete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const request = new Request("http://localhost:3000/api/projects/project-123?permanent=true", {
        method: "DELETE",
      });

      const response = await action({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe("Project deleted permanently");
      expect(mockSupabase.delete).toHaveBeenCalled();
    });

    it("should require admin or owner role to delete", async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { role: "editor" },
        error: null,
      });

      const request = new Request("http://localhost:3000/api/projects/project-123", {
        method: "DELETE",
      });

      const response = await action({ request, params: {}, context: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Access denied");
    });
  });
});