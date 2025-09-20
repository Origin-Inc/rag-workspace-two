import { useState, useEffect } from 'react';
import { Link, useNavigate } from '@remix-run/react';
import {
  ChevronRightIcon,
  DocumentIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  EllipsisHorizontalIcon
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';

export interface PageTreeNode {
  id: string;
  title: string;
  slug: string;
  icon?: string | null;
  parentId?: string | null;
  children?: PageTreeNode[];
  isArchived?: boolean;
}

interface PageTreeNavigationProps {
  workspaceSlug: string;
  pages: PageTreeNode[];
  currentPageId?: string;
  onCreatePage?: (parentId?: string) => void;
  onMovePage?: (pageId: string, newParentId: string | null) => void;
  onDeletePage?: (pageId: string) => void;
  onRenamePage?: (pageId: string, newTitle: string) => void;
}

export function PageTreeNavigation({
  workspaceSlug,
  pages,
  currentPageId,
  onCreatePage,
  onMovePage,
  onDeletePage,
  onRenamePage
}: PageTreeNavigationProps) {
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

  // Load expanded state from localStorage on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('expandedPages');
      if (saved) {
        setExpandedPages(new Set(JSON.parse(saved)));
      }
    }
  }, []);

  // Save expanded state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('expandedPages', JSON.stringify(Array.from(expandedPages)));
    }
  }, [expandedPages]);

  const toggleExpanded = (pageId: string) => {
    const newExpanded = new Set(expandedPages);
    if (newExpanded.has(pageId)) {
      newExpanded.delete(pageId);
    } else {
      newExpanded.add(pageId);
    }
    setExpandedPages(newExpanded);
  };

  return (
    <div className="page-tree-navigation space-y-1">
      {/* Root level create button */}
      {onCreatePage && (
        <button
          onClick={() => onCreatePage()}
          className="w-full flex items-center px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg"
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          New Page
        </button>
      )}

      {/* Render root pages */}
      {pages.map(page => (
        <PageTreeNode
          key={page.id}
          page={page}
          workspaceSlug={workspaceSlug}
          currentPageId={currentPageId}
          isExpanded={expandedPages.has(page.id)}
          onToggleExpanded={() => toggleExpanded(page.id)}
          onCreatePage={onCreatePage}
          onMovePage={onMovePage}
          onDeletePage={onDeletePage}
          onRenamePage={onRenamePage}
          level={0}
          expandedPages={expandedPages}
          toggleExpanded={toggleExpanded}
        />
      ))}
    </div>
  );
}

interface PageTreeNodeProps {
  page: PageTreeNode;
  workspaceSlug: string;
  currentPageId?: string;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onCreatePage?: (parentId?: string) => void;
  onMovePage?: (pageId: string, newParentId: string | null) => void;
  onDeletePage?: (pageId: string) => void;
  onRenamePage?: (pageId: string, newTitle: string) => void;
  level: number;
  expandedPages: Set<string>;
  toggleExpanded: (pageId: string) => void;
}

function PageTreeNode({
  page,
  workspaceSlug,
  currentPageId,
  isExpanded,
  onToggleExpanded,
  onCreatePage,
  onMovePage,
  onDeletePage,
  onRenamePage,
  level,
  expandedPages,
  toggleExpanded
}: PageTreeNodeProps) {
  const hasChildren = page.children && page.children.length > 0;
  const isCurrentPage = page.id === currentPageId;
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(page.title);

  const handleSaveRename = () => {
    if (editTitle.trim() && editTitle !== page.title && onRenamePage) {
      onRenamePage(page.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancelRename = () => {
    setEditTitle(page.title);
    setIsEditing(false);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('pageId', page.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const draggedPageId = e.dataTransfer.getData('pageId');
    if (draggedPageId && draggedPageId !== page.id && onMovePage) {
      onMovePage(draggedPageId, page.id);
    }
  };

  return (
    <div className="page-tree-node">
      <div
        className={`
          page-tree-item flex items-center group
          ${isCurrentPage ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
          rounded-lg transition-colors
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Expand/Collapse Toggle */}
        {hasChildren && (
          <button
            onClick={onToggleExpanded}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRightIcon
              className={`h-3 w-3 text-gray-500 transition-transform ${
                isExpanded ? 'rotate-90' : ''
              }`}
            />
          </button>
        )}
        
        {/* Spacer if no children */}
        {!hasChildren && <div className="w-5" />}

        {/* Page Link */}
        <Link
          to={`/editor/${page.id}`}
          className={`
            flex-1 flex items-center py-2 px-2 text-sm rounded
            ${isCurrentPage 
              ? 'text-blue-700 dark:text-blue-400 font-medium' 
              : 'text-gray-700 dark:text-gray-300'
            }
          `}
        >
          {/* Icon */}
          <span className="mr-2 flex-shrink-0">
            {page.icon || (
              hasChildren ? (
                isExpanded ? (
                  <FolderOpenIcon className="h-4 w-4" />
                ) : (
                  <FolderIcon className="h-4 w-4" />
                )
              ) : (
                <DocumentIcon className="h-4 w-4" />
              )
            )}
          </span>
          
          {/* Title */}
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') handleCancelRename();
              }}
              onBlur={handleSaveRename}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 px-2 py-1 text-sm bg-theme-bg-primary border border-theme-border-primary rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          ) : (
            <span className="truncate">{page.title}</span>
          )}
        </Link>

        {/* Page Actions Menu */}
        <Menu as="div" className="relative">
          <Menu.Button className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-all">
            <EllipsisHorizontalIcon className="h-4 w-4 text-gray-500" />
          </Menu.Button>
          
          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
              <div className="py-1">
                {onCreatePage && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => onCreatePage(page.id)}
                        className={`
                          ${active ? 'bg-gray-100 dark:bg-gray-700' : ''}
                          block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300
                        `}
                      >
                        Add subpage
                      </button>
                    )}
                  </Menu.Item>
                )}
                
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={() => navigate(`/editor/${page.id}`)}
                      className={`
                        ${active ? 'bg-gray-100 dark:bg-gray-700' : ''}
                        block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300
                      `}
                    >
                      Open in editor
                    </button>
                  )}
                </Menu.Item>
                
                {onRenamePage && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => {
                          setIsEditing(true);
                          setEditTitle(page.title);
                        }}
                        className={`
                          ${active ? 'bg-gray-100 dark:bg-gray-700' : ''}
                          block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300
                        `}
                      >
                        Rename
                      </button>
                    )}
                  </Menu.Item>
                )}
                
                {onDeletePage && (
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete "${page.title}" and all its subpages?`)) {
                            onDeletePage(page.id);
                          }
                        }}
                        className={`
                          ${active ? 'bg-red-100 dark:bg-red-900/20' : ''}
                          block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400
                        `}
                      >
                        Delete
                      </button>
                    )}
                  </Menu.Item>
                )}
              </div>
            </Menu.Items>
          </Transition>
        </Menu>
      </div>

      {/* Render children */}
      {hasChildren && isExpanded && (
        <div className="page-tree-children">
          {page.children!.map(child => (
            <PageTreeNode
              key={child.id}
              page={child}
              workspaceSlug={workspaceSlug}
              currentPageId={currentPageId}
              isExpanded={expandedPages.has(child.id)}
              onToggleExpanded={() => toggleExpanded(child.id)}
              onCreatePage={onCreatePage}
              onMovePage={onMovePage}
              onDeletePage={onDeletePage}
              onRenamePage={onRenamePage}
              level={level + 1}
              expandedPages={expandedPages}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

