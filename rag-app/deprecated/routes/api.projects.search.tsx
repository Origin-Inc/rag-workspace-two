import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/services/auth/auth.server";
import { createSupabaseAdmin } from "~/utils/supabase.server";

// GET /api/projects/search
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const workspaceId = url.searchParams.get("workspaceId");
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const limit = parseInt(url.searchParams.get("limit") || "20");

  if (!query || !workspaceId) {
    return json({ error: "Query and workspace ID are required" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  // Check user has access to workspace
  const { data: userWorkspace } = await supabase
    .from("user_workspaces")
    .select("*")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!userWorkspace) {
    return json({ error: "Access denied" }, { status: 403 });
  }

  try {
    // Use the search function we created in the migration
    const { data: searchResults, error } = await supabase
      .rpc("search_projects", {
        search_query: query,
        workspace_uuid: workspaceId,
        include_archived: includeArchived,
      })
      .limit(limit);

    if (error) {
      console.error("Search error:", error);
      
      // Fallback to basic search if function doesn't exist
      const { data: fallbackResults } = await supabase
        .from("projects")
        .select(`
          *,
          project_pages!project_pages_project_id_fkey(count),
          project_activity!project_activity_project_id_fkey(
            created_at
          )
        `)
        .eq("workspace_id", workspaceId)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(limit);

      return json({
        results: fallbackResults || [],
        total: fallbackResults?.length || 0,
        query,
      });
    }

    // Enhance results with additional data
    const projectIds = searchResults?.map(r => r.id) || [];
    
    if (projectIds.length > 0) {
      // Get page counts
      const { data: pageCounts } = await supabase
        .from("project_pages")
        .select("project_id")
        .in("project_id", projectIds)
        .select("project_id, count");

      // Get recent collaborators
      const { data: collaborators } = await supabase
        .from("project_collaborators")
        .select(`
          project_id,
          user:auth.users!project_collaborators_user_id_fkey(
            id,
            email,
            raw_user_meta_data
          )
        `)
        .in("project_id", projectIds)
        .eq("is_active", true)
        .limit(3);

      // Merge additional data
      const enhancedResults = searchResults?.map(project => {
        const pageCount = pageCounts?.filter(p => p.project_id === project.id).length || 0;
        const projectCollaborators = collaborators?.filter(c => c.project_id === project.id) || [];
        
        return {
          ...project,
          page_count: project.page_count || pageCount,
          collaborators: projectCollaborators.map(c => ({
            id: c.user.id,
            email: c.user.email,
            name: c.user.raw_user_meta_data?.name || c.user.email.split("@")[0],
            avatar: c.user.raw_user_meta_data?.avatar_url,
          })),
        };
      });

      return json({
        results: enhancedResults || [],
        total: enhancedResults?.length || 0,
        query,
      });
    }

    return json({
      results: searchResults || [],
      total: searchResults?.length || 0,
      query,
    });
  } catch (error) {
    console.error("Search error:", error);
    return json({ error: "Search failed" }, { status: 500 });
  }
}

// POST /api/projects/search/advanced
export async function action({ request }: ActionFunctionArgs) {
  const user = await getUser(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const {
    workspaceId,
    query,
    filters = {},
    sort = { field: "relevance", order: "desc" },
    limit = 20,
    offset = 0,
  } = body;

  if (!workspaceId) {
    return json({ error: "Workspace ID is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  // Check user has access
  const { data: userWorkspace } = await supabase
    .from("user_workspaces")
    .select("*")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!userWorkspace) {
    return json({ error: "Access denied" }, { status: 403 });
  }

  // Build complex query
  let searchQuery = supabase
    .from("projects")
    .select(`
      *,
      project_pages!project_pages_project_id_fkey(count),
      project_collaborators!project_collaborators_project_id_fkey(
        user_id,
        role
      ),
      project_activity!project_activity_project_id_fkey(
        created_at,
        action
      )
    `, { count: "exact" })
    .eq("workspace_id", workspaceId);

  // Apply text search
  if (query) {
    searchQuery = searchQuery.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
  }

  // Apply filters
  if (filters.isArchived !== undefined) {
    searchQuery = searchQuery.eq("is_archived", filters.isArchived);
  }

  if (filters.isTemplate !== undefined) {
    searchQuery = searchQuery.eq("is_template", filters.isTemplate);
  }

  if (filters.tags && filters.tags.length > 0) {
    searchQuery = searchQuery.contains("tags", filters.tags);
  }

  if (filters.createdBy) {
    searchQuery = searchQuery.eq("created_by", filters.createdBy);
  }

  if (filters.parentProjectId !== undefined) {
    if (filters.parentProjectId === null) {
      searchQuery = searchQuery.is("parent_project_id", null);
    } else {
      searchQuery = searchQuery.eq("parent_project_id", filters.parentProjectId);
    }
  }

  if (filters.hasPages !== undefined) {
    // This would need a having clause which isn't directly supported
    // We'll filter in post-processing
  }

  // Apply date filters
  if (filters.createdAfter) {
    searchQuery = searchQuery.gte("created_at", filters.createdAfter);
  }

  if (filters.createdBefore) {
    searchQuery = searchQuery.lte("created_at", filters.createdBefore);
  }

  if (filters.updatedAfter) {
    searchQuery = searchQuery.gte("updated_at", filters.updatedAfter);
  }

  if (filters.updatedBefore) {
    searchQuery = searchQuery.lte("updated_at", filters.updatedBefore);
  }

  // Apply sorting
  const sortField = sort.field === "relevance" && !query ? "updated_at" : 
                   sort.field === "relevance" ? undefined :
                   sort.field === "name" ? "name" :
                   sort.field === "created" ? "created_at" :
                   sort.field === "updated" ? "updated_at" : "position";

  if (sortField) {
    searchQuery = searchQuery.order(sortField, { ascending: sort.order === "asc" });
  }

  // Apply pagination
  searchQuery = searchQuery.range(offset, offset + limit - 1);

  // Execute query
  const { data: projects, error, count } = await searchQuery;

  if (error) {
    console.error("Advanced search error:", error);
    return json({ error: "Search failed" }, { status: 500 });
  }

  // Post-process results
  let results = projects || [];

  // Filter by page count if needed
  if (filters.hasPages === true) {
    results = results.filter(p => p.project_pages?.[0]?.count > 0);
  } else if (filters.hasPages === false) {
    results = results.filter(p => !p.project_pages?.[0]?.count || p.project_pages[0].count === 0);
  }

  // Calculate relevance scores if searching
  if (query && sort.field === "relevance") {
    results = results.map(project => {
      let score = 0;
      const lowerQuery = query.toLowerCase();
      const lowerName = project.name.toLowerCase();
      const lowerDesc = (project.description || "").toLowerCase();

      // Exact match scores highest
      if (lowerName === lowerQuery) score += 100;
      else if (lowerName.includes(lowerQuery)) score += 50;
      
      if (lowerDesc.includes(lowerQuery)) score += 25;
      
      // Tag matches
      if (project.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
        score += 30;
      }

      return { ...project, relevance_score: score };
    });

    // Sort by relevance score
    results.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  return json({
    results,
    total: count || 0,
    query,
    filters,
    sort,
    pagination: {
      limit,
      offset,
      hasMore: (count || 0) > offset + limit,
    },
  });
}