import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLoaderData } from '@remix-run/react';
import { Command } from 'cmdk';
import {
  MagnifyingGlassIcon,
  DocumentIcon,
  FolderIcon,
  HomeIcon,
  Cog6ToothIcon,
  PlusIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

interface CommandItem {
  id: string;
  name: string;
  category: 'page' | 'project' | 'action' | 'navigation';
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  // Toggle command palette with Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Navigation items
  const navigationItems: CommandItem[] = [
    {
      id: 'nav-home',
      name: 'Go to Home',
      category: 'navigation',
      icon: HomeIcon,
      action: () => {
        navigate('/app');
        setOpen(false);
      },
      keywords: ['home', 'dashboard', 'main'],
    },
    {
      id: 'nav-settings',
      name: 'Go to Settings',
      category: 'navigation',
      icon: Cog6ToothIcon,
      action: () => {
        navigate('/app/settings');
        setOpen(false);
      },
      keywords: ['settings', 'preferences', 'config'],
    },
  ];

  // Action items
  const actionItems: CommandItem[] = [
    {
      id: 'action-new-page',
      name: 'Create New Page',
      category: 'action',
      icon: PlusIcon,
      action: () => {
        navigate('/app/pages/new');
        setOpen(false);
      },
      keywords: ['new', 'create', 'add', 'page'],
    },
    {
      id: 'action-new-project',
      name: 'Create New Project',
      category: 'action',
      icon: PlusIcon,
      action: () => {
        navigate('/app/projects/new');
        setOpen(false);
      },
      keywords: ['new', 'create', 'add', 'project'],
    },
  ];

  const allItems = [...navigationItems, ...actionItems];

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center px-3 py-1.5 text-sm text-gray-500 bg-gray-50 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <MagnifyingGlassIcon className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="ml-auto hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs text-gray-500 bg-gray-100 rounded">
          ⌘K
        </kbd>
      </button>

      {/* Command Palette Dialog */}
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Global Command Menu"
        className="fixed inset-0 z-50"
      >
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/50" 
          onClick={() => setOpen(false)}
        />
        
        {/* Dialog Container */}
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl">
          <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
            {/* Search Input */}
            <div className="flex items-center border-b border-gray-200 px-4">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search for pages, projects, or actions..."
                className="flex-1 px-3 py-4 text-sm outline-none placeholder:text-gray-400"
              />
            </div>

            {/* Results */}
            <Command.List className="max-h-96 overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-gray-500">
                No results found.
              </Command.Empty>

              {/* Navigation Group */}
              <Command.Group heading="Navigation" className="mb-2">
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Navigation
                </div>
                {navigationItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.name} ${item.keywords?.join(' ')}`}
                    onSelect={item.action}
                    className="flex items-center px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-gray-100 data-[selected]:bg-gray-100"
                  >
                    <item.icon className="h-4 w-4 mr-3 text-gray-400" />
                    <span>{item.name}</span>
                    <ArrowRightIcon className="h-3 w-3 ml-auto text-gray-400" />
                  </Command.Item>
                ))}
              </Command.Group>

              {/* Actions Group */}
              <Command.Group heading="Actions" className="mb-2">
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </div>
                {actionItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.name} ${item.keywords?.join(' ')}`}
                    onSelect={item.action}
                    className="flex items-center px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-gray-100 data-[selected]:bg-gray-100"
                  >
                    <item.icon className="h-4 w-4 mr-3 text-gray-400" />
                    <span>{item.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>

              {/* Recent Pages Group (placeholder for now) */}
              <Command.Group heading="Recent Pages">
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Recent Pages
                </div>
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  No recent pages
                </div>
              </Command.Group>
            </Command.List>

            {/* Footer */}
            <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center space-x-4">
                <span className="flex items-center">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↑↓</kbd>
                  <span className="ml-1">Navigate</span>
                </span>
                <span className="flex items-center">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↵</kbd>
                  <span className="ml-1">Select</span>
                </span>
                <span className="flex items-center">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">esc</kbd>
                  <span className="ml-1">Close</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </Command.Dialog>
    </>
  );
}