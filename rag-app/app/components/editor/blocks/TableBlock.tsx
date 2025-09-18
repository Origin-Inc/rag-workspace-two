import { useState } from "react";
import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";

interface TableBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

export const TableBlock = ({ block, onChange, isSelected, isEditing }: TableBlockProps) => {
  const [rows] = useState(block.content.rows || 3);
  const [cols] = useState(block.content.cols || 3);
  const [data, setData] = useState(block.content.data || Array(rows).fill(Array(cols).fill("")));

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    const newData = data.map((row: any[], rIdx: number) =>
      rIdx === rowIndex
        ? row.map((cell: string, cIdx: number) => (cIdx === colIndex ? value : cell))
        : row
    );
    setData(newData);
    onChange({ content: { ...block.content, data: newData } });
  };

  return (
    <div className={cn(
      "w-full h-full p-2 bg-white dark:bg-[rgba(33,33,33,1)] rounded-lg overflow-auto",
      isSelected && "ring-2 ring-blue-500"
    )}>
      <table className="w-full border-collapse">
        <tbody>
          {data.map((row: any[], rowIndex: number) => (
            <tr key={rowIndex}>
              {row.map((cell: string, colIndex: number) => (
                <td
                  key={colIndex}
                  className="border border-gray-300 dark:border-gray-700 p-2"
                >
                  <input
                    type="text"
                    value={cell}
                    onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                    className="w-full bg-transparent focus:outline-none text-gray-900 dark:text-gray-100"
                    readOnly={!isEditing}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};