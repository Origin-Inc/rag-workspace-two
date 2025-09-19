import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, ChevronDown, ChevronUp, Code, BarChart, Plus } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '~/stores/chat-store';
import { cn } from '~/utils/cn';

interface ChatMessageProps {
  message: ChatMessageType;
  onAddToPage?: (message: ChatMessageType) => void;
}

export function ChatMessage({ message, onAddToPage }: ChatMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  return (
    <div 
      className={cn(
        "flex gap-3",
        isUser && "flex-row-reverse",
        isSystem && "justify-center"
      )}
    >
      
      {/* Message Content */}
      <div className={cn(
        "flex-1 space-y-1",
        isUser && "flex flex-col items-end",
        isSystem && "max-w-full"
      )}>
        {/* Message Bubble */}
        <div className={cn(
          "rounded-lg px-4 py-2 break-words",
          isUser ? "bg-theme-text-highlight text-theme-text-primary max-w-[85%]" : 
          isSystem ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800 text-sm text-center w-full" :
          "bg-theme-bg-primary text-gray-900 dark:text-gray-100 max-w-full overflow-hidden"
        )}>
          {isUser || isSystem ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert overflow-hidden">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                // Custom renderers for better styling
                table: ({children}) => (
                  <div className="chat-table-wrapper my-4">
                    <div className="chat-table-scroll">
                      <div className="inline-block min-w-full align-middle">
                        <div className="overflow-hidden">
                          <table className="min-w-full divide-y divide-theme-border-secondary">
                            {children}
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                ),
                thead: ({children}) => (
                  <thead className="bg-transparent">{children}</thead>
                ),
                tbody: ({children}) => (
                  <tbody className="bg-transparent divide-y divide-theme-border-secondary">{children}</tbody>
                ),
                th: ({children}) => (
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {children}
                  </th>
                ),
                td: ({children}) => (
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {children}
                  </td>
                ),
                h3: ({children}) => (
                  <h3 className="text-sm font-semibold mt-3 mb-2">{children}</h3>
                ),
                p: ({children}) => (
                  <p className="mb-2 break-words">{children}</p>
                ),
                em: ({children}) => (
                  <em className="text-gray-600 dark:text-gray-400 text-sm">{children}</em>
                ),
                strong: ({children}) => (
                  <strong className="font-semibold">{children}</strong>
                ),
                code: ({children, ...props}: React.HTMLAttributes<HTMLElement> & {className?: string}) => {
                  const inline = !props.className?.includes('language-');
                  return inline ? 
                    <code className="px-1 py-0.5 bg-theme-text-code rounded text-xs break-words" {...props}>{children}</code> :
                    <code className="block p-2 bg-theme-text-code text-gray-100 rounded text-xs overflow-x-auto max-w-full" {...props}>{children}</code>
                },
                pre: ({children}) => (
                  <div className="chat-table-wrapper my-2">
                    <div className="chat-table-scroll">
                      <pre className="bg-theme-text-code text-gray-100 p-3 rounded inline-block min-w-0">{children}</pre>
                    </div>
                  </div>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
            </div>
          )}
          
          {/* Metadata */}
          {message.metadata && !isSystem && (
            <div className="mt-2 pt-2 border-t border-opacity-20 border-current">
              {/* SQL Query */}
              {message.metadata.sql && (
                <div className="mb-2">
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1 text-xs opacity-80 hover:opacity-100"
                  >
                    <Code className="w-3 h-3" />
                    <span>SQL Query</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {isExpanded && (
                    <pre className={cn(
                      "mt-1 p-2 rounded text-xs overflow-x-auto",
                      isUser ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                    )}>
                      <code>{message.metadata.sql}</code>
                    </pre>
                  )}
                </div>
              )}
              
              {/* Chart Type */}
              {message.metadata.chartType && (
                <div className="flex items-center gap-1 text-xs opacity-80">
                  <BarChart className="w-3 h-3" />
                  <span>Chart: {message.metadata.chartType}</span>
                </div>
              )}
              
              {/* Data Files Used */}
              {message.metadata.dataFiles && message.metadata.dataFiles.length > 0 && (
                <div className="text-xs opacity-80 mt-1">
                  <span>Files: {message.metadata.dataFiles.join(', ')}</span>
                </div>
              )}
              
              {/* Error */}
              {message.metadata.error && (
                <div className={cn(
                  "text-xs mt-1 p-1 rounded",
                  isUser ? "bg-red-400 bg-opacity-20" : "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                )}>
                  Error: {message.metadata.error}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className={cn(
          "flex items-center gap-2 text-xs text-gray-500",
          isUser && "flex-row-reverse"
        )}>
          <span>{formatTime(message.timestamp)}</span>
          
          {/* Add to Page Button */}
          {!isUser && !isSystem && message.metadata && (message.metadata.sql || message.metadata.chartType) && onAddToPage && (
            <button
              onClick={() => onAddToPage(message)}
              className="flex items-center gap-1 px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300"
            >
              <Plus className="w-3 h-3" />
              <span>Add to Page</span>
            </button>
          )}
        </div>
        
        {/* Streaming Indicator */}
        {message.isStreaming && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <div className="flex gap-1">
              <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>Thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
}