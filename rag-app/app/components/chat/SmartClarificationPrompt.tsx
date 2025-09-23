import { HelpCircle } from 'lucide-react';
import { cn } from '~/utils/cn';

interface SmartClarificationPromptProps {
  query: string;
  clarificationMessage: string;
  suggestions?: string[];
  onRespond: (response: string) => void;
  onCancel?: () => void;
  className?: string;
}

export function SmartClarificationPrompt({
  query,
  clarificationMessage,
  suggestions,
  onRespond,
  onCancel,
  className
}: SmartClarificationPromptProps) {
  return (
    <div className={cn(
      "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4",
      className
    )}>
      <div className="flex items-start gap-3">
        <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {clarificationMessage}
            </p>
            {query && (
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 italic">
                You said: "{query}"
              </p>
            )}
          </div>

          {suggestions && suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Did you mean to:
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => onRespond(suggestion)}
                    className="text-left px-3 py-1.5 bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-sm transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {onCancel && (
            <button
              onClick={onCancel}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Never mind, I'll rephrase
            </button>
          )}
        </div>
      </div>
    </div>
  );
}