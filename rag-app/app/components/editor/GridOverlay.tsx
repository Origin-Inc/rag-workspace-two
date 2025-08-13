import { memo } from "react";
import { cn } from "~/utils/cn";

interface GridOverlayProps {
  gridSize: number;
  show: boolean;
  width: number;
  height: number;
}

export const GridOverlay = memo(({ gridSize, show, width, height }: GridOverlayProps) => {
  if (!show) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      style={{ zIndex: 0 }}
    >
      <defs>
        <pattern
          id="grid"
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx={gridSize / 2}
            cy={gridSize / 2}
            r="1"
            fill="currentColor"
            className="text-gray-200 dark:text-gray-700"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  );
});

GridOverlay.displayName = "GridOverlay";