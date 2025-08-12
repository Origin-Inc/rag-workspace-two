import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DocumentIcon,
  FolderIcon,
  Bars3Icon,
  StarIcon,
  ArchiveBoxIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

interface Page {
  id: string;
  title: string;
  icon?: string;
  cover_image?: string;
  is_archived: boolean;
  position: number;
  folder_path: string;
  is_pinned: boolean;
  updated_at: string;
}

interface PageOrganizerProps {
  projectId: string;
  pages: Page[];
  folders?: any[];
  onReorder: (pageIds: string[], folderPath?: string) => Promise<void>;
  onPageClick?: (pageId: string) => void;
  onBulkOperation?: (pageIds: string[], operation: string) => Promise<void>;
}

function SortablePageItem({ page, isSelected, onSelect, onPageClick }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group flex items-center px-4 py-3 bg-white border rounded-lg
        ${isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200"}
        ${isDragging ? "shadow-lg" : "hover:shadow-sm"}
        transition-all
      `}
    >
      <div {...attributes} {...listeners} className="cursor-move">
        <Bars3Icon className="h-5 w-5 text-gray-400" />
      </div>

      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onSelect(page.id, e.target.checked)}
        className="ml-3 h-4 w-4 text-blue-600 rounded border-gray-300"
        onClick={(e) => e.stopPropagation()}
      />

      <button
        onClick={() => onPageClick?.(page.id)}
        className="flex-1 flex items-center ml-3 text-left"
      >
        {page.icon ? (
          <span className="mr-3 text-xl">{page.icon}</span>
        ) : (
          <DocumentIcon className="h-5 w-5 text-gray-400 mr-3" />
        )}
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {page.title || "Untitled"}
          </p>
          <p className="text-xs text-gray-500">
            Updated {new Date(page.updated_at).toLocaleDateString()}
          </p>
        </div>
      </button>

      <div className="flex items-center space-x-2">
        {page.is_pinned && (
          <StarIconSolid className="h-4 w-4 text-yellow-500" />
        )}
        {page.is_archived && (
          <ArchiveBoxIcon className="h-4 w-4 text-gray-400" />
        )}
        <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded">
          <EllipsisVerticalIcon className="h-5 w-5 text-gray-400" />
        </button>
      </div>
    </div>
  );
}

export function PageOrganizer({
  projectId,
  pages,
  folders = [],
  onReorder,
  onPageClick,
  onBulkOperation,
}: PageOrganizerProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [currentFolder, setCurrentFolder] = useState("/");
  const [orderedPages, setOrderedPages] = useState(pages);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = orderedPages.findIndex((p) => p.id === active.id);
      const newIndex = orderedPages.findIndex((p) => p.id === over.id);

      const newOrder = arrayMove(orderedPages, oldIndex, newIndex);
      setOrderedPages(newOrder);

      // Update positions on server
      await onReorder(
        newOrder.map((p) => p.id),
        currentFolder
      );
    }
  };

  const handleSelectPage = (pageId: string, selected: boolean) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(pageId);
      } else {
        next.delete(pageId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedPages.size === orderedPages.length) {
      setSelectedPages(new Set());
    } else {
      setSelectedPages(new Set(orderedPages.map((p) => p.id)));
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedPages.size === 0) return;
    
    await onBulkOperation?.(Array.from(selectedPages), action);
    setSelectedPages(new Set());
  };

  const pagesInFolder = orderedPages.filter((p) => p.folder_path === currentFolder);
  const activePage = activeId ? orderedPages.find((p) => p.id === activeId) : null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white px-4 py-3 border border-gray-200 rounded-lg">
        <div className="flex items-center space-x-4">
          <input
            type="checkbox"
            checked={selectedPages.size === orderedPages.length && orderedPages.length > 0}
            indeterminate={selectedPages.size > 0 && selectedPages.size < orderedPages.length}
            onChange={handleSelectAll}
            className="h-4 w-4 text-blue-600 rounded border-gray-300"
          />
          
          <select
            value={currentFolder}
            onChange={(e) => setCurrentFolder(e.target.value)}
            className="text-sm border-gray-300 rounded-md"
          >
            <option value="/">Root</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.path}>
                {folder.path}
              </option>
            ))}
          </select>

          {selectedPages.size > 0 && (
            <>
              <span className="text-sm text-gray-600">
                {selectedPages.size} selected
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleBulkAction("archive")}
                  className="text-sm text-gray-700 hover:text-gray-900"
                >
                  Archive
                </button>
                <button
                  onClick={() => handleBulkAction("move")}
                  className="text-sm text-gray-700 hover:text-gray-900"
                >
                  Move
                </button>
                <button
                  onClick={() => handleBulkAction("delete")}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>

        <div className="text-sm text-gray-600">
          {pagesInFolder.length} pages
        </div>
      </div>

      {/* Page List */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={pagesInFolder.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {pagesInFolder.map((page) => (
              <SortablePageItem
                key={page.id}
                page={page}
                isSelected={selectedPages.has(page.id)}
                onSelect={handleSelectPage}
                onPageClick={onPageClick}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activePage ? (
            <div className="flex items-center px-4 py-3 bg-white border border-blue-500 rounded-lg shadow-lg">
              <Bars3Icon className="h-5 w-5 text-gray-400 mr-3" />
              <DocumentIcon className="h-5 w-5 text-gray-400 mr-3" />
              <span className="text-sm font-medium text-gray-900">
                {activePage.title || "Untitled"}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {pagesInFolder.length === 0 && (
        <div className="text-center py-12 bg-white border-2 border-dashed border-gray-300 rounded-lg">
          <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">No pages in this folder</p>
        </div>
      )}
    </div>
  );
}