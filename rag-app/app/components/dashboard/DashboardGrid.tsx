import { ReactNode } from 'react';
import { cn } from '~/utils/cn';

interface DashboardGridProps {
  children: ReactNode;
  className?: string;
}

interface GridItemProps {
  children: ReactNode;
  className?: string;
  colSpan?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  rowSpan?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
}

export function DashboardGrid({ children, className }: DashboardGridProps) {
  return (
    <div
      className={cn(
        // Base grid setup with responsive columns
        'grid gap-4 p-4 sm:gap-6 sm:p-6 lg:gap-8 lg:p-8',
        // Responsive column configuration
        'grid-cols-1', // Mobile: 1 column
        'sm:grid-cols-2', // Small tablets: 2 columns
        'md:grid-cols-4', // Medium tablets: 4 columns  
        'lg:grid-cols-6', // Desktop: 6 columns
        'xl:grid-cols-12', // Large desktop: 12 columns
        // Auto-rows for consistent height
        'auto-rows-min',
        className
      )}
    >
      {children}
    </div>
  );
}

export function GridItem({ 
  children, 
  className,
  colSpan = {},
  rowSpan = {}
}: GridItemProps) {
  // Build responsive col-span classes
  const colSpanClasses = [
    colSpan.default && `col-span-${colSpan.default}`,
    colSpan.sm && `sm:col-span-${colSpan.sm}`,
    colSpan.md && `md:col-span-${colSpan.md}`,
    colSpan.lg && `lg:col-span-${colSpan.lg}`,
    colSpan.xl && `xl:col-span-${colSpan.xl}`,
  ].filter(Boolean).join(' ');

  // Build responsive row-span classes
  const rowSpanClasses = [
    rowSpan.default && `row-span-${rowSpan.default}`,
    rowSpan.sm && `sm:row-span-${rowSpan.sm}`,
    rowSpan.md && `md:row-span-${rowSpan.md}`,
    rowSpan.lg && `lg:row-span-${rowSpan.lg}`,
    rowSpan.xl && `xl:row-span-${rowSpan.xl}`,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cn(
        'min-h-0', // Allow items to shrink
        colSpanClasses,
        rowSpanClasses,
        className
      )}
    >
      {children}
    </div>
  );
}

// Predefined grid layouts for common dashboard patterns
export const DashboardLayouts = {
  // Two-thirds + one-third layout
  twoThirdsOneThird: {
    main: { default: 1, md: 3, lg: 4, xl: 8 },
    sidebar: { default: 1, md: 1, lg: 2, xl: 4 }
  },
  // Half and half layout
  halfHalf: {
    left: { default: 1, sm: 1, md: 2, lg: 3, xl: 6 },
    right: { default: 1, sm: 1, md: 2, lg: 3, xl: 6 }
  },
  // Full width
  fullWidth: {
    full: { default: 1, sm: 2, md: 4, lg: 6, xl: 12 }
  },
  // Three column layout
  threeColumn: {
    column: { default: 1, sm: 1, md: 2, lg: 2, xl: 4 }
  },
  // Four column layout for stats
  fourColumn: {
    column: { default: 1, sm: 1, md: 1, lg: 1, xl: 3 }
  }
};

// Container query support for truly responsive components
export function ResponsiveGridContainer({ children, className }: DashboardGridProps) {
  return (
    <div 
      className={cn(
        '@container', // Enable container queries
        className
      )}
    >
      <div
        className={cn(
          // Container query based grid
          'grid gap-4 p-4',
          '@sm:grid-cols-2 @sm:gap-6 @sm:p-6',
          '@md:grid-cols-4',
          '@lg:grid-cols-6 @lg:gap-8 @lg:p-8',
          '@xl:grid-cols-12',
        )}
      >
        {children}
      </div>
    </div>
  );
}

// Utility component for dashboard sections
export function DashboardSection({
  title,
  description,
  children,
  actions,
  className
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700', className)}>
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center space-x-2">
              {actions}
            </div>
          )}
        </div>
      </div>
      <div className="px-4 py-5 sm:px-6">
        {children}
      </div>
    </div>
  );
}

// Skeleton loader for dashboard items
export function DashboardGridSkeleton({ items = 6 }: { items?: number }) {
  return (
    <DashboardGrid>
      {Array.from({ length: items }).map((_, i) => (
        <GridItem
          key={i}
          colSpan={
            i === 0 
              ? DashboardLayouts.twoThirdsOneThird.main
              : i === 1
              ? DashboardLayouts.twoThirdsOneThird.sidebar
              : DashboardLayouts.threeColumn.column
          }
          className="animate-pulse"
        >
          <div className="bg-gray-200 dark:bg-gray-700 rounded-lg h-48"></div>
        </GridItem>
      ))}
    </DashboardGrid>
  );
}