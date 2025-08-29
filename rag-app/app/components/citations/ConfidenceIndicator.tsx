import React from 'react';
import { Shield, AlertCircle, CheckCircle, Info } from 'lucide-react';

export interface ConfidenceIndicatorProps {
  confidence: number;
  showLabel?: boolean;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  inline?: boolean;
}

export const ConfidenceIndicator: React.FC<ConfidenceIndicatorProps> = ({
  confidence,
  showLabel = true,
  showPercentage = true,
  size = 'md',
  className = '',
  inline = false,
}) => {
  const getConfidenceLevel = (conf: number): { label: string; color: string; icon: React.ReactNode } => {
    if (conf >= 0.8) {
      return {
        label: 'High Confidence',
        color: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800',
        icon: <CheckCircle className={`${size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'}`} />,
      };
    }
    if (conf >= 0.5) {
      return {
        label: 'Medium Confidence',
        color: 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-800',
        icon: <Info className={`${size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'}`} />,
      };
    }
    return {
      label: 'Low Confidence',
      color: 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-900/20 dark:border-orange-800',
      icon: <AlertCircle className={`${size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'}`} />,
    };
  };
  
  const { label, color, icon } = getConfidenceLevel(confidence);
  const percentage = Math.round(confidence * 100);
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };
  
  if (inline) {
    return (
      <span className={`inline-flex items-center gap-1 ${color} ${className}`}>
        {icon}
        {showPercentage && <span className="font-medium">{percentage}%</span>}
      </span>
    );
  }
  
  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border ${sizeClasses[size]} ${color} ${className}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        {showLabel && (
          <span className="font-medium">
            {label}
          </span>
        )}
        {showPercentage && (
          <span className="opacity-90">
            ({percentage}%)
          </span>
        )}
      </div>
    </div>
  );
};

export const ConfidenceBar: React.FC<{
  confidence: number;
  height?: number;
  showLabel?: boolean;
  className?: string;
}> = ({ confidence, height = 6, showLabel = false, className = '' }) => {
  const percentage = Math.round(confidence * 100);
  
  const getBarColor = (conf: number) => {
    if (conf >= 0.8) return 'bg-green-500 dark:bg-green-400';
    if (conf >= 0.5) return 'bg-yellow-500 dark:bg-yellow-400';
    return 'bg-orange-500 dark:bg-orange-400';
  };
  
  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-600 dark:text-gray-400">Confidence</span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{percentage}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden`} style={{ height }}>
        <div
          className={`h-full transition-all duration-300 ${getBarColor(confidence)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export const TrustScore: React.FC<{
  score: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ score, size = 'md', className = '' }) => {
  const radius = size === 'sm' ? 30 : size === 'md' ? 40 : 50;
  const strokeWidth = size === 'sm' ? 3 : size === 'md' ? 4 : 5;
  const circumference = 2 * Math.PI * (radius - strokeWidth);
  const strokeDashoffset = circumference - (score * circumference);
  
  const getColor = (s: number) => {
    if (s >= 0.8) return '#10b981'; // green
    if (s >= 0.5) return '#f59e0b'; // yellow
    return '#fb923c'; // orange
  };
  
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={radius * 2}
        height={radius * 2}
        className="transform -rotate-90"
      >
        <circle
          cx={radius}
          cy={radius}
          r={radius - strokeWidth}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx={radius}
          cy={radius}
          r={radius - strokeWidth}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Shield className={`${size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6'} text-gray-600 dark:text-gray-400`} />
        <span className={`${size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base'} font-semibold text-gray-900 dark:text-gray-100`}>
          {Math.round(score * 100)}%
        </span>
      </div>
    </div>
  );
};