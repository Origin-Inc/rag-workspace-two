import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";
import { DocumentIcon } from "@heroicons/react/24/outline";

interface FileBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

export const FileBlock = ({ block, onChange, isSelected, isEditing }: FileBlockProps) => {
  return (
    <div className={cn(
      "w-full h-full p-3 bg-white dark:bg-gray-800 rounded-lg",
      isSelected && "ring-2 ring-blue-500"
    )}>
      <div className="flex items-center gap-3">
        <DocumentIcon className="w-8 h-8 text-gray-400" />
        <div className="flex-1">
          {isEditing ? (
            <>
              <input
                type="text"
                value={block.content.filename || ""}
                onChange={(e) => onChange({ content: { ...block.content, filename: e.target.value } })}
                className="w-full font-medium bg-transparent focus:outline-none"
                placeholder="File name..."
              />
              <input
                type="text"
                value={block.content.size || ""}
                onChange={(e) => onChange({ content: { ...block.content, size: e.target.value } })}
                className="w-full text-sm text-gray-500 bg-transparent focus:outline-none"
                placeholder="File size..."
              />
            </>
          ) : (
            <>
              <p className="font-medium">{block.content.filename || "Untitled File"}</p>
              <p className="text-sm text-gray-500">{block.content.size || "Unknown size"}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};