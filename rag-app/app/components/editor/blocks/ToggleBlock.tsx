import { useState } from "react";
import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";
import { ChevronRightIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

interface ToggleBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

export const ToggleBlock = ({ block, onChange, isSelected, isEditing }: ToggleBlockProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={cn(
      "w-full h-full p-3 bg-white dark:bg-gray-800 rounded-lg",
      isSelected && "ring-2 ring-blue-500"
    )}>
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDownIcon className="w-4 h-4" />
        ) : (
          <ChevronRightIcon className="w-4 h-4" />
        )}
        {isEditing ? (
          <input
            type="text"
            value={block.content.title || ""}
            onChange={(e) => onChange({ content: { ...block.content, title: e.target.value } })}
            className="flex-1 font-medium bg-transparent focus:outline-none"
            placeholder="Toggle title..."
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p className="font-medium">{block.content.title || "Toggle"}</p>
        )}
      </div>
      {isOpen && (
        <div className="mt-2 pl-6">
          {isEditing ? (
            <textarea
              value={block.content.content || ""}
              onChange={(e) => onChange({ content: { ...block.content, content: e.target.value } })}
              className="w-full bg-transparent resize-none focus:outline-none text-sm"
              placeholder="Toggle content..."
            />
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {block.content.content || "Toggle content"}
            </p>
          )}
        </div>
      )}
    </div>
  );
};