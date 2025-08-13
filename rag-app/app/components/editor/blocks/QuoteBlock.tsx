import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";

interface QuoteBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

export const QuoteBlock = ({ block, onChange, isSelected, isEditing }: QuoteBlockProps) => {
  return (
    <div className={cn(
      "w-full h-full p-4 bg-white dark:bg-gray-800 rounded-lg",
      isSelected && "ring-2 ring-blue-500"
    )}>
      <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic">
        {isEditing ? (
          <>
            <textarea
              value={block.content.quote || ""}
              onChange={(e) => onChange({ content: { ...block.content, quote: e.target.value } })}
              className="w-full bg-transparent resize-none focus:outline-none text-gray-700 dark:text-gray-300"
              placeholder="Enter quote..."
            />
            <input
              type="text"
              value={block.content.author || ""}
              onChange={(e) => onChange({ content: { ...block.content, author: e.target.value } })}
              className="w-full mt-2 bg-transparent focus:outline-none text-sm text-gray-500"
              placeholder="— Author"
            />
          </>
        ) : (
          <>
            <p className="text-gray-700 dark:text-gray-300">
              {block.content.quote || "Enter a quote"}
            </p>
            {block.content.author && (
              <p className="mt-2 text-sm text-gray-500">— {block.content.author}</p>
            )}
          </>
        )}
      </blockquote>
    </div>
  );
};