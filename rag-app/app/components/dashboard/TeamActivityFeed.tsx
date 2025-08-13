import { useEffect, useState, useCallback } from "react";
import { Link } from "@remix-run/react";
import {
  DocumentPlusIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  UserPlusIcon,
  ChatBubbleLeftIcon,
  ArrowUpTrayIcon,
  LinkIcon,
  ClockIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "~/utils/date";
import { cn } from "~/utils/cn";
import { createClient } from "@supabase/supabase-js";

// Activity types
export type ActivityAction = 
  | "created" 
  | "updated" 
  | "deleted" 
  | "shared" 
  | "commented" 
  | "invited"
  | "joined"
  | "left"
  | "archived"
  | "restored";

export type ResourceType = 
  | "page" 
  | "project" 
  | "database" 
  | "comment" 
  | "workspace"
  | "user"
  | "file";

export interface Activity {
  id: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  action: ActivityAction;
  resourceType: ResourceType;
  resourceId?: string;
  resourceTitle?: string;
  details?: Record<string, any>;
  timestamp: string | Date;
  workspaceId: string;
}

interface TeamActivityFeedProps {
  workspaceId: string;
  initialActivities?: Activity[];
  maxItems?: number;
  enableRealtime?: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  className?: string;
  compact?: boolean;
}

export function TeamActivityFeed({
  workspaceId,
  initialActivities = [],
  maxItems = 20,
  enableRealtime = false,
  supabaseUrl,
  supabaseAnonKey,
  className,
  compact = false,
}: TeamActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Get action icon
  const getActionIcon = (action: ActivityAction) => {
    switch (action) {
      case "created":
        return DocumentPlusIcon;
      case "updated":
        return PencilIcon;
      case "deleted":
      case "archived":
        return TrashIcon;
      case "shared":
        return LinkIcon;
      case "commented":
        return ChatBubbleLeftIcon;
      case "invited":
      case "joined":
        return UserPlusIcon;
      case "restored":
        return ArrowUpTrayIcon;
      default:
        return DocumentPlusIcon;
    }
  };

  // Get action color
  const getActionColor = (action: ActivityAction) => {
    switch (action) {
      case "created":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30";
      case "updated":
        return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30";
      case "deleted":
      case "archived":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30";
      case "shared":
        return "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30";
      case "commented":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30";
      case "invited":
      case "joined":
        return "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30";
      case "restored":
        return "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30";
    }
  };

  // Get resource icon
  const getResourceIcon = (resourceType: ResourceType) => {
    switch (resourceType) {
      case "project":
        return FolderPlusIcon;
      case "database":
        return "🗄️";
      case "comment":
        return "💬";
      case "workspace":
        return "🏢";
      case "user":
        return "👤";
      case "file":
        return "📎";
      default:
        return "📄";
    }
  };

  // Format activity message
  const formatActivityMessage = (activity: Activity) => {
    const { action, resourceType, resourceTitle, userName, details } = activity;
    
    const actionText = action === "created" ? "created" :
                      action === "updated" ? "updated" :
                      action === "deleted" ? "deleted" :
                      action === "shared" ? "shared" :
                      action === "commented" ? "commented on" :
                      action === "invited" ? "invited" :
                      action === "joined" ? "joined" :
                      action === "left" ? "left" :
                      action === "archived" ? "archived" :
                      action === "restored" ? "restored" : action;

    const resourceText = resourceType === "database" ? "database" :
                        resourceType === "comment" ? "comment" :
                        resourceType === "workspace" ? "workspace" :
                        resourceType === "user" ? "user" :
                        resourceType === "file" ? "file" :
                        resourceType === "project" ? "project" :
                        resourceType === "page" ? "page" : resourceType;

    if (action === "invited" && details?.invitedUserName) {
      return `invited ${details.invitedUserName} to the workspace`;
    }

    if (action === "joined") {
      return `joined the workspace`;
    }

    if (action === "left") {
      return `left the workspace`;
    }

    if (action === "commented") {
      return `${actionText} ${resourceText} "${resourceTitle || 'Untitled'}"`;
    }

    return `${actionText} ${resourceText} "${resourceTitle || 'Untitled'}"`;
  };

  // Setup real-time subscription
  useEffect(() => {
    if (!enableRealtime || !supabaseUrl || !supabaseAnonKey) return;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Subscribe to real-time changes
    const channel = supabase
      .channel(`workspace:${workspaceId}:activity`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
          filter: `resource_id=eq.${workspaceId}`,
        },
        (payload) => {
          // Map audit log to activity format
          const newActivity: Activity = {
            id: payload.new.id,
            userId: payload.new.user_id,
            action: payload.new.action as ActivityAction,
            resourceType: payload.new.resource as ResourceType,
            resourceId: payload.new.resource_id,
            resourceTitle: payload.new.details?.title,
            details: payload.new.details,
            timestamp: payload.new.created_at,
            workspaceId: workspaceId,
            userName: payload.new.details?.user_name,
            userAvatar: payload.new.details?.user_avatar,
          };

          setActivities(prev => {
            const updated = [newActivity, ...prev];
            return updated.slice(0, maxItems);
          });
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, enableRealtime, supabaseUrl, supabaseAnonKey, maxItems]);

  // Group activities by date
  const groupActivitiesByDate = (activities: Activity[]) => {
    const groups: Record<string, Activity[]> = {};
    
    activities.forEach(activity => {
      const date = new Date(activity.timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      let groupKey: string;
      if (date.toDateString() === today.toDateString()) {
        groupKey = "Today";
      } else if (date.toDateString() === yesterday.toDateString()) {
        groupKey = "Yesterday";
      } else {
        groupKey = date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(activity);
    });
    
    return groups;
  };

  const groupedActivities = groupActivitiesByDate(activities);

  if (compact) {
    // Compact view for dashboard widget
    return (
      <div className={cn("space-y-3 w-full overflow-hidden", className)}>
        {activities.slice(0, 5).map((activity) => {
          const Icon = getActionIcon(activity.action);
          const colorClasses = getActionColor(activity.action);
          
          return (
            <div key={activity.id} className="flex items-start space-x-3">
              <div className={cn(
                "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                colorClasses
              )}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white break-words">
                  <span className="font-medium">{activity.userName || "Someone"}</span>{" "}
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatActivityMessage(activity)}
                  </span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatDistanceToNow(activity.timestamp)}
                </p>
              </div>
            </div>
          );
        })}
        
        {activities.length === 0 && (
          <div className="text-center py-4">
            <ClockIcon className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              No recent activity
            </p>
          </div>
        )}
        
        {enableRealtime && (
          <div className="flex items-center justify-center pt-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? "bg-green-500" : "bg-gray-400"
            )} />
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              {isConnected ? "Live" : "Offline"}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className={cn("bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700", className)}>
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Team Activity
          </h3>
          {enableRealtime && (
            <div className="flex items-center">
              <div className={cn(
                "w-2 h-2 rounded-full",
                isConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"
              )} />
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                {isConnected ? "Live updates" : "Connecting..."}
              </span>
            </div>
          )}
        </div>
      </div>
      
      <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[600px] overflow-y-auto">
        {Object.entries(groupedActivities).map(([date, dateActivities]) => (
          <div key={date}>
            <div className="px-6 py-2 bg-gray-50 dark:bg-gray-900/50">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {date}
              </p>
            </div>
            {dateActivities.map((activity) => {
              const Icon = getActionIcon(activity.action);
              const colorClasses = getActionColor(activity.action);
              
              return (
                <div key={activity.id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex items-start space-x-3">
                    {activity.userAvatar ? (
                      <img
                        src={activity.userAvatar}
                        alt=""
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <UserIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <div className={cn(
                          "flex-shrink-0 w-6 h-6 rounded flex items-center justify-center",
                          colorClasses
                        )}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-sm text-gray-900 dark:text-white">
                          <span className="font-medium">{activity.userName || "Someone"}</span>{" "}
                          <span className="text-gray-600 dark:text-gray-400">
                            {formatActivityMessage(activity)}
                          </span>
                        </p>
                      </div>
                      
                      {activity.details?.comment && (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded p-2">
                          "{activity.details.comment}"
                        </p>
                      )}
                      
                      <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center">
                          <ClockIcon className="h-3 w-3 mr-1" />
                          {formatDistanceToNow(activity.timestamp)}
                        </span>
                        {activity.resourceId && (
                          <Link
                            to={`/app/${activity.resourceType}/${activity.resourceId}`}
                            className="hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            View {activity.resourceType}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        
        {activities.length === 0 && (
          <div className="px-6 py-12 text-center">
            <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              No activity yet
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Team activities will appear here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}