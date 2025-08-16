import { ReactNode } from 'react';
import { cn } from '~/utils/cn';

interface DashboardGridProps {
  id?: string;
  children: ReactNode;
  className?: string;
}

interface GridItemProps {
  id?: string;
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

export function DashboardGrid({ id, children, className }: DashboardGridProps) {
  return (
    <div
      id={id}
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
  id,
  children, 
  className,
  colSpan = {},
  rowSpan = {}
}: GridItemProps) {
  // Map numeric values to actual Tailwind classes
  const getColSpanClass = (span: number | undefined, prefix = '') => {
    if (!span) return '';
    const classMap: Record<number, string> = {
      1: `${prefix}col-span-1`,
      2: `${prefix}col-span-2`,
      3: `${prefix}col-span-3`,
      4: `${prefix}col-span-4`,
      5: `${prefix}col-span-5`,
      6: `${prefix}col-span-6`,
      7: `${prefix}col-span-7`,
      8: `${prefix}col-span-8`,
      9: `${prefix}col-span-9`,
      10: `${prefix}col-span-10`,
      11: `${prefix}col-span-11`,
      12: `${prefix}col-span-12`,
    };
    return classMap[span] || '';
  };

  const getRowSpanClass = (span: number | undefined, prefix = '') => {
    if (!span) return '';
    const classMap: Record<number, string> = {
      1: `${prefix}row-span-1`,
      2: `${prefix}row-span-2`,
      3: `${prefix}row-span-3`,
      4: `${prefix}row-span-4`,
      5: `${prefix}row-span-5`,
      6: `${prefix}row-span-6`,
    };
    return classMap[span] || '';
  };

  // Build responsive col-span classes
  const colSpanClasses = [
    getColSpanClass(colSpan.default),
    getColSpanClass(colSpan.sm, 'sm:'),
    getColSpanClass(colSpan.md, 'md:'),
    getColSpanClass(colSpan.lg, 'lg:'),
    getColSpanClass(colSpan.xl, 'xl:'),
  ].filter(Boolean).join(' ');

  // Build responsive row-span classes
  const rowSpanClasses = [
    getRowSpanClass(rowSpan.default),
    getRowSpanClass(rowSpan.sm, 'sm:'),
    getRowSpanClass(rowSpan.md, 'md:'),
    getRowSpanClass(rowSpan.lg, 'lg:'),
    getRowSpanClass(rowSpan.xl, 'xl:'),
  ].filter(Boolean).join(' ');

  return (
    <div
      id={id}
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
  // Three column layout (2:1 ratio)
  threeColumn: {
    left: { default: 1, sm: 2, md: 4, lg: 4, xl: 8 },
    right: { default: 1, sm: 2, md: 4, lg: 2, xl: 4 }
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
  id,
  title,
  description,
  children,
  actions,
  className
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div id={id} className={cn('bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700', className)}>
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