import { useState } from "react";
import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";

interface CodeBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

export const CodeBlock = ({ block, onChange, isSelected, isEditing }: CodeBlockProps) => {
  const [language, setLanguage] = useState(block.content.language || "javascript");

  return (
    <div className={cn(
      "w-full h-full p-2 bg-gray-900 rounded-lg",
      isSelected && "ring-2 ring-blue-500"
    )}>
      <div className="flex items-center justify-between mb-2">
        <select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            onChange({ content: { ...block.content, language: e.target.value } });
          }}
          className="bg-gray-800 text-gray-200 text-xs px-2 py-1 rounded"
        >
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="json">JSON</option>
        </select>
      </div>
      <textarea
        value={block.content.code || ""}
        onChange={(e) => onChange({ content: { ...block.content, code: e.target.value } })}
        className="w-full h-[calc(100%-2rem)] bg-transparent text-gray-200 font-mono text-sm resize-none focus:outline-none"
        placeholder="// Enter code here..."
        readOnly={!isEditing}
      />
    </div>
  );
};