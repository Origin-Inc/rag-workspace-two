import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '~/utils/cn';
import type { AIBlockContent } from '~/types/blocks';

interface AIBlockProps {
  id: string;
  content: AIBlockContent;
  context?: any; // Database context or other data context
  onUpdate?: (content: AIBlockContent) => void;
  onDelete?: () => void;
  className?: string;
}

export function AIBlock({
  id,
  content,
  context,
  onUpdate,
  onDelete,
  className
}: AIBlockProps) {
  const [localContent, setLocalContent] = useState<AIBlockContent>(content);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [userPrompt, setUserPrompt] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Handle Space key to open chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !showChat && document.activeElement?.id === `ai-block-${id}`) {
        e.preventDefault();
        setShowChat(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [id, showChat]);

  // Initialize with context if provided
  useEffect(() => {
    if (context && !localContent.prompt) {
      const contextPrompt = generateContextPrompt(context);
      setLocalContent(prev => ({
        ...prev,
        prompt: contextPrompt,
        status: 'idle'
      }));
      setUserPrompt(contextPrompt);
      onUpdate?.({ ...localContent, prompt: contextPrompt });
    }
  }, [context]);

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

  // Handle AI generation
  const handleGenerate = async () => {
    if (!userPrompt.trim()) return;

    setIsGenerating(true);
    setLocalContent(prev => ({
      ...prev,
      prompt: userPrompt,
      status: 'generating'
    }));

    try {
      // TODO: Call actual AI API endpoint
      // For now, simulate AI response
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const mockResponse = generateMockResponse(userPrompt, context);
      
      setLocalContent(prev => ({
        ...prev,
        response: mockResponse,
        status: 'complete',
        model: 'gpt-4',
        tokens: mockResponse.split(' ').length * 1.3
      }));

      onUpdate?.({
        ...localContent,
        prompt: userPrompt,
        response: mockResponse,
        status: 'complete',
        model: 'gpt-4',
        tokens: Math.floor(mockResponse.split(' ').length * 1.3)
      });

    } catch (error) {
      setLocalContent(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to generate response'
      }));
    } finally {
      setIsGenerating(false);
      setShowChat(false);
    }
  };

  // Generate mock response based on context
  const generateMockResponse = (prompt: string, ctx: any) => {
    if (ctx && ctx.blockName) {
      return `## Analysis of "${ctx.blockName}" Database

### Key Insights
- The database contains ${ctx.totalRows || ctx.rows?.length || 0} records across ${ctx.columns?.length || 0} columns
- Primary data types include: ${ctx.columns?.map((c: any) => c.type).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).join(', ')}
${ctx.filters?.length > 0 ? `- Currently filtered by ${ctx.filters.length} condition(s)` : ''}

### Data Quality Observations
✅ All columns have consistent data types
⚠️ Consider adding validation rules for required fields
📊 Numeric columns available for statistical analysis

### Suggested Visualizations
1. **Bar Chart**: Distribution of records by status/category columns
2. **Time Series**: Trends over date columns if present
3. **Pie Chart**: Proportional breakdown of select/multi-select fields
4. **Heatmap**: Correlation between numeric columns

### Recommended Analyses
1. Group records by category and calculate aggregates
2. Identify patterns in date-based data
3. Find correlations between numeric fields
4. Detect outliers in numeric columns
5. Analyze completion rates for optional fields

### Next Steps
- Export data for detailed statistical analysis
- Create custom views with specific filters
- Set up automated reports for key metrics
- Add calculated columns for derived metrics`;
    }

    return `## AI Analysis

Based on your prompt: "${prompt}"

### Summary
This is a simulated AI response. In production, this would connect to your AI service to provide real analysis.

### Key Points
- Implement actual AI integration
- Connect to OpenAI, Claude, or other LLM APIs
- Process context data for meaningful insights
- Generate charts and visualizations

### Recommendations
1. Configure AI API credentials
2. Set up proper error handling
3. Implement streaming responses
4. Add response caching`;
  };

  // Handle retry
  const handleRetry = () => {
    setLocalContent(prev => ({ ...prev, status: 'idle', error: undefined }));
    handleGenerate();
  };

  // Handle clear
  const handleClear = () => {
    setLocalContent({ status: 'idle' });
    setUserPrompt('');
    setShowChat(false);
    onUpdate?.({ status: 'idle' });
  };

  return (
    <div
      id={`ai-block-${id}`}
      className={cn(
        'relative min-h-[120px] p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-800',
        'focus:outline-none focus:ring-2 focus:ring-purple-500',
        className
      )}
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-xl">✨</span>
          <span className="font-medium text-gray-900 dark:text-white">AI Analysis</span>
          {localContent.status === 'generating' && (
            <span className="text-sm text-purple-600 dark:text-purple-400 animate-pulse">
              Generating...
            </span>
          )}
          {localContent.status === 'complete' && localContent.model && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {localContent.model} • {localContent.tokens} tokens
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {localContent.status === 'complete' && (
            <>
              <button
                onClick={handleRetry}
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                Retry
              </button>
              <button
                onClick={handleClear}
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                Clear
              </button>
            </>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      {localContent.status === 'idle' && !showChat && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">Press <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Space</kbd> to ask AI</p>
        </div>
      )}

      {/* Chat Input */}
      {showChat && (
        <div className="space-y-3">
          <textarea
            ref={inputRef}
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
              if (e.key === 'Escape') {
                setShowChat(false);
              }
            }}
            placeholder={context ? "Ask about this database..." : "What would you like to know?"}
            className="w-full p-3 border border-purple-200 dark:border-purple-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowChat(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!userPrompt.trim() || isGenerating}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      )}

      {/* AI Response */}
      {localContent.response && (
        <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-purple-100 dark:border-purple-900">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <div dangerouslySetInnerHTML={{ 
              __html: convertMarkdownToHtml(localContent.response) 
            }} />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <button
              onClick={() => {
                // TODO: Implement insert as block functionality
                console.log('Insert as block:', localContent.response);
              }}
              className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400"
            >
              Insert as Block
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(localContent.response || '');
              }}
              className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {localContent.status === 'error' && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">
            {localContent.error || 'An error occurred'}
          </p>
          <button
            onClick={handleRetry}
            className="mt-2 text-sm text-red-600 hover:text-red-700 dark:text-red-400 underline"
          >
            Try again
          </button>
        </div>
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