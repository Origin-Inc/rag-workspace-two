import { useState } from 'react';
import { FileText, Clock, Database, Hash, X } from 'lucide-react';
import type { FileMatchResult } from '~/services/fuzzy-file-matcher.client';
import { cn } from '~/utils/cn';

interface FileDisambiguationDialogProps {
  matches: FileMatchResult[];
  onSelect: (match: FileMatchResult) => void;
  onCancel: () => void;
  query: string;
}

export function FileDisambiguationDialog({
  matches,
  onSelect,
  onCancel,
  query
}: FileDisambiguationDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  if (matches.length === 0) {
    return null;
  }
  
  // Auto-select if only one match with high confidence
  if (matches.length === 1 && matches[0].confidence > 0.8) {
    onSelect(matches[0]);
    return null;
  }
  
  const getMatchTypeIcon = (matchType: FileMatchResult['matchType']) => {
    switch (matchType) {
      case 'exact':
        return <FileText className="w-4 h-4 text-green-600" />;
      case 'temporal':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'semantic':
        return <Database className="w-4 h-4 text-purple-600" />;
      default:
        return <Hash className="w-4 h-4 text-gray-600" />;
    }
  };
  
  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence > 0.8) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (confidence > 0.6) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Multiple Files Match Your Query
            </h3>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Query: "{query}"
          </p>
        </div>
        
        {/* File Options */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-3">
            {matches.map((match, index) => (
              <div
                key={match.file.id}
                className={cn(
                  "p-4 rounded-lg border-2 cursor-pointer transition-all",
                  selectedIndex === index
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                )}
                onClick={() => setSelectedIndex(index)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getMatchTypeIcon(match.matchType)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {match.file.filename}
                      </h4>
                      <span className={cn(
                        "px-2 py-0.5 text-xs rounded-full font-medium",
                        getConfidenceBadgeColor(match.confidence)
                      )}>
                        {Math.round(match.confidence * 100)}% match
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {match.reason}
                    </p>
                    
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        {match.file.rowCount.toLocaleString()} rows
                      </span>
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {match.file.schema.length} columns
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Uploaded {new Date(match.file.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                    
                    {match.matchedTokens.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {match.matchedTokens.slice(0, 5).map((token, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-xs rounded"
                          >
                            {token}
                          </span>
                        ))}
                        {match.matchedTokens.length > 5 && (
                          <span className="text-xs text-gray-500">
                            +{match.matchedTokens.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {selectedIndex === index && (
                    <div className="flex-shrink-0">
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select the file you want to query
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={() => onSelect(matches[selectedIndex])}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Use Selected File
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}