import { Link } from "@remix-run/react";
import {
  DocumentPlusIcon,
  FolderPlusIcon,
  DocumentDuplicateIcon,
  UserPlusIcon,
  CloudArrowUpIcon,
  Squares2X2Icon,
  ClockIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "~/utils/date";
import { cn } from "~/utils/cn";

// Types for quick actions
export interface QuickAction {
  id: string;
  type: "document" | "project" | "template" | "import" | "invite" | "dashboard";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  href?: string;
  onClick?: () => void;
  color: string;
}

// Types for recent documents
export interface RecentDocument {
  id: string;
  title: string | null;
  thumbnailUrl?: string | null;
  lastAccessed: string | Date;
  projectId: string;
  projectName: string;
  type?: "page" | "database" | "canvas";
}

interface QuickActionsProps {
  workspaceSlug: string;
  recentDocuments?: RecentDocument[];
  onCreatePage?: () => void;
  onCreateProject?: () => void;
  onOpenTemplateGallery?: () => void;
  onImportContent?: () => void;
  onInviteTeam?: () => void;
  className?: string;
}

export function QuickActions({
  workspaceSlug,
  recentDocuments = [],
  onCreatePage,
  onCreateProject,
  onOpenTemplateGallery,
  onImportContent,
  onInviteTeam,
  className,
}: QuickActionsProps) {
  // Define quick actions
  const quickActions: QuickAction[] = [
    {
      id: "new-page",
      type: "document",
      icon: DocumentPlusIcon,
      title: "New Page",
      description: "Create a blank page",
      href: onCreatePage ? undefined : `/app/pages/new`,
      onClick: onCreatePage,
      color: "blue",
    },
    {
      id: "new-project",
      type: "project",
      icon: FolderPlusIcon,
      title: "New Project",
      description: "Start a new project",
      href: onCreateProject ? undefined : `/app/projects/new`,
      onClick: onCreateProject,
      color: "green",
    },
    {
      id: "from-template",
      type: "template",
      icon: DocumentDuplicateIcon,
      title: "From Template",
      description: "Use a template",
      href: onOpenTemplateGallery ? undefined : `/app/templates`,
      onClick: onOpenTemplateGallery,
      color: "purple",
    },
    {
      id: "import",
      type: "import",
      icon: CloudArrowUpIcon,
      title: "Import",
      description: "Import documents",
      href: onImportContent ? undefined : `/app/import`,
      onClick: onImportContent,
      color: "orange",
    },
    {
      id: "invite-team",
      type: "invite",
      icon: UserPlusIcon,
      title: "Invite Team",
      description: "Add team members",
      href: onInviteTeam ? undefined : `/app/team/invite`,
      onClick: onInviteTeam,
      color: "pink",
    },
    {
      id: "dashboard",
      type: "dashboard",
      icon: Squares2X2Icon,
      title: "Dashboard",
      description: "View analytics",
      href: `/workspace/${workspaceSlug}/dashboard`,
      color: "indigo",
    },
  ];

  // Color mapping for action types
  const getActionColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50",
      green: "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50",
      purple: "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50",
      orange: "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/50",
      pink: "bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/50",
      indigo: "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50",
    };
    return colorMap[color] || colorMap.blue;
  };

  // Get document type icon
  const getDocumentIcon = (type?: string) => {
    switch (type) {
      case "database":
        return Squares2X2Icon;
      case "canvas":
        return PhotoIcon;
      default:
        return DocumentPlusIcon;
    }
  };

  // Render action button
  const renderActionButton = (action: QuickAction) => {
    const Icon = action.icon;
    const colorClasses = getActionColorClasses(action.color);

    const content = (
      <>
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-lg transition-all",
            colorClasses
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="mt-2">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {action.title}
          </p>
          {action.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {action.description}
            </p>
          )}
        </div>
      </>
    );

    if (action.href) {
      return (
        <Link
          key={action.id}
          to={action.href}
          className="group flex flex-col items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        key={action.id}
        onClick={action.onClick}
        className="group flex flex-col items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {content}
      </button>
    );
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Quick Actions Grid */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Quick Actions
          </h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-2">
            {quickActions.map(renderActionButton)}
          </div>
        </div>
      </div>

      {/* Recent Documents */}
      {recentDocuments.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Recent Documents
              </h3>
              <Link
                to="/app/pages"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                View all
              </Link>
            </div>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {recentDocuments.slice(0, 6).map((doc) => {
              const DocIcon = getDocumentIcon(doc.type);
              
              return (
                <Link
                  key={doc.id}
                  to={`/app/page/${doc.id}`}
                  className="flex items-center px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {doc.thumbnailUrl ? (
                    <img
                      src={doc.thumbnailUrl}
                      alt=""
                      className="h-10 w-10 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <DocIcon className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {doc.title || "Untitled"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {doc.projectName}
                    </p>
                  </div>
                  <div className="ml-3 flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <ClockIcon className="h-3 w-3 mr-1" />
                    {formatDistanceToNow(doc.lastAccessed)}
                  </div>
                </Link>
              );
            })}
          </div>
          {recentDocuments.length === 0 && (
            <div className="px-6 py-8 text-center">
              <DocumentPlusIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                No recent documents
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Documents you access will appear here
              </p>
            </div>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Productivity Tip
            </p>
            <p className="mt-1 text-sm text-gray-900 dark:text-white">
              Press <kbd className="px-1.5 py-0.5 text-xs bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">⌘K</kbd> to quickly search across your workspace
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}