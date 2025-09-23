import { FileText, AlertCircle, Check, X, FolderOpen } from 'lucide-react';
import type { FileMatchResult } from '~/services/fuzzy-file-matcher.client';
import { cn } from '~/utils/cn';

interface FileClarificationPromptProps {
  match: FileMatchResult;
  query: string;
  onConfirm: () => void;
  onReject: () => void;
  onBrowseFiles: () => void;
  className?: string;
}

export function FileClarificationPrompt({
  match,
  query,
  onConfirm,
  onReject,
  onBrowseFiles,
  className
}: FileClarificationPromptProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence > 0.7) return 'text-green-600 dark:text-green-400';
    if (confidence > 0.4) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-orange-600 dark:text-orange-400';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence > 0.7) return 'Good match';
    if (confidence > 0.4) return 'Possible match';
    return 'Uncertain match';
  };

  return (
    <div className={cn(
      "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4",
      className
    )}>
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              I'm not certain which file you're referring to
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Query: "{query}"
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {match.file.filename}
              </span>
              <span className={cn(
                "text-xs font-medium ml-auto",
                getConfidenceColor(match.confidence)
              )}>
                {Math.round(match.confidence * 100)}% - {getConfidenceLabel(match.confidence)}
              </span>
            </div>
            
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <p>{match.file.rowCount.toLocaleString()} rows • {match.file.schema.length} columns</p>
              <p className="italic">{match.reason}</p>
            </div>

            {match.matchedTokens.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-xs text-gray-500">Matched:</span>
                {match.matchedTokens.slice(0, 3).map((token, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-xs rounded text-blue-700 dark:text-blue-300"
                  >
                    {token}
                  </span>
                ))}
                {match.matchedTokens.length > 3 && (
                  <span className="text-xs text-gray-500">
                    +{match.matchedTokens.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onConfirm}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
            >
              <Check className="w-4 h-4" />
              Yes, use this file
            </button>
            
            <button
              onClick={onReject}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
            >
              <X className="w-4 h-4" />
              No, different file
            </button>
            
            <button
              onClick={onBrowseFiles}
              className="flex items-center gap-1.5 px-3 py-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg text-sm font-medium transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Browse all files
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}