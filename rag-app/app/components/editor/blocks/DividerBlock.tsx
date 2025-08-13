import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";

interface DividerBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

export const DividerBlock = ({ block, isSelected }: DividerBlockProps) => {
  return (
    <div className={cn(
      "w-full h-full flex items-center justify-center p-4",
      isSelected && "ring-2 ring-blue-500 rounded-lg"
    )}>
      <hr className="w-full border-gray-300 dark:border-gray-600" />
    </div>
  );
};