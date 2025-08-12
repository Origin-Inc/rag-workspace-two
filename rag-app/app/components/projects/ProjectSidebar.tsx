import { useState, useEffect } from "react";
import { Link, useLocation } from "@remix-run/react";
import {
  FolderIcon,
  FolderOpenIcon,
  DocumentIcon,
  PlusIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  StarIcon,
  ArchiveBoxIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

interface Project {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  parent_project_id?: string;
  is_archived: boolean;
  starred_by?: string[];
  page_count?: number;
}

interface ProjectSidebarProps {
  workspaceId: string;
  projects: Project[];
  currentProjectId?: string;
  currentUserId?: string;
  showArchived?: boolean;
  onToggleArchived?: () => void;
}

export function ProjectSidebar({
  workspaceId,
  projects,
  currentProjectId,
  currentUserId,
  showArchived = false,
  onToggleArchived,
}: ProjectSidebarProps) {
  const location = useLocation();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);

  useEffect(() => {
    // Filter projects based on search query and archive status
    let filtered = projects.filter(p => 
      (showArchived || !p.is_archived) &&
      (searchQuery === "" || 
       p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    setFilteredProjects(filtered);

    // Auto-expand current project's parents
    if (currentProjectId) {
      const expandParents = (projectId: string) => {
        const project = projects.find(p => p.id === projectId);
        if (project?.parent_project_id) {
          setExpandedProjects(prev => new Set(prev).add(project.parent_project_id!));
          expandParents(project.parent_project_id);
        }
      };
      expandParents(currentProjectId);
    }
  }, [projects, searchQuery, showArchived, currentProjectId]);

  const toggleExpanded = (projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const renderProjectTree = (parentId: string | null = null, level = 0) => {
    const projectsAtLevel = filteredProjects.filter(p => p.parent_project_id === parentId);
    
    if (projectsAtLevel.length === 0) return null;

    return projectsAtLevel.map(project => {
      const hasChildren = filteredProjects.some(p => p.parent_project_id === project.id);
      const isExpanded = expandedProjects.has(project.id);
      const isActive = project.id === currentProjectId;
      const isStarred = project.starred_by?.includes(currentUserId || "") || false;

      return (
        <div key={project.id}>
          <div
            className={`
              group flex items-center px-2 py-1.5 text-sm font-medium rounded-md
              ${isActive 
                ? "bg-blue-50 text-blue-700" 
                : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              }
            `}
            style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
          >
            {hasChildren && (
              <button
                onClick={() => toggleExpanded(project.id)}
                className="mr-1 p-0.5 hover:bg-gray-200 rounded"
              >
                {isExpanded ? (
                  <ChevronDownIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </button>
            )}
            
            <Link
              to={`/app/projects/${project.id}`}
              className="flex items-center flex-1 min-w-0"
            >
              {project.color ? (
                <div
                  className="mr-2 h-5 w-5 rounded flex items-center justify-center"
                  style={{ backgroundColor: project.color }}
                >
                  {project.icon || <FolderIcon className="h-3 w-3 text-white" />}
                </div>
              ) : isExpanded ? (
                <FolderOpenIcon className="mr-2 h-5 w-5 text-gray-400" />
              ) : (
                <FolderIcon className="mr-2 h-5 w-5 text-gray-400" />
              )}
              
              <span className="flex-1 truncate">{project.name}</span>
              
              {project.page_count !== undefined && project.page_count > 0 && (
                <span className="ml-auto mr-2 text-xs text-gray-500">
                  {project.page_count}
                </span>
              )}
            </Link>

            {isStarred && (
              <StarIconSolid className="h-4 w-4 text-yellow-500 ml-1" />
            )}

            {project.is_archived && (
              <ArchiveBoxIcon className="h-4 w-4 text-gray-400 ml-1" />
            )}
          </div>

          {hasChildren && isExpanded && (
            <div className="mt-0.5">
              {renderProjectTree(project.id, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const starredProjects = filteredProjects.filter(p => 
    p.starred_by?.includes(currentUserId || "")
  );

  const rootProjects = filteredProjects.filter(p => !p.parent_project_id);

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Search */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* New Project Button */}
      <div className="p-4 border-b border-gray-200">
        <Link
          to={`/app/workspaces/${workspaceId}/projects/new`}
          className="flex items-center justify-center w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          New Project
        </Link>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Starred Projects */}
        {starredProjects.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center mb-2">
              <StarIconSolid className="h-4 w-4 text-yellow-500 mr-2" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Starred
              </h3>
            </div>
            <div className="space-y-0.5">
              {starredProjects.map(project => (
                <Link
                  key={project.id}
                  to={`/app/projects/${project.id}`}
                  className={`
                    flex items-center px-2 py-1.5 text-sm font-medium rounded-md
                    ${project.id === currentProjectId
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    }
                  `}
                >
                  <FolderIcon className="mr-2 h-5 w-5 text-gray-400" />
                  <span className="flex-1 truncate">{project.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* All Projects */}
        <div>
          <h3 className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Projects
          </h3>
          <div className="space-y-0.5">
            {rootProjects.length > 0 ? (
              renderProjectTree(null)
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                {searchQuery ? "No projects found" : "No projects yet"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <button
          onClick={onToggleArchived}
          className="flex items-center w-full px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-md"
        >
          <ArchiveBoxIcon className="h-4 w-4 mr-2" />
          {showArchived ? "Hide" : "Show"} Archived
        </button>
        <Link
          to={`/app/workspaces/${workspaceId}/settings`}
          className="flex items-center w-full px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-md"
        >
          <Cog6ToothIcon className="h-4 w-4 mr-2" />
          Workspace Settings
        </Link>
      </div>
    </div>
  );
}