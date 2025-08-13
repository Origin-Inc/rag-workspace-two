import { memo, useState } from "react";
import type { Block } from "~/types/blocks";
import ContentEditable from "react-contenteditable";
import { cn } from "~/utils/cn";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

interface ListBlockProps {
  block: Block;
  isEditable: boolean;
  onContentChange: (content: any) => void;
  onEditComplete: () => void;
}

export const ListBlock = memo(function ListBlock({
  block,
  isEditable,
  onContentChange,
  onEditComplete,
}: ListBlockProps) {
  const [items, setItems] = useState<Array<{ id: string; text: string; checked?: boolean }>>(
    block.content?.items || []
  );

  const listType = block.type; // bullet_list, numbered_list, or checkbox

  const handleItemChange = (index: number, text: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], text };
    setItems(newItems);
    onContentChange({ items: newItems });
  };

  const handleCheckChange = (index: number) => {
    const newItems = [...items];
    newItems[index] = { 
      ...newItems[index], 
      checked: !newItems[index].checked 
    };
    setItems(newItems);
    onContentChange({ items: newItems });
  };

  const handleAddItem = () => {
    const newItems = [...items, { 
      id: `item-${Date.now()}`, 
      text: "", 
      checked: false 
    }];
    setItems(newItems);
    onContentChange({ items: newItems });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    onContentChange({ items: newItems });
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const newItems = [...items];
      newItems.splice(index + 1, 0, { 
        id: `item-${Date.now()}`, 
        text: "", 
        checked: false 
      });
      setItems(newItems);
      onContentChange({ items: newItems });
    }

    if (e.key === "Backspace" && items[index].text === "" && items.length > 1) {
      e.preventDefault();
      handleRemoveItem(index);
    }
  };

  const ListTag = listType === "numbered_list" ? "ol" : "ul";

  return (
    <div className="list-block">
      <ListTag className={cn(
        listType === "bullet_list" && "list-disc",
        listType === "numbered_list" && "list-decimal",
        listType !== "checkbox" && "pl-6"
      )}>
        {items.map((item, index) => (
          <li key={item.id} className="group flex items-start gap-2 mb-1">
            {listType === "checkbox" && (
              <input
                type="checkbox"
                checked={item.checked || false}
                onChange={() => handleCheckChange(index)}
                disabled={!isEditable}
                className="mt-1 cursor-pointer"
              />
            )}
            
            <ContentEditable
              html={item.text}
              disabled={!isEditable}
              onChange={(e) => handleItemChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onBlur={onEditComplete}
              className={cn(
                "flex-1 outline-none min-h-[1.5em]",
                isEditable && "cursor-text",
                item.checked && "line-through text-gray-500"
              )}
              tagName="span"
            />

            {isEditable && (
              <button
                onClick={() => handleRemoveItem(index)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded"
              >
                <TrashIcon className="h-3 w-3 text-gray-500" />
              </button>
            )}
          </li>
        ))}
      </ListTag>

      {isEditable && (
        <button
          onClick={handleAddItem}
          className="mt-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <PlusIcon className="h-4 w-4" />
          Add item
        </button>
      )}
    </div>
  );
});