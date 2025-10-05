import { HelpCircle, FileText, FolderOpen, Upload } from 'lucide-react';
import type { DataFile } from '~/atoms/chat-atoms';
import type { FileMatchResult } from '~/services/fuzzy-file-matcher.client';
import { cn } from '~/utils/cn';

interface FileNotFoundPromptProps {
  query: string;
  availableFiles: DataFile[];
  suggestions?: FileMatchResult[]; // Low confidence matches to suggest
  onSelectFile: (file: DataFile) => void;
  onBrowseFiles: () => void;
  onUploadNew: () => void;
  onUseAllFiles: () => void;
  className?: string;
}

export function FileNotFoundPrompt({
  query,
  availableFiles,
  suggestions,
  onSelectFile,
  onBrowseFiles,
  onUploadNew,
  onUseAllFiles,
  className
}: FileNotFoundPromptProps) {
  const hasFiles = availableFiles.length > 0;
  const hasSuggestions = suggestions && suggestions.length > 0;

  return (
    <div className={cn(
      "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4",
      className
    )}>
      <div className="flex items-start gap-3">
        <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              I couldn't find a specific file matching your query
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              Query: "{query}"
            </p>
          </div>

          {!hasFiles ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                No data files are currently loaded. Please upload a file to start querying.
              </p>
              <button
                onClick={onUploadNew}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload Data File
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {hasSuggestions ? (
                <>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Did you mean one of these files?
                  </p>
                  <div className="space-y-2">
                    {suggestions.slice(0, 3).map((suggestion) => (
                      <button
                        key={suggestion.file.id}
                        onClick={() => onSelectFile(suggestion.file)}
                        className="w-full text-left bg-white dark:bg-gray-800 rounded-lg p-2 border border-amber-200 dark:border-gray-700 hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {suggestion.file.filename}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {suggestion.file.rowCount.toLocaleString()} rows • {Math.round(suggestion.confidence * 100)}% match
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Available files:
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {availableFiles.slice(0, 5).map((file) => (
                      <button
                        key={file.id}
                        onClick={() => onSelectFile(file)}
                        className="w-full text-left bg-white dark:bg-gray-800 rounded-lg p-2 border border-amber-200 dark:border-gray-700 hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {file.filename}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {file.rowCount.toLocaleString()} rows
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {availableFiles.length > 5 && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      And {availableFiles.length - 5} more files...
                    </p>
                  )}
                </>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onBrowseFiles}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 text-sm font-medium transition-colors"
                >
                  <FolderOpen className="w-4 h-4" />
                  Browse All Files
                </button>
                
                <button
                  onClick={onUseAllFiles}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Query All Files
                </button>
                
                <button
                  onClick={onUploadNew}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg text-sm font-medium transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Upload New
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}