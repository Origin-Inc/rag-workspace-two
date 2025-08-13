import { useRef, useEffect, useState, memo } from "react";
import type { Block } from "~/types/blocks";
import ContentEditable, { ContentEditableEvent } from "react-contenteditable";
import { cn } from "~/utils/cn";

interface TextBlockProps {
  block: Block;
  isEditable: boolean;
  onContentChange: (content: any) => void;
  onEditComplete: () => void;
}

export const TextBlock = memo(function TextBlock({
  block,
  isEditable,
  onContentChange,
  onEditComplete,
}: TextBlockProps) {
  const contentRef = useRef<HTMLElement>(null);
  const [html, setHtml] = useState(block.content?.text || "");
  const [placeholder] = useState(block.content?.placeholder || "Type '/' for commands");

  useEffect(() => {
    setHtml(block.content?.text || "");
  }, [block.content?.text]);

  useEffect(() => {
    if (isEditable && contentRef.current) {
      contentRef.current.focus();
      
      // Place cursor at end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(contentRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditable]);

  const handleChange = (evt: ContentEditableEvent) => {
    const newHtml = evt.target.value;
    setHtml(newHtml);
    onContentChange({ text: newHtml });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle special keys
    if (e.key === "Enter" && !e.shiftKey) {
      // Create new block on Enter (handled by parent)
    }
    
    if (e.key === "Escape") {
      e.preventDefault();
      onEditComplete();
    }

    // Handle slash commands
    if (e.key === "/" && html === "") {
      // Trigger slash command menu (handled by parent)
    }
  };

  const handleBlur = () => {
    if (isEditable) {
      onEditComplete();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  return (
    <div className={cn(
      "text-block w-full",
      block.properties?.align && `text-${block.properties.align}`,
      !html && !isEditable && "text-gray-400"
    )}>
      <ContentEditable
        innerRef={contentRef}
        html={html || (isEditable ? "" : placeholder)}
        disabled={!isEditable}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onPaste={handlePaste}
        className={cn(
          "outline-none min-h-[1.5em]",
          "prose prose-sm max-w-none",
          isEditable && "cursor-text",
          !isEditable && "cursor-default"
        )}
        tagName="div"
      />
    </div>
  );
});