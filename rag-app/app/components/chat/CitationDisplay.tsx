import { useState } from 'react';
import { FileText, Database, ChevronDown, ChevronUp, ExternalLink, Copy, Check } from 'lucide-react';
import { cn } from '~/utils/cn';

interface Citation {
  id: string;
  filename: string;
  tableName: string;
  lineNumbers?: [number, number];
  columnNames?: string[];
  queryUsed?: string;
  confidence: number;
}

interface CitationDisplayProps {
  citations: Citation[];
  format?: 'inline' | 'compact' | 'detailed';
  className?: string;
  onCitationClick?: (citation: Citation) => void;
}

export function CitationDisplay({
  citations,
  format = 'compact',
  className,
  onCitationClick
}: CitationDisplayProps) {
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  if (!citations || citations.length === 0) {
    return null;
  }
  
  const toggleExpanded = (id: string) => {
    setExpandedCitations(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  const copyQuery = async (query: string, citationId: string) => {
    try {
      await navigator.clipboard.writeText(query);
      setCopiedId(citationId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy query:', err);
    }
  };
  
  if (format === 'inline') {
    return (
      <span className={cn("inline-flex gap-1", className)}>
        {citations.map((cite, index) => (
          <button
            key={cite.id}
            onClick={() => onCitationClick?.(cite)}
            className={cn(
              "inline-flex items-center justify-center",
              "w-5 h-5 text-xs rounded-full",
              "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400",
              "hover:bg-blue-200 dark:hover:bg-blue-800",
              "transition-colors"
            )}
            title={`Source: ${cite.filename}`}
          >
            {index + 1}
          </button>
        ))}
      </span>
    );
  }
  
  return (
    <div className={cn(
      "mt-4 p-3 rounded-lg",
      "bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
      className
    )}>
      <div className="flex items-center gap-2 mb-2">
        <Database className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Sources ({citations.length})
        </span>
      </div>
      
      <div className="space-y-2">
        {citations.map((cite, index) => {
          const isExpanded = expandedCitations.has(cite.id);
          
          return (
            <div
              key={cite.id}
              className={cn(
                "rounded border transition-all",
                "bg-white dark:bg-gray-900",
                "border-gray-200 dark:border-gray-700",
                format === 'detailed' || isExpanded ? "p-3" : "p-2"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2 flex-1">
                  <span className={cn(
                    "flex items-center justify-center flex-shrink-0",
                    "w-5 h-5 mt-0.5 text-xs rounded-full",
                    "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400"
                  )}>
                    {index + 1}
                  </span>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <button
                        onClick={() => onCitationClick?.(cite)}
                        className={cn(
                          "text-sm font-medium truncate",
                          "text-blue-600 dark:text-blue-400",
                          "hover:text-blue-700 dark:hover:text-blue-300",
                          "hover:underline"
                        )}
                      >
                        {cite.filename}
                      </button>
                    </div>
                    
                    {(format === 'compact' && !isExpanded) ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Table: {cite.tableName}
                        {cite.lineNumbers && ` • Rows ${cite.lineNumbers[0]}-${cite.lineNumbers[1]}`}
                      </div>
                    ) : null}
                  </div>
                </div>
                
                {format === 'compact' && (
                  <button
                    onClick={() => toggleExpanded(cite.id)}
                    className={cn(
                      "p-1 rounded",
                      "hover:bg-gray-100 dark:hover:bg-gray-800",
                      "transition-colors"
                    )}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                )}
              </div>
              
              {(format === 'detailed' || isExpanded) && (
                <div className="mt-2 space-y-2 pl-7">
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-4">
                      <span>Table: <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">{cite.tableName}</code></span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full",
                        cite.confidence > 0.8 ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                        cite.confidence > 0.5 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      )}>
                        {(cite.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    
                    {cite.lineNumbers && (
                      <div className="mt-1">
                        Rows accessed: {cite.lineNumbers[0]} - {cite.lineNumbers[1]}
                      </div>
                    )}
                    
                    {cite.columnNames && cite.columnNames.length > 0 && (
                      <div className="mt-1">
                        Columns: {cite.columnNames.join(', ')}
                      </div>
                    )}
                  </div>
                  
                  {cite.queryUsed && (
                    <div className="relative">
                      <pre className={cn(
                        "text-xs p-2 rounded overflow-x-auto",
                        "bg-gray-100 dark:bg-gray-800",
                        "text-gray-700 dark:text-gray-300"
                      )}>
                        <code>{cite.queryUsed}</code>
                      </pre>
                      <button
                        onClick={() => copyQuery(cite.queryUsed!, cite.id)}
                        className={cn(
                          "absolute top-1 right-1 p-1 rounded",
                          "bg-white dark:bg-gray-700",
                          "hover:bg-gray-100 dark:hover:bg-gray-600",
                          "transition-colors"
                        )}
                        title="Copy query"
                      >
                        {copiedId === cite.id ? (
                          <Check className="w-3 h-3 text-green-600" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-500" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {format === 'compact' && citations.length > 3 && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
          Click citations to view details
        </div>
      )}
    </div>
  );
}