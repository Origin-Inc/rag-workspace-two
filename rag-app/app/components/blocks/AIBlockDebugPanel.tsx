import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface DebugInfo {
  searchResultsCount?: number;
  contextLength?: number;
  processingTimeMs?: number;
  retryCount?: number;
  cacheHit?: boolean;
  error?: string;
  timestamp?: string;
}

interface Citation {
  pageId: string;
  pageTitle: string;
  snippet: string;
  relevance: number;
}

interface AIBlockDebugPanelProps {
  debugInfo?: DebugInfo;
  citations?: Citation[];
  query?: string;
  response?: string;
  isProduction?: boolean;
}

export function AIBlockDebugPanel({
  debugInfo,
  citations,
  query,
  response,
  isProduction = false
}: AIBlockDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'citations' | 'logs'>('info');

  // Don't show in production unless explicitly enabled
  if (isProduction && !window.localStorage.getItem('ai_debug_enabled')) {
    return null;
  }

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  const formatMs = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatRelevance = (relevance: number) => {
    return `${(relevance * 100).toFixed(1)}%`;
  };

  return (
    <div className="mt-2 border border-gray-200 rounded-md bg-gray-50 text-xs">
      <button
        onClick={toggleExpanded}
        className="w-full px-3 py-2 flex items-center justify-between text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <span className="font-medium">Debug Info</span>
        <div className="flex items-center gap-2">
          {debugInfo?.cacheHit && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">
              Cache Hit
            </span>
          )}
          {debugInfo?.error && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded">
              Error
            </span>
          )}
          {debugInfo?.processingTimeMs && (
            <span className="text-gray-500">
              {formatMs(debugInfo.processingTimeMs)}
            </span>
          )}
          {isExpanded ? (
            <ChevronUpIcon className="w-4 h-4" />
          ) : (
            <ChevronDownIcon className="w-4 h-4" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'info'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Info
            </button>
            <button
              onClick={() => setActiveTab('citations')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'citations'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Citations ({citations?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'logs'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Logs
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-3 max-h-64 overflow-y-auto">
            {activeTab === 'info' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-500">Processing Time:</span>
                    <span className="ml-2 font-medium">
                      {formatMs(debugInfo?.processingTimeMs)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Search Results:</span>
                    <span className="ml-2 font-medium">
                      {debugInfo?.searchResultsCount || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Context Length:</span>
                    <span className="ml-2 font-medium">
                      {debugInfo?.contextLength || 0} chars
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Retry Count:</span>
                    <span className="ml-2 font-medium">
                      {debugInfo?.retryCount || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Cache Status:</span>
                    <span className="ml-2 font-medium">
                      {debugInfo?.cacheHit ? 'Hit' : 'Miss'}
                    </span>
                  </div>
                  {debugInfo?.timestamp && (
                    <div>
                      <span className="text-gray-500">Timestamp:</span>
                      <span className="ml-2 font-medium">
                        {new Date(debugInfo.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>

                {debugInfo?.error && (
                  <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
                    <span className="text-red-600 font-medium">Error:</span>
                    <p className="mt-1 text-red-700">{debugInfo.error}</p>
                  </div>
                )}

                {query && (
                  <div className="mt-3">
                    <span className="text-gray-500">Query:</span>
                    <p className="mt-1 p-2 bg-white border border-gray-200 rounded">
                      {query}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'citations' && (
              <div className="space-y-2">
                {citations && citations.length > 0 ? (
                  citations.map((citation, index) => (
                    <div
                      key={`${citation.pageId}-${index}`}
                      className="p-2 bg-white border border-gray-200 rounded"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-gray-800">
                          {citation.pageTitle}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                          {formatRelevance(citation.relevance)}
                        </span>
                      </div>
                      <p className="text-gray-600 text-xs mt-1">
                        {citation.snippet}
                      </p>
                      <div className="mt-1 text-gray-400 text-xs">
                        ID: {citation.pageId}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500">No citations available</p>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-1 font-mono text-xs">
                <div className="text-gray-600">
                  [INFO] Query submitted: "{query?.substring(0, 50)}..."
                </div>
                {debugInfo?.searchResultsCount !== undefined && (
                  <div className="text-gray-600">
                    [INFO] Found {debugInfo.searchResultsCount} search results
                  </div>
                )}
                {debugInfo?.contextLength !== undefined && (
                  <div className="text-gray-600">
                    [INFO] Built context with {debugInfo.contextLength} characters
                  </div>
                )}
                {debugInfo?.cacheHit && (
                  <div className="text-green-600">
                    [CACHE] Response served from cache
                  </div>
                )}
                {debugInfo?.retryCount && debugInfo.retryCount > 0 && (
                  <div className="text-orange-600">
                    [RETRY] Request retried {debugInfo.retryCount} times
                  </div>
                )}
                {response && (
                  <div className="text-gray-600">
                    [SUCCESS] Response generated ({response.length} chars)
                  </div>
                )}
                {debugInfo?.error && (
                  <div className="text-red-600">
                    [ERROR] {debugInfo.error}
                  </div>
                )}
                {debugInfo?.processingTimeMs && (
                  <div className="text-blue-600">
                    [PERF] Total processing time: {formatMs(debugInfo.processingTimeMs)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}