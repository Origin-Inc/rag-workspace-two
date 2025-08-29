import React from 'react';
import { FileText, Database, Globe, Brain, CheckCircle, AlertCircle } from 'lucide-react';

export type SourceType = 'document' | 'database' | 'page' | 'workspace' | 'general';

export interface ProvenanceBadgeProps {
  sourceCount: number;
  sourceTypes: SourceType[];
  confidence?: number;
  onClick?: () => void;
  className?: string;
  compact?: boolean;
}

const sourceIcons: Record<SourceType, React.ReactNode> = {
  document: <FileText className="w-3 h-3" />,
  database: <Database className="w-3 h-3" />,
  page: <FileText className="w-3 h-3" />,
  workspace: <CheckCircle className="w-3 h-3" />,
  general: <Brain className="w-3 h-3" />,
};

const sourceColors: Record<SourceType, string> = {
  document: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800',
  database: 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-900/20 dark:border-purple-800',
  page: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800',
  workspace: 'text-indigo-600 bg-indigo-50 border-indigo-200 dark:text-indigo-400 dark:bg-indigo-900/20 dark:border-indigo-800',
  general: 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-900/20 dark:border-gray-800',
};

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  sourceCount,
  sourceTypes,
  confidence,
  onClick,
  className = '',
  compact = false,
}) => {
  const uniqueTypes = [...new Set(sourceTypes)];
  const primaryType = uniqueTypes[0] || 'general';
  
  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.8) return 'text-green-600 dark:text-green-400';
    if (conf >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-orange-600 dark:text-orange-400';
  };
  
  const getConfidenceLabel = (conf: number) => {
    if (conf >= 0.8) return 'High';
    if (conf >= 0.5) return 'Medium';
    return 'Low';
  };
  
  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all hover:scale-105 ${sourceColors[primaryType]} ${className}`}
        title={`${sourceCount} source${sourceCount !== 1 ? 's' : ''} • Click for details`}
      >
        {sourceIcons[primaryType]}
        <span>{sourceCount}</span>
        {confidence !== undefined && (
          <span className={`ml-1 ${getConfidenceColor(confidence)}`}>
            •
          </span>
        )}
      </button>
    );
  }
  
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-all hover:shadow-md hover:scale-105 ${sourceColors[primaryType]} ${className}`}
    >
      <div className="flex items-center gap-1">
        {uniqueTypes.slice(0, 3).map((type, index) => (
          <span key={type} className={index > 0 ? 'opacity-60' : ''}>
            {sourceIcons[type]}
          </span>
        ))}
      </div>
      
      <span className="font-medium">
        {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
      </span>
      
      {confidence !== undefined && (
        <span className={`text-xs ${getConfidenceColor(confidence)}`}>
          {getConfidenceLabel(confidence)}
        </span>
      )}
      
      <span className="text-xs opacity-60">↓</span>
    </button>
  );
};