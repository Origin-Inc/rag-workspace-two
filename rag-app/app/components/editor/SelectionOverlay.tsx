import { memo } from "react";
import { cn } from "~/utils/cn";

interface SelectionOverlayProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  show: boolean;
}

export const SelectionOverlay = memo(({ startX, startY, endX, endY, show }: SelectionOverlayProps) => {
  if (!show) return null;

  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  return (
    <div
      className={cn(
        "absolute border-2 border-blue-500 bg-blue-500/10",
        "pointer-events-none z-50 rounded-md"
      )}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    />
  );
});

SelectionOverlay.displayName = "SelectionOverlay";