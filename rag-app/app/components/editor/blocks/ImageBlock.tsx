import { useState } from "react";
import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";

interface ImageBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

export const ImageBlock = ({ block, onChange, isSelected, isEditing }: ImageBlockProps) => {
  const [error, setError] = useState(false);

  return (
    <div className={cn(
      "w-full h-full p-2 bg-white dark:bg-gray-800 rounded-lg",
      isSelected && "ring-2 ring-blue-500"
    )}>
      {block.content.url ? (
        error ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded">
            <p className="text-gray-500">Failed to load image</p>
          </div>
        ) : (
          <img
            src={block.content.url}
            alt={block.content.alt || "Image"}
            className="w-full h-full object-cover rounded"
            onError={() => setError(true)}
          />
        )
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
          {isEditing && (
            <input
              type="text"
              placeholder="Enter image URL..."
              className="w-full px-3 py-2 border rounded-md text-sm"
              onChange={(e) => onChange({ content: { ...block.content, url: e.target.value } })}
            />
          )}
          <p className="text-gray-400 text-sm">
            {isEditing ? "Add an image URL above" : "No image"}
          </p>
        </div>
      )}
    </div>
  );
};