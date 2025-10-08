import { useEffect, useState, useMemo } from 'react';
import { FileText, Database, TrendingUp, Search } from 'lucide-react';
import { cn } from '~/utils/cn';
import type { DataFile } from '~/atoms/chat-atoms';

interface FileReferenceSuggestionsProps {
  query: string;
  dataFiles: DataFile[];
  onSelectFile: (file: DataFile) => void;
  onSelectSuggestion: (suggestion: string) => void;
  className?: string;
}

interface Suggestion {
  type: 'file' | 'query' | 'column';
  text: string;
  description?: string;
  icon: React.ReactNode;
  file?: DataFile;
}

export function FileReferenceSuggestions({
  query,
  dataFiles,
  onSelectFile,
  onSelectSuggestion,
  className
}: FileReferenceSuggestionsProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Parse query for potential file references
  const suggestions = useMemo(() => {
    const results: Suggestion[] = [];
    const lowerQuery = query.toLowerCase();
    
    // If query is empty or very short, don't show suggestions
    if (query.length < 2) return results;
    
    // Check for file name matches
    for (const file of dataFiles) {
      const filename = file.filename.toLowerCase();
      const tableName = file.tableName.toLowerCase();
      
      if (filename.includes(lowerQuery) || 
          tableName.includes(lowerQuery) ||
          lowerQuery.includes(filename.replace(/\.[^/.]+$/, '')) ||
          lowerQuery.includes(tableName)) {
        results.push({
          type: 'file',
          text: file.filename,
          description: `${file.rowCount} rows • ${(file.sizeBytes / 1024).toFixed(1)} KB`,
          icon: <FileText className="w-4 h-4" />,
          file
        });
      }
    }
    
    // Add query suggestions based on context
    if (dataFiles.length > 0) {
      const hasSelectKeyword = /\b(select|show|display|list)\b/i.test(lowerQuery);
      const hasAggregateKeyword = /\b(sum|average|count|max|min)\b/i.test(lowerQuery);
      const hasGroupKeyword = /\b(group|by)\b/i.test(lowerQuery);
      
      if (!hasSelectKeyword && !hasAggregateKeyword) {
        results.push({
          type: 'query',
          text: `Show all data from ${dataFiles[0].filename}`,
          description: 'View complete dataset',
          icon: <Database className="w-4 h-4" />
        });
      }
      
      if (!hasAggregateKeyword && dataFiles[0].schema?.columns) {
        const numericColumns = dataFiles[0].schema.columns
          .filter(col => col.type === 'number')
          .slice(0, 2);
        
        for (const col of numericColumns) {
          results.push({
            type: 'query',
            text: `Calculate average ${col.name}`,
            description: `From ${dataFiles[0].filename}`,
            icon: <TrendingUp className="w-4 h-4" />
          });
        }
      }
      
      if (!hasGroupKeyword && dataFiles[0].schema?.columns) {
        const stringColumns = dataFiles[0].schema.columns
          .filter(col => col.type === 'string')
          .slice(0, 2);
        
        for (const col of stringColumns) {
          results.push({
            type: 'query',
            text: `Group by ${col.name}`,
            description: `Analyze distribution in ${dataFiles[0].filename}`,
            icon: <Search className="w-4 h-4" />
          });
        }
      }
    }
    
    return results.slice(0, 5); // Limit to 5 suggestions
  }, [query, dataFiles]);
  
  // Show/hide suggestions based on query and results
  useEffect(() => {
    setShowSuggestions(suggestions.length > 0);
  }, [suggestions]);
  
  if (!showSuggestions || suggestions.length === 0) {
    return null;
  }
  
  return (
    <div className={cn(
      "absolute bottom-full left-0 right-0 mb-2 bg-theme-text-highlight",
      "border border-theme-border-primary rounded-lg shadow-lg",
      "max-h-60 overflow-y-auto",
      className
    )}>
      <div className="p-2">
        <div className="text-xs text-theme-text-primary px-2 py-1 font-medium">
          Suggestions
        </div>
        <div className="space-y-1">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => {
                if (suggestion.type === 'file' && suggestion.file) {
                  onSelectFile(suggestion.file);
                } else {
                  onSelectSuggestion(suggestion.text);
                }
                setShowSuggestions(false);
              }}
              className={cn(
                "w-full flex items-start gap-3 px-2 py-2 rounded",
                "hover:bg-gray-100 dark:hover:bg-gray-700",
                "text-left transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-blue-500"
              )}
            >
              <span className={cn(
                "flex-shrink-0 mt-0.5",
                suggestion.type === 'file' ? "text-blue-500" : "text-gray-500"
              )}>
                {suggestion.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {suggestion.text}
                </div>
                {suggestion.description && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {suggestion.description}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}