import { useState, useCallback, memo } from 'react';
import { cn } from '~/utils/cn';
import type { ViewType } from '~/types/database-block';

interface ViewSwitcherProps {
  currentView: ViewType;
  availableViews?: ViewType[];
  onViewChange: (view: ViewType) => void;
  className?: string;
}

const viewConfig: Record<ViewType, { label: string; icon: string; description: string }> = {
  table: {
    label: 'Table',
    icon: '📊',
    description: 'Traditional spreadsheet view'
  },
  gallery: {
    label: 'Gallery',
    icon: '🖼️',
    description: 'Card-based visual view'
  },
  kanban: {
    label: 'Kanban',
    icon: '📋',
    description: 'Board view with columns'
  },
  calendar: {
    label: 'Calendar',
    icon: '📅',
    description: 'Date-based calendar view'
  },
  timeline: {
    label: 'Timeline',
    icon: '📈',
    description: 'Chronological timeline view'
  }
};

export const ViewSwitcher = memo(function ViewSwitcher({
  currentView,
  availableViews = ['table', 'gallery', 'kanban', 'calendar', 'timeline'],
  onViewChange,
  className
}: ViewSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleViewChange = useCallback((view: ViewType) => {
    onViewChange(view);
    setIsOpen(false);
  }, [onViewChange]);

  const currentConfig = viewConfig[currentView];

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md",
          "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
          "hover:bg-gray-50 dark:hover:bg-gray-700",
          "transition-colors duration-200",
          "text-sm font-medium text-gray-700 dark:text-gray-200"
        )}
        aria-label="Switch view"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <span className="text-base">{currentConfig.icon}</span>
        <span>{currentConfig.label}</span>
        <svg
          className={cn(
            "w-4 h-4 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          
          {/* Dropdown menu */}
          <div
            className={cn(
              "absolute top-full left-0 mt-1 z-20",
              "bg-white dark:bg-gray-800 rounded-lg shadow-lg",
              "border border-gray-200 dark:border-gray-700",
              "py-1 min-w-[200px]"
            )}
            role="menu"
            aria-orientation="vertical"
          >
            {availableViews.map((view) => {
              const config = viewConfig[view];
              const isActive = view === currentView;
              
              return (
                <button
                  key={view}
                  onClick={() => handleViewChange(view)}
                  className={cn(
                    "w-full flex items-start gap-3 px-3 py-2",
                    "hover:bg-gray-50 dark:hover:bg-gray-700",
                    "transition-colors duration-200",
                    "text-left",
                    isActive && "bg-blue-50 dark:bg-blue-900/20"
                  )}
                  role="menuitem"
                  aria-current={isActive ? "true" : undefined}
                >
                  <span className="text-lg mt-0.5">{config.icon}</span>
                  <div className="flex-1">
                    <div className={cn(
                      "text-sm font-medium",
                      isActive
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-900 dark:text-gray-100"
                    )}>
                      {config.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {config.description}
                    </div>
                  </div>
                  {isActive && (
                    <svg
                      className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-1"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});