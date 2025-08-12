import { useState } from "react";
import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";

interface KanbanBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

interface KanbanColumn {
  id: string;
  title: string;
  items: string[];
}

export const KanbanBlock = ({ block, onChange, isSelected, isEditing }: KanbanBlockProps) => {
  const [columns] = useState<KanbanColumn[]>(
    block.content.columns || [
      { id: "todo", title: "To Do", items: [] },
      { id: "progress", title: "In Progress", items: [] },
      { id: "done", title: "Done", items: [] },
    ]
  );

  return (
    <div className={cn(
      "w-full h-full p-2 bg-white dark:bg-gray-800 rounded-lg",
      isSelected && "ring-2 ring-blue-500"
    )}>
      <div className="flex gap-2 h-full">
        {columns.map((column) => (
          <div key={column.id} className="flex-1 bg-gray-50 dark:bg-gray-700 rounded p-2">
            <h3 className="font-semibold mb-2 text-sm">{column.title}</h3>
            <div className="space-y-1">
              {column.items.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white dark:bg-gray-600 p-2 rounded text-sm"
                >
                  {item}
                </div>
              ))}
              {isEditing && column.items.length === 0 && (
                <div className="text-gray-400 text-xs text-center py-4">
                  Add items here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};