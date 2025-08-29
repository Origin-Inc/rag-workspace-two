import React, { useEffect, useState } from 'react';
import { Check, X, Loader2, AlertCircle, Info } from 'lucide-react';
import { cn } from '~/utils/cn';

interface LoadingStateProps {
  isLoading: boolean;
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Instant loading indicator that appears within 50ms
 */
export const InstantLoader: React.FC<LoadingStateProps> = ({
  isLoading,
  message = 'Loading...',
  size = 'md',
  className = '',
}) => {
  const [show, setShow] = useState(false);
  
  useEffect(() => {
    if (isLoading) {
      // Show immediately (within 50ms)
      const timer = setTimeout(() => setShow(true), 0);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [isLoading]);
  
  if (!show) return null;
  
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };
  
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Loader2 className={cn('animate-spin text-blue-600 dark:text-blue-400', sizeClasses[size])} />
      {message && (
        <span className={cn(
          'text-gray-600 dark:text-gray-400',
          size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base'
        )}>
          {message}
        </span>
      )}
    </div>
  );
};

/**
 * Typing indicator for AI responses
 */
export const TypingIndicator: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex gap-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-full">
        <span className="w-2 h-2 bg-gray-500 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-500 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-500 dark:bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
};

/**
 * Success/Error feedback that appears instantly
 */
export const InstantFeedback: React.FC<{
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  show: boolean;
  duration?: number;
  onClose?: () => void;
  className?: string;
}> = ({ type, message, show, duration = 3000, onClose, className = '' }) => {
  useEffect(() => {
    if (show && duration && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);
  
  if (!show) return null;
  
  const icons = {
    success: <Check className="w-4 h-4" />,
    error: <X className="w-4 h-4" />,
    warning: <AlertCircle className="w-4 h-4" />,
    info: <Info className="w-4 h-4" />,
  };
  
  const styles = {
    success: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
    error: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
    info: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  };
  
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-lg border animate-in fade-in slide-in-from-top-1 duration-200',
      styles[type],
      className
    )}>
      {icons[type]}
      <span className="text-sm font-medium">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-auto p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

/**
 * Progress indicator for long operations
 */
export const ProgressIndicator: React.FC<{
  progress: number;
  message?: string;
  showPercentage?: boolean;
  className?: string;
}> = ({ progress, message, showPercentage = true, className = '' }) => {
  return (
    <div className={cn('space-y-2', className)}>
      {(message || showPercentage) && (
        <div className="flex items-center justify-between text-sm">
          {message && <span className="text-gray-600 dark:text-gray-400">{message}</span>}
          {showPercentage && <span className="font-medium">{Math.round(progress)}%</span>}
        </div>
      )}
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 dark:bg-blue-400 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Shimmer effect for loading content
 */
export const ShimmerEffect: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  );
};

/**
 * Pulse dot for live indicators
 */
export const PulseDot: React.FC<{
  color?: 'green' | 'red' | 'yellow' | 'blue';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ color = 'green', size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };
  
  const colorClasses = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    yellow: 'bg-yellow-500',
    blue: 'bg-blue-500',
  };
  
  return (
    <div className={cn('relative', className)}>
      <div className={cn(
        'absolute inset-0 rounded-full animate-ping opacity-75',
        sizeClasses[size],
        colorClasses[color]
      )} />
      <div className={cn(
        'relative rounded-full',
        sizeClasses[size],
        colorClasses[color]
      )} />
    </div>
  );
};

/**
 * Loading button with instant feedback
 */
export const LoadingButton: React.FC<{
  isLoading: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
  disabled?: boolean;
}> = ({ isLoading, onClick, children, loadingText = 'Loading...', className = '', disabled = false }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        'relative px-4 py-2 rounded-lg font-medium transition-all',
        'bg-blue-600 text-white hover:bg-blue-700',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      <span className={cn(
        'flex items-center justify-center gap-2',
        isLoading && 'invisible'
      )}>
        {children}
      </span>
      {isLoading && (
        <span className="absolute inset-0 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{loadingText}</span>
        </span>
      )}
    </button>
  );
};