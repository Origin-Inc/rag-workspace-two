import React from 'react';
import { cn } from '~/utils/cn';

interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

/**
 * Base skeleton component with shimmer animation
 */
export const Skeleton: React.FC<SkeletonProps> = ({ 
  className = '', 
  animate = true 
}) => {
  return (
    <div
      className={cn(
        'bg-gray-200 dark:bg-gray-700 rounded',
        animate && 'animate-pulse',
        className
      )}
    />
  );
};

/**
 * Text skeleton with multiple lines
 */
export const TextSkeleton: React.FC<{
  lines?: number;
  className?: string;
}> = ({ lines = 3, className = '' }) => {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === lines - 1 ? 'w-2/3' : 'w-full'
          )}
        />
      ))}
    </div>
  );
};

/**
 * Card skeleton loader
 */
export const CardSkeleton: React.FC<{
  className?: string;
  showImage?: boolean;
}> = ({ className = '', showImage = false }) => {
  return (
    <div className={cn('bg-white dark:bg-gray-800 rounded-lg p-4 border dark:border-gray-700', className)}>
      {showImage && (
        <Skeleton className="w-full h-48 mb-4" />
      )}
      <Skeleton className="h-6 w-3/4 mb-2" />
      <TextSkeleton lines={2} />
      <div className="flex gap-2 mt-4">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
};

/**
 * Table skeleton loader
 */
export const TableSkeleton: React.FC<{
  rows?: number;
  columns?: number;
  className?: string;
}> = ({ rows = 5, columns = 4, className = '' }) => {
  return (
    <div className={cn('w-full', className)}>
      {/* Header */}
      <div className="flex gap-4 p-4 border-b dark:border-gray-700">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4 border-b dark:border-gray-700">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
};

/**
 * Chart skeleton loader
 */
export const ChartSkeleton: React.FC<{
  className?: string;
  type?: 'bar' | 'line' | 'pie';
}> = ({ className = '', type = 'bar' }) => {
  return (
    <div className={cn('bg-white dark:bg-gray-800 rounded-lg p-4 border dark:border-gray-700', className)}>
      <Skeleton className="h-6 w-48 mb-4" />
      <div className="relative h-64">
        {type === 'pie' ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="w-48 h-48 rounded-full" />
          </div>
        ) : (
          <div className="flex items-end justify-between h-full gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1"
                style={{
                  height: `${Math.random() * 60 + 40}%`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * AI Response skeleton with typing indicator
 */
export const AIResponseSkeleton: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-purple-600 dark:bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <span className="text-sm text-gray-600 dark:text-gray-400">AI is thinking...</span>
      </div>
      <TextSkeleton lines={4} />
    </div>
  );
};

/**
 * List skeleton loader
 */
export const ListSkeleton: React.FC<{
  items?: number;
  className?: string;
}> = ({ items = 3, className = '' }) => {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-4 h-4 rounded-full" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
};

/**
 * Navigation skeleton
 */
export const NavSkeleton: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <Skeleton className="w-8 h-8 rounded" />
      <Skeleton className="h-4 w-32" />
      <div className="flex-1" />
      <Skeleton className="h-8 w-24 rounded" />
      <Skeleton className="w-8 h-8 rounded-full" />
    </div>
  );
};

/**
 * Form skeleton loader
 */
export const FormSkeleton: React.FC<{
  fields?: number;
  className?: string;
}> = ({ fields = 3, className = '' }) => {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-10 w-full rounded" />
        </div>
      ))}
      <div className="flex gap-2 mt-6">
        <Skeleton className="h-10 w-32 rounded" />
        <Skeleton className="h-10 w-24 rounded" />
      </div>
    </div>
  );
};