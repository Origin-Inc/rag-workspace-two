import { useState, useRef, useEffect, memo } from 'react';
import { useFetcher } from '@remix-run/react';
import type { ActionPreview, CommandParseResult } from '~/types/ai-actions';
import { PreviewPanel } from './PreviewPanel';
import { CommandHistory } from './CommandHistory';
import { cn } from '~/utils/cn';

interface AISidebarProps {
  workspaceId: string;
  userId: string;
  className?: string;
}

export const AISidebar = memo(function AISidebar({
  workspaceId,
  userId,
  className
}: AISidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPreview, setCurrentPreview] = useState<ActionPreview[] | null>(null);
  const [parseResult, setParseResult] = useState<CommandParseResult | null>(null);
  const [actionLogId, setActionLogId] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ command: string; timestamp: string }>>([]);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fetcher = useFetcher();

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as any;
      
      // Handle question/answer responses
      if (data.isQuestion && data.answer) {
        // Show answer in the preview panel or create a special answer display
        setCurrentPreview([{
          type: 'answer',
          description: data.answer,
          details: {
            citations: data.citations,
            confidence: data.confidence
          }
        }]);
        setParseResult(data.parseResult || {
          actions: [],
          confidence: data.confidence || 1,
          reasoning: 'Question answered'
        });
        // Don't set actionLogId for questions - nothing to execute
        setActionLogId(null);
        
        // Add to history
        setHistory(prev => [{
          command: command,
          timestamp: new Date().toISOString(),
          isQuestion: true,
          answer: data.answer
        }, ...prev].slice(0, 10));
      } else if (data.preview) {
        // Handle action commands
        setCurrentPreview(data.preview);
        setParseResult(data.parseResult);
        setActionLogId(data.actionLogId);
      }
      
      if (data.executed) {
        // Clear preview after successful execution
        setCurrentPreview(null);
        setParseResult(null);
        setActionLogId(null);
        setCommand('');
        // Add to history
        setHistory(prev => [{
          command: data.command,
          timestamp: new Date().toISOString()
        }, ...prev].slice(0, 10)); // Keep last 10 commands
      }
      setIsProcessing(false);
    }
  }, [fetcher.data, command]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isProcessing) return;

    setIsProcessing(true);
    
    // Send command to server for parsing and preview generation
    fetcher.submit(
      {
        action: 'parse',
        command: command.trim(),
        workspaceId,
        userId
      },
      { method: 'post', action: '/api/ai-controller' }
    );
  };

  const handleConfirm = () => {
    if (!actionLogId || !parseResult) return;

    setIsProcessing(true);
    
    // Confirm and execute the action
    fetcher.submit(
      {
        action: 'execute',
        actionLogId,
        workspaceId,
        userId
      },
      { method: 'post', action: '/api/ai-controller' }
    );
  };

  const handleCancel = () => {
    setCurrentPreview(null);
    setParseResult(null);
    setActionLogId(null);
    setCommand('');
  };

  const handleHistorySelect = (historicCommand: string) => {
    setCommand(historicCommand);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      className={cn(
        'fixed right-0 top-0 h-full bg-white shadow-xl transition-transform duration-300 z-50',
        isOpen ? 'translate-x-0' : 'translate-x-full',
        className
      )}
      style={{ width: '400px' }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'absolute -left-10 top-20 bg-blue-600 text-white p-2 rounded-l-lg shadow-lg transition-all',
          'hover:bg-blue-700 hover:-left-11'
        )}
        title={isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          )}
        </svg>
      </button>

      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
        <p className="text-sm text-gray-600 mt-1">
          Type commands to create and manage your workspace
        </p>
      </div>

      {/* Main content */}
      <div className="flex flex-col h-full">
        {/* Preview Panel (if active) */}
        {currentPreview && parseResult && (
          <div className="flex-1 overflow-auto border-b border-gray-200">
            <PreviewPanel
              preview={currentPreview}
              parseResult={parseResult}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
              isProcessing={isProcessing}
            />
          </div>
        )}

        {/* Command History */}
        {!currentPreview && history.length > 0 && (
          <div className="flex-1 overflow-auto border-b border-gray-200">
            <CommandHistory
              history={history}
              onSelect={handleHistorySelect}
            />
          </div>
        )}

        {/* Suggestions when empty */}
        {!currentPreview && history.length === 0 && (
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Try these commands:</h3>
              <div className="space-y-2">
                {[
                  'Add a database to track project tasks',
                  'Create expense tracker database',
                  'Add a formula that calculates days until due date',
                  'Create a contact list database',
                  'Build an inventory management system'
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setCommand(suggestion)}
                    className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <span className="text-blue-600">→</span> {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Command Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="space-y-3">
            <textarea
              ref={inputRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command... (e.g., 'Create a task tracker database')"
              className={cn(
                'w-full px-3 py-2 border rounded-lg resize-none',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                'placeholder-gray-400',
                isProcessing && 'opacity-50 cursor-not-allowed'
              )}
              rows={3}
              disabled={isProcessing || currentPreview !== null}
            />
            
            <button
              type="submit"
              disabled={!command.trim() || isProcessing || currentPreview !== null}
              className={cn(
                'w-full py-2 px-4 rounded-lg font-medium transition-all',
                'bg-blue-600 text-white hover:bg-blue-700',
                'disabled:bg-gray-300 disabled:cursor-not-allowed',
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
            >
              {isProcessing ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Processing...
                </span>
              ) : currentPreview ? (
                'Preview Active - Confirm or Cancel Above'
              ) : (
                'Send Command'
              )}
            </button>

            {/* Status indicators */}
            {parseResult && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">
                  Intent: <span className="font-medium">{parseResult.intent}</span>
                </span>
                <span className="text-gray-600">
                  Confidence: <span className="font-medium">{Math.round(parseResult.confidence * 100)}%</span>
                </span>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
});