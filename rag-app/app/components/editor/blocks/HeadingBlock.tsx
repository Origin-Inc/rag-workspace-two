import { memo } from "react";
import type { Block } from "~/types/blocks";
import ContentEditable from "react-contenteditable";
import { cn } from "~/utils/cn";

interface HeadingBlockProps {
  block: Block;
  isEditable: boolean;
  onContentChange: (content: any) => void;
  onEditComplete: () => void;
}

const HEADING_CLASSES = {
  1: "text-4xl font-bold",
  2: "text-3xl font-bold",
  3: "text-2xl font-semibold",
  4: "text-xl font-semibold",
  5: "text-lg font-medium",
  6: "text-base font-medium",
};

export const HeadingBlock = memo(function HeadingBlock({
  block,
  isEditable,
  onContentChange,
  onEditComplete,
}: HeadingBlockProps) {
  const level = block.properties?.level || 1;
  const text = block.content?.text || "";

  const handleChange = (evt: any) => {
    onContentChange({ text: evt.target.value });
  };

  const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;

  return (
    <ContentEditable
      html={text}
      disabled={!isEditable}
      onChange={handleChange}
      onBlur={onEditComplete}
      tagName={HeadingTag}
      className={cn(
        "outline-none",
        HEADING_CLASSES[level as keyof typeof HEADING_CLASSES],
        isEditable && "cursor-text",
        !text && "text-gray-400"
      )}
      placeholder={`Heading ${level}`}
    />
  );
});