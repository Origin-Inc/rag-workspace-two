import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";
import { 
  ExclamationTriangleIcon, 
  InformationCircleIcon,
  CheckCircleIcon,
  XCircleIcon 
} from "@heroicons/react/24/outline";

interface CalloutBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

export const CalloutBlock = ({ block, onChange, isSelected, isEditing }: CalloutBlockProps) => {
  const type = block.content.type || "info";
  
  const icons = {
    info: InformationCircleIcon,
    warning: ExclamationTriangleIcon,
    success: CheckCircleIcon,
    error: XCircleIcon,
  };
  
  const colors = {
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800",
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800",
    error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800",
  };
  
  const Icon = icons[type as keyof typeof icons];

  return (
    <div className={cn(
      "w-full h-full p-3 rounded-lg border-2 flex items-start gap-2",
      colors[type as keyof typeof colors],
      isSelected && "ring-2 ring-blue-500"
    )}>
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        {isEditing ? (
          <textarea
            value={block.content.text || ""}
            onChange={(e) => onChange({ content: { ...block.content, text: e.target.value } })}
            className="w-full bg-transparent resize-none focus:outline-none"
            placeholder="Enter callout text..."
          />
        ) : (
          <p className="text-sm">{block.content.text || "Callout text"}</p>
        )}
      </div>
    </div>
  );
};