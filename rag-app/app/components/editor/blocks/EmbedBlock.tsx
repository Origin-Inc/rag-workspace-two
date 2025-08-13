import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";

interface EmbedBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

export const EmbedBlock = ({ block, onChange, isSelected, isEditing }: EmbedBlockProps) => {
  return (
    <div className={cn(
      "w-full h-full p-2 bg-white dark:bg-gray-800 rounded-lg",
      isSelected && "ring-2 ring-blue-500"
    )}>
      {block.content.url ? (
        <iframe
          src={block.content.url}
          className="w-full h-full rounded border-0"
          title="Embedded content"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
          {isEditing && (
            <input
              type="text"
              placeholder="Enter embed URL..."
              className="w-full px-3 py-2 border rounded-md text-sm"
              onChange={(e) => onChange({ content: { ...block.content, url: e.target.value } })}
            />
          )}
          <p className="text-gray-400 text-sm">
            {isEditing ? "Add an embed URL above" : "No embed"}
          </p>
        </div>
      )}
    </div>
  );
};