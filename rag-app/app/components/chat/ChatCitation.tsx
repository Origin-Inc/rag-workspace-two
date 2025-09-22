import { useState } from 'react';
import { FileText, Database, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { cn } from '~/utils/cn';

export interface Citation {
  name: string;
  filename: string;
  fileId?: string;
  columnsUsed?: string[];
  rowsAccessed?: number;
}

interface ChatCitationProps {
  citations: Citation[];
  className?: string;
  defaultExpanded?: boolean;
}

export function ChatCitation({ citations, className, defaultExpanded = false }: ChatCitationProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  if (!citations || citations.length === 0) {
    return null;
  }
  
  // Calculate total rows accessed
  const totalRows = citations.reduce((sum, c) => sum + (c.rowsAccessed || 0), 0);
  const hasDetailedInfo = citations.some(c => c.columnsUsed && c.columnsUsed.length > 0);
  
  return (
    <div className={cn("mt-2 text-xs", className)}>
      {/* Compact View */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      >
        <Database className="w-3 h-3" />
        <span>
          Based on {citations.length} {citations.length === 1 ? 'file' : 'files'}
          {totalRows > 0 && ` • ${totalRows.toLocaleString()} rows analyzed`}
        </span>
        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      
      {/* Expanded View */}
      {isExpanded && (
        <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="space-y-2">
            {citations.map((citation, index) => (
              <div key={citation.fileId || index} className="flex items-start gap-2">
                <div className="flex items-center justify-center w-5 h-5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-[10px] font-semibold mt-0.5">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {citation.filename || citation.name}
                    </span>
                  </div>
                  
                  {/* Column and row details */}
                  {(citation.columnsUsed || citation.rowsAccessed) && (
                    <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                      {citation.columnsUsed && citation.columnsUsed.length > 0 && (
                        <div className="flex items-start gap-1">
                          <span className="text-gray-400">Columns:</span>
                          <span className="flex-1">
                            {citation.columnsUsed.slice(0, 3).join(', ')}
                            {citation.columnsUsed.length > 3 && ` +${citation.columnsUsed.length - 3} more`}
                          </span>
                        </div>
                      )}
                      {citation.rowsAccessed && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">Rows:</span>
                          <span>{citation.rowsAccessed.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Attribution Note */}
          <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-1 text-[10px] text-gray-500 dark:text-gray-400">
              <Info className="w-3 h-3 mt-0.5" />
              <span>
                Query results are based exclusively on the data in these files. 
                {hasDetailedInfo && ' Column usage shows which fields were referenced in the analysis.'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}