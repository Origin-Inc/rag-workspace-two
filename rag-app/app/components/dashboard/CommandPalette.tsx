import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from '@remix-run/react';
import {
  MagnifyingGlassIcon,
  DocumentIcon,
  FolderIcon,
  TableCellsIcon,
  ClockIcon,
  ArrowRightIcon,
  HashtagIcon,
  UserGroupIcon,
  CogIcon,
  PlusIcon,
  HomeIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

export interface SearchResult {
  id: string;
  type: 'page' | 'project' | 'database' | 'team' | 'settings' | 'action';
  title: string;
  description?: string;
  url?: string;
  icon?: React.ComponentType<{ className?: string }>;
  metadata?: {
    projectName?: string;
    lastModified?: string;
    memberCount?: number;
    rowCount?: number;
  };
  action?: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  searchData?: {
    pages?: SearchResult[];
    projects?: SearchResult[];
    databases?: SearchResult[];
    teamMembers?: SearchResult[];
  };
  recentSearches?: string[];
  onSearch?: (query: string) => Promise<SearchResult[]>;
  className?: string;
}

// Mock data generator for demonstration
function generateMockSearchData(): {
  pages: SearchResult[];
  projects: SearchResult[];
  databases: SearchResult[];
  teamMembers: SearchResult[];
} {
  return {
    pages: [
      {
        id: 'page-1',
        type: 'page',
        title: 'Product Roadmap',
        description: 'Q1 2024 planning and milestones',
        url: '/app/page/page-1',
        icon: DocumentIcon,
        metadata: {
          projectName: 'Product Planning',
          lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        id: 'page-2',
        type: 'page',
        title: 'API Documentation',
        description: 'REST API endpoints and authentication',
        url: '/app/page/page-2',
        icon: DocumentIcon,
        metadata: {
          projectName: 'Engineering',
          lastModified: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        },
      },
      {
        id: 'page-3',
        type: 'page',
        title: 'Meeting Notes - Sprint Review',
        description: 'Sprint 23 retrospective and action items',
        url: '/app/page/page-3',
        icon: DocumentIcon,
        metadata: {
          projectName: 'Team Meetings',
          lastModified: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
    ],
    projects: [
      {
        id: 'proj-1',
        type: 'project',
        title: 'Product Planning',
        description: '12 pages • Updated 2 hours ago',
        url: '/app/project/proj-1',
        icon: FolderIcon,
      },
      {
        id: 'proj-2',
        type: 'project',
        title: 'Engineering',
        description: '24 pages • Updated yesterday',
        url: '/app/project/proj-2',
        icon: FolderIcon,
      },
      {
        id: 'proj-3',
        type: 'project',
        title: 'Marketing',
        description: '8 pages • Updated 3 days ago',
        url: '/app/project/proj-3',
        icon: FolderIcon,
      },
    ],
    databases: [
      {
        id: 'db-1',
        type: 'database',
        title: 'Task Tracker',
        description: 'Project management database',
        url: '/app/page/db-1',
        icon: TableCellsIcon,
        metadata: {
          rowCount: 45,
          projectName: 'Engineering',
        },
      },
      {
        id: 'db-2',
        type: 'database',
        title: 'Customer Feedback',
        description: 'User feedback and feature requests',
        url: '/app/page/db-2',
        icon: TableCellsIcon,
        metadata: {
          rowCount: 128,
          projectName: 'Product Planning',
        },
      },
    ],
    teamMembers: [
      {
        id: 'user-1',
        type: 'team',
        title: 'John Doe',
        description: 'john@example.com • Admin',
        url: '/app/team/user-1',
        icon: UserGroupIcon,
      },
      {
        id: 'user-2',
        type: 'team',
        title: 'Jane Smith',
        description: 'jane@example.com • Member',
        url: '/app/team/user-2',
        icon: UserGroupIcon,
      },
    ],
  };
}

const quickActions: SearchResult[] = [
  {
    id: 'action-new-page',
    type: 'action',
    title: 'Create New Page',
    description: 'Create a new document page',
    icon: PlusIcon,
    action: () => window.location.href = '/app/pages/new',
  },
  {
    id: 'action-new-project',
    type: 'action',
    title: 'Create New Project',
    description: 'Start a new project',
    icon: PlusIcon,
    action: () => window.location.href = '/app/projects/new',
  },
  {
    id: 'action-settings',
    type: 'action',
    title: 'Workspace Settings',
    description: 'Manage workspace configuration',
    icon: CogIcon,
    action: () => window.location.href = '/app/settings',
  },
  {
    id: 'action-home',
    type: 'action',
    title: 'Go to Dashboard',
    description: 'Return to main dashboard',
    icon: HomeIcon,
    action: () => window.location.href = '/app',
  },
];

export function CommandPalette({
  open,
  onOpenChange,
  workspaceId,
  searchData = generateMockSearchData(),
  recentSearches = ['API Documentation', 'Task Tracker', 'Product Roadmap'],
  onSearch,
  className = '',
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Combine all search data
  const allItems = useMemo(() => {
    const items: SearchResult[] = [
      ...(searchData.pages || []),
      ...(searchData.projects || []),
      ...(searchData.databases || []),
      ...(searchData.teamMembers || []),
      ...quickActions,
    ];
    return items;
  }, [searchData]);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!search) return allItems;
    
    const query = search.toLowerCase();
    return allItems.filter(item => 
      item.title.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.metadata?.projectName?.toLowerCase().includes(query)
    );
  }, [search, allItems]);

  // Group items by type
  const groupedItems = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {
      actions: [],
      pages: [],
      projects: [],
      databases: [],
      team: [],
    };

    filteredItems.forEach(item => {
      if (item.type === 'action') {
        groups.actions.push(item);
      } else if (item.type === 'page') {
        groups.pages.push(item);
      } else if (item.type === 'project') {
        groups.projects.push(item);
      } else if (item.type === 'database') {
        groups.databases.push(item);
      } else if (item.type === 'team') {
        groups.team.push(item);
      }
    });

    return groups;
  }, [filteredItems]);

  // Handle async search
  const handleSearch = useCallback(async (value: string) => {
    setSearch(value);
    
    if (onSearch && value.length > 2) {
      setIsLoading(true);
      try {
        const results = await onSearch(value);
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsLoading(false);
      }
    }
  }, [onSearch]);

  // Handle item selection
  const handleSelect = useCallback((item: SearchResult) => {
    if (item.action) {
      item.action();
    } else if (item.url) {
      navigate(item.url);
    }
    onOpenChange(false);
    setSearch('');
  }, [navigate, onOpenChange]);

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Global command menu"
      className={`fixed inset-0 z-50 overflow-y-auto ${className}`}
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="fixed inset-0 flex items-start justify-center pt-[10vh]">
        <Command.Root className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-4">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 mr-3" />
            <Command.Input
              value={search}
              onValueChange={handleSearch}
              placeholder="Search pages, projects, commands..."
              className="flex-1 py-4 bg-transparent outline-none placeholder:text-gray-400 dark:text-white"
            />
            {isLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            )}
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            {/* Recent Searches */}
            {!search && recentSearches.length > 0 && (
              <Command.Group heading="Recent">
                {recentSearches.map((term) => (
                  <Command.Item
                    key={term}
                    value={term}
                    onSelect={() => setSearch(term)}
                    className="flex items-center px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                  >
                    <ClockIcon className="h-4 w-4 text-gray-400 mr-3" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{term}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Quick Actions */}
            {groupedItems.actions.length > 0 && (
              <Command.Group heading="Quick Actions">
                {groupedItems.actions.map((item) => {
                  const Icon = item.icon || SparklesIcon;
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${item.title} ${item.description}`}
                      onSelect={() => handleSelect(item)}
                      className="flex items-center px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer group"
                    >
                      <Icon className="h-5 w-5 text-gray-400 mr-3 group-hover:text-blue-600" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {item.description}
                          </div>
                        )}
                      </div>
                      <ArrowRightIcon className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Pages */}
            {groupedItems.pages.length > 0 && (
              <Command.Group heading="Pages">
                {groupedItems.pages.map((item) => {
                  const Icon = item.icon || DocumentIcon;
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${item.title} ${item.description} ${item.metadata?.projectName}`}
                      onSelect={() => handleSelect(item)}
                      className="flex items-center px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer group"
                    >
                      <Icon className="h-5 w-5 text-gray-400 mr-3" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.title}
                        </div>
                        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                          {item.metadata?.projectName && (
                            <>
                              <span>{item.metadata.projectName}</span>
                              {item.metadata.lastModified && (
                                <>
                                  <span className="mx-1">•</span>
                                  <span>{formatRelativeTime(item.metadata.lastModified)}</span>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <ArrowRightIcon className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Projects */}
            {groupedItems.projects.length > 0 && (
              <Command.Group heading="Projects">
                {groupedItems.projects.map((item) => {
                  const Icon = item.icon || FolderIcon;
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${item.title} ${item.description}`}
                      onSelect={() => handleSelect(item)}
                      className="flex items-center px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer group"
                    >
                      <Icon className="h-5 w-5 text-blue-600 mr-3" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {item.description}
                          </div>
                        )}
                      </div>
                      <ArrowRightIcon className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Databases */}
            {groupedItems.databases.length > 0 && (
              <Command.Group heading="Databases">
                {groupedItems.databases.map((item) => {
                  const Icon = item.icon || TableCellsIcon;
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${item.title} ${item.description} ${item.metadata?.projectName}`}
                      onSelect={() => handleSelect(item)}
                      className="flex items-center px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer group"
                    >
                      <Icon className="h-5 w-5 text-purple-600 mr-3" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.title}
                        </div>
                        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                          {item.metadata?.projectName && (
                            <>
                              <span>{item.metadata.projectName}</span>
                              {item.metadata.rowCount && (
                                <>
                                  <span className="mx-1">•</span>
                                  <span>{item.metadata.rowCount} rows</span>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <ArrowRightIcon className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Team Members */}
            {groupedItems.team.length > 0 && (
              <Command.Group heading="Team">
                {groupedItems.team.map((item) => {
                  const Icon = item.icon || UserGroupIcon;
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${item.title} ${item.description}`}
                      onSelect={() => handleSelect(item)}
                      className="flex items-center px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer group"
                    >
                      <Icon className="h-5 w-5 text-gray-400 mr-3" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {item.description}
                          </div>
                        )}
                      </div>
                      <ArrowRightIcon className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Empty state */}
            <Command.Empty className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No results found for "{search}"
            </Command.Empty>
          </Command.List>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center space-x-4">
                <span className="flex items-center">
                  <kbd className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 rounded">↑↓</kbd>
                  <span className="ml-1">Navigate</span>
                </span>
                <span className="flex items-center">
                  <kbd className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 rounded">↵</kbd>
                  <span className="ml-1">Select</span>
                </span>
                <span className="flex items-center">
                  <kbd className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 rounded">Esc</kbd>
                  <span className="ml-1">Close</span>
                </span>
              </div>
              <div className="flex items-center">
                <SparklesIcon className="h-3 w-3 mr-1" />
                <span>AI-powered search</span>
              </div>
            </div>
          </div>
        </Command.Root>
      </div>
    </Command.Dialog>
  );
}