import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";

interface VideoBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

export const VideoBlock = ({ block, onChange, isSelected, isEditing }: VideoBlockProps) => {
  return (
    <div className={cn(
      "w-full h-full p-2 bg-white dark:bg-gray-800 rounded-lg",
      isSelected && "ring-2 ring-blue-500"
    )}>
      {block.content.url ? (
        <video
          src={block.content.url}
          controls
          className="w-full h-full rounded"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
          {isEditing && (
            <input
              type="text"
              placeholder="Enter video URL..."
              className="w-full px-3 py-2 border rounded-md text-sm"
              onChange={(e) => onChange({ content: { ...block.content, url: e.target.value } })}
            />
          )}
          <p className="text-gray-400 text-sm">
            {isEditing ? "Add a video URL above" : "No video"}
          </p>
        </div>
      )}
    </div>
  );
};