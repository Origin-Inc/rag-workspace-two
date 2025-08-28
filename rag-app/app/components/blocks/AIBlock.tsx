import { useState, useEffect, useRef, useCallback } from 'react';
import { useFetcher } from '@remix-run/react';
import { cn } from '~/utils/cn';
import type { AIBlockContent } from '~/types/blocks';
import { Sparkles, Send, RotateCcw, X, Copy, Plus, Loader2 } from 'lucide-react';
import { AIBlockDebugPanel } from './AIBlockDebugPanel';

interface AIBlockProps {
  id: string;
  content: AIBlockContent;
  context?: any; // Database context or other data context
  workspaceId?: string;
  onUpdate?: (content: AIBlockContent) => void;
  onDelete?: () => void;
  onInsertBlock?: (content: string, type?: 'text' | 'heading' | 'code') => void;
  className?: string;
}

export function AIBlock({
  id,
  content,
  context,
  workspaceId,
  onUpdate,
  onDelete,
  onInsertBlock,
  className
}: AIBlockProps) {
  const [localContent, setLocalContent] = useState<AIBlockContent>(content);
  const [showChat, setShowChat] = useState(content.status === 'idle' && !content.response);
  const [userPrompt, setUserPrompt] = useState(content.prompt || '');
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const ragFetcher = useFetcher<any>();
  
  // Auto-focus when chat is shown
  useEffect(() => {
    if (showChat && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showChat]);

  // Handle fetcher state changes with timeout protection
  // Using useRef to track previous state to prevent infinite loops
  const prevFetcherStateRef = useRef(ragFetcher.state);
  const prevFetcherDataRef = useRef(ragFetcher.data);
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    // Only process if there's an actual state change
    const stateChanged = prevFetcherStateRef.current !== ragFetcher.state;
    const dataChanged = prevFetcherDataRef.current !== ragFetcher.data;
    
    if (!stateChanged && !dataChanged) {
      return;
    }
    
    prevFetcherStateRef.current = ragFetcher.state;
    prevFetcherDataRef.current = ragFetcher.data;
    
    if (ragFetcher.state === 'submitting') {
      setLocalContent(prev => ({ ...prev, status: 'generating' }));
      
      // Set a timeout for long-running requests (30 seconds)
      timeoutId = setTimeout(() => {
        if (ragFetcher.state === 'submitting') {
          console.error('[AI Block] Request timeout after 30s');
          setLocalContent(prev => ({
            ...prev,
            status: 'error',
            error: 'Request timed out. Please try again with a simpler query.'
          }));
          // Note: We can't actually cancel the fetcher, but we can update the UI
        }
      }, 30000);
    } else if (ragFetcher.state === 'idle' && ragFetcher.data) {
      // Clear any pending timeout
      if (timeoutId) clearTimeout(timeoutId);
      
      if (ragFetcher.data.success) {
        const newContent = {
          prompt: userPrompt,
          response: ragFetcher.data.answer,
          status: 'complete' as const,
          model: 'gpt-4-turbo',
          tokens: Math.floor((ragFetcher.data.answer?.length || 0) / 4),
          citations: ragFetcher.data.citations || []
        };
        setLocalContent(newContent);
        
        // Only call onUpdate if content actually changed
        if (onUpdate && newContent.response !== localContent.response) {
          onUpdate(newContent);
        }
        
        setShowChat(false);
      } else {
        console.error('[AI Block] Error from API:', ragFetcher.data);
        
        // Handle timeout errors differently
        const errorMessage = ragFetcher.data.timeout 
          ? 'Request timed out. The AI took too long to respond. Please try a shorter or simpler question.'
          : ragFetcher.data.error || 'Failed to generate response';
          
        setLocalContent(prev => ({
          ...prev,
          status: 'error',
          error: errorMessage
        }));
      }
    }
    
    // Cleanup timeout on unmount or state change
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [ragFetcher.state, ragFetcher.data, userPrompt, localContent.response]);

  // Handle Space key to open chat when block is focused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !showChat && document.activeElement === blockRef.current) {
        e.preventDefault();
        setShowChat(true);
        setIsTyping(true);
      }
      // Close chat on Escape
      if (e.key === 'Escape' && showChat) {
        setShowChat(false);
        setIsTyping(false);
        setUserPrompt('');
      }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Global Space hotkey when no input is focused
      if (e.key === ' ' && !['INPUT', 'TEXTAREA'].includes((e.target as Element)?.tagName) && !showChat) {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          e.preventDefault();
          blockRef.current?.focus();
          setShowChat(true);
          setIsTyping(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [id, showChat]);

  // Initialize with context if provided
  // Only run once when context changes and we don't have a prompt yet
  useEffect(() => {
    if (context && !localContent.prompt && !userPrompt) {
      const contextPrompt = generateContextPrompt(context);
      setUserPrompt(contextPrompt);
    }
    // Remove userPrompt from deps to prevent loop
  }, [context, localContent.prompt]);

  // Generate prompt from database context
  const generateContextPrompt = (ctx: any) => {
    if (!ctx) return '';

    let prompt = `Analyze this database:\n\n`;
    prompt += `Database: "${ctx.blockName || 'Untitled'}"\n`;
    
    if (ctx.description) {
      prompt += `Description: ${ctx.description}\n`;
    }
    
    prompt += `\nColumns (${ctx.columns?.length || 0}):\n`;
    ctx.columns?.forEach((col: any) => {
      prompt += `- ${col.name} (${col.type})\n`;
    });
    
    prompt += `\nData Summary:\n`;
    prompt += `- Total rows: ${ctx.totalRows || ctx.rows?.length || 0}\n`;
    
    if (ctx.filters?.length > 0) {
      prompt += `- Active filters: ${ctx.filters.length}\n`;
    }
    
    if (ctx.sorts?.length > 0) {
      prompt += `- Sorted by: ${ctx.sorts.map((s: any) => s.columnId).join(', ')}\n`;
    }

    prompt += `\nPlease provide:\n`;
    prompt += `1. Key insights from the data\n`;
    prompt += `2. Data quality observations\n`;
    prompt += `3. Suggested visualizations\n`;
    prompt += `4. Recommended analyses or queries\n`;

    return prompt;
  };

  // Handle AI generation with RAG
  const handleGenerate = useCallback(() => {
    const trimmedPrompt = userPrompt.trim();
    
    if (!trimmedPrompt) {
      console.warn('[AI Block] Empty prompt, skipping generation');
      return;
    }
    
    if (!workspaceId) {
      console.error('[AI Block] No workspaceId provided');
      setLocalContent(prev => ({
        ...prev,
        status: 'error',
        error: 'Workspace context is missing. Please reload the page.'
      }));
      return;
    }

    
    setIsTyping(false);
    
    const formData = new FormData();
    formData.append('action', 'searchAndAnswer');
    formData.append('query', trimmedPrompt);
    formData.append('workspaceId', workspaceId);
    formData.append('blockId', id);
    
    // Try to get pageId from URL or parent element
    const pageMatch = window.location.pathname.match(/editor\/([a-f0-9-]+)/);
    if (pageMatch) {
      formData.append('pageId', pageMatch[1]);
    }
    
    ragFetcher.submit(formData, {
      method: 'POST',
      action: '/api/rag-search'
    });
  }, [userPrompt, workspaceId, ragFetcher]);


  // Handle retry
  const handleRetry = useCallback(() => {
    setLocalContent(prev => ({ ...prev, status: 'idle', error: undefined }));
    setShowChat(true);
    setIsTyping(true);
  }, []);

  // Handle clear
  const handleClear = useCallback(() => {
    const clearedContent = { status: 'idle' as const };
    setLocalContent(clearedContent);
    setUserPrompt('');
    setShowChat(true);
    setIsTyping(true);
    onUpdate?.(clearedContent);
  }, [onUpdate]);

  // Handle insert as block
  const handleInsertAsBlock = useCallback((content: string) => {
    if (!onInsertBlock) return;
    
    // Determine block type based on content
    let blockType: 'text' | 'heading' | 'code' = 'text';
    if (content.startsWith('#')) {
      blockType = 'heading';
    } else if (content.includes('```')) {
      blockType = 'code';
    }
    
    onInsertBlock(content, blockType);
  }, [onInsertBlock]);

  // Handle copy to clipboard
  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, []);

  return (
    <div
      ref={blockRef}
      id={`ai-block-${id}`}
      className={cn(
        'group relative min-h-[120px] p-6 bg-gradient-to-br from-purple-50/80 to-indigo-50/80 dark:from-purple-900/10 dark:to-indigo-900/10',
        'rounded-xl border border-purple-100 dark:border-purple-800/50',
        'focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-300',
        'hover:border-purple-200 dark:hover:border-purple-700/50',
        'transition-all duration-200 ease-in-out',
        showChat && 'ring-2 ring-purple-200 dark:ring-purple-800/50',
        className
      )}
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">AI Assistant</span>
            {localContent.status === 'generating' && (
              <div className="flex items-center space-x-1 text-xs text-purple-600 dark:text-purple-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Searching and analyzing...</span>
              </div>
            )}
            {localContent.status === 'complete' && localContent.model && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {localContent.model} • {localContent.tokens} tokens
                {localContent.citations && localContent.citations.length > 0 && (
                  <> • {localContent.citations.length} sources</>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {localContent.status === 'complete' && (
            <>
              <button
                onClick={handleRetry}
                className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                title="Retry"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={handleClear}
                className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                title="Clear"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="Delete block"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      {localContent.status === 'idle' && !showChat && !localContent.response && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <div className="mb-4">
            <Sparkles className="w-12 h-12 mx-auto text-purple-300 dark:text-purple-600" />
          </div>
          <p className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">Ask AI about your workspace</p>
          <p className="text-sm mb-4">Press <kbd className="px-2 py-1 mx-1 bg-gray-200 dark:bg-gray-700 rounded font-mono text-xs">Space</kbd> anywhere to start</p>
          <button
            onClick={() => { setShowChat(true); setIsTyping(true); }}
            className="inline-flex items-center space-x-2 px-4 py-2 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded-lg transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>Ask AI</span>
          </button>
        </div>
      )}

      {/* Inline Chat */}
      {showChat && (
        <div className={cn(
          'relative bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700/50 p-4 mb-4',
          'animate-slide-in-from-top'
        )}>
          <div className="space-y-4">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={userPrompt}
                onChange={(e) => {
                  setUserPrompt(e.target.value);
                  setIsTyping(e.target.value.length > 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleGenerate();
                  }
                  if (e.key === 'Escape') {
                    setShowChat(false);
                    setIsTyping(false);
                  }
                }}
                placeholder={context ? "Ask about this database..." : "Ask about your workspace, data, or anything else..."}
                className="w-full p-4 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 transition-all"
                rows={3}
                disabled={ragFetcher.state === 'submitting'}
              />
              <button
                onClick={handleGenerate}
                disabled={!userPrompt.trim() || ragFetcher.state === 'submitting'}
                className={cn(
                  'absolute right-3 bottom-3 p-2 rounded-lg transition-all',
                  userPrompt.trim() && ragFetcher.state !== 'submitting'
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                )}
              >
                {ragFetcher.state === 'submitting' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center space-x-4">
                <span>Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded font-mono">⌘ Enter</kbd> to send</span>
                <span>Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded font-mono">Esc</kbd> to close</span>
              </div>
              <button
                onClick={() => {
                  setShowChat(false);
                  setIsTyping(false);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Response */}
      {localContent.response && (
        <div className={cn(
          'bg-white dark:bg-gray-900/30 rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden',
          'animate-slide-in-from-bottom'
        )}>
          <div className="p-6">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <div dangerouslySetInnerHTML={{ 
                __html: convertMarkdownToHtml(localContent.response) 
              }} />
            </div>
            
            {/* Citations */}
            {localContent.citations && localContent.citations.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sources</h4>
                <div className="space-y-2">
                  {localContent.citations.map((citation: any, index: number) => (
                    <div key={citation.passage_id || index} className="text-xs text-gray-600 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-800/50 rounded border-l-2 border-purple-200 dark:border-purple-800">
                      <span className="font-mono text-purple-600 dark:text-purple-400">[{index + 1}]</span>
                      <span className="ml-2">{citation.excerpt || citation.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Action Bar */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {onInsertBlock && (
                <button
                  onClick={() => handleInsertAsBlock(localContent.response || '')}
                  className="inline-flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Insert as Block</span>
                </button>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleCopy(localContent.response || '')}
                className="inline-flex items-center space-x-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
                <span>Copy</span>
              </button>
              <button
                onClick={handleRetry}
                className="inline-flex items-center space-x-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {localContent.status === 'error' && (
        <div className={cn(
          'bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800/50 p-4',
          'animate-fade-in'
        )}>
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <X className="w-5 h-5 text-red-500 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">Something went wrong</h4>
              <p className="text-sm text-red-600 dark:text-red-400">
                {localContent.error || 'Failed to generate AI response. Please try again.'}
              </p>
              <button
                onClick={handleRetry}
                className="mt-3 inline-flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Panel (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <AIBlockDebugPanel
          debugInfo={ragFetcher.data?.debugInfo}
          citations={ragFetcher.data?.citations}
          query={userPrompt}
          response={localContent.response}
          isProduction={process.env.NODE_ENV === 'production'}
        />
      )}
    </div>
  );
}

// Simple markdown to HTML converter
function convertMarkdownToHtml(markdown: string): string {
  return markdown
    .replace(/### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\d+\. (.*?)$/gm, '<li>$1</li>')
    .replace(/^- (.*?)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
    .replace(/<li>/g, '<ul><li>')
    .replace(/<\/li>(?!.*<li>)/g, '</li></ul>');
}