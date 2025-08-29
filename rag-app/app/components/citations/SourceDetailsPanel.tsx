import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Database, 
  Globe, 
  Brain, 
  ChevronDown, 
  ChevronUp,
  ExternalLink,
  Search,
  Calendar,
  Hash,
  BarChart3,
  X
} from 'lucide-react';
import type { SourceType } from './ProvenanceBadge';

export interface SourceDocument {
  id: string;
  type: SourceType;
  title: string;
  excerpt?: string;
  relevanceScore: number;
  confidence: number;
  url?: string;
  pageNumber?: number;
  section?: string;
  lastModified?: string;
  wordCount?: number;
  highlightedText?: string[];
  metadata?: Record<string, any>;
}

export interface SourceDetailsPanelProps {
  sources: SourceDocument[];
  isOpen: boolean;
  onClose?: () => void;
  onNavigateToSource?: (source: SourceDocument) => void;
  className?: string;
  embedded?: boolean; // If true, renders inline. If false, renders as modal
}

export const SourceDetailsPanel: React.FC<SourceDetailsPanelProps> = ({
  sources,
  isOpen,
  onClose,
  onNavigateToSource,
  className = '',
  embedded = true,
}) => {
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<SourceType | 'all'>('all');
  const [sortBy, setSortBy] = useState<'relevance' | 'confidence' | 'recent'>('relevance');
  
  const toggleExpanded = (sourceId: string) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(sourceId)) {
      newExpanded.delete(sourceId);
    } else {
      newExpanded.add(sourceId);
    }
    setExpandedSources(newExpanded);
  };
  
  const filteredAndSortedSources = useMemo(() => {
    let filtered = sources;
    
    if (filterType !== 'all') {
      filtered = sources.filter(s => s.type === filterType);
    }
    
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'relevance':
          return b.relevanceScore - a.relevanceScore;
        case 'confidence':
          return b.confidence - a.confidence;
        case 'recent':
          return (b.lastModified || '').localeCompare(a.lastModified || '');
        default:
          return 0;
      }
    });
    
    return sorted;
  }, [sources, filterType, sortBy]);
  
  const getSourceIcon = (type: SourceType) => {
    switch (type) {
      case 'document':
        return <FileText className="w-4 h-4" />;
      case 'database':
        return <Database className="w-4 h-4" />;
      case 'page':
        return <FileText className="w-4 h-4" />;
      case 'workspace':
        return <Globe className="w-4 h-4" />;
      case 'general':
        return <Brain className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };
  
  const getConfidenceBadge = (confidence: number) => {
    const color = confidence >= 0.8 ? 'green' : confidence >= 0.5 ? 'yellow' : 'orange';
    const label = confidence >= 0.8 ? 'High' : confidence >= 0.5 ? 'Medium' : 'Low';
    
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${color}-100 text-${color}-700 dark:bg-${color}-900/30 dark:text-${color}-400`}>
        {label} ({Math.round(confidence * 100)}%)
      </span>
    );
  };
  
  if (!isOpen) return null;
  
  const content = (
    <div className={`bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 shadow-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Source Citations
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              {sources.length} source{sources.length !== 1 ? 's' : ''} used for this response
            </p>
          </div>
          {!embedded && onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          )}
        </div>
        
        {/* Filters and Sort */}
        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Filter:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as SourceType | 'all')}
              className="text-xs px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <option value="all">All Types</option>
              <option value="document">Documents</option>
              <option value="database">Database</option>
              <option value="page">Pages</option>
              <option value="workspace">Workspace</option>
              <option value="general">General</option>
            </select>
          </div>
          
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'relevance' | 'confidence' | 'recent')}
              className="text-xs px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <option value="relevance">Relevance</option>
              <option value="confidence">Confidence</option>
              <option value="recent">Most Recent</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Sources List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredAndSortedSources.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No sources found matching your filters
          </div>
        ) : (
          <div className="divide-y dark:divide-gray-800">
            {filteredAndSortedSources.map((source) => {
              const isExpanded = expandedSources.has(source.id);
              
              return (
                <div key={source.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  {/* Source Header */}
                  <div className="flex items-start gap-3">
                    <div className="mt-1">{getSourceIcon(source.type)}</div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            {source.title}
                          </h4>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <BarChart3 className="w-3 h-3" />
                              <span>Relevance: {Math.round(source.relevanceScore * 100)}%</span>
                            </div>
                            {getConfidenceBadge(source.confidence)}
                            {source.type === 'workspace' && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                                Workspace Data
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {onNavigateToSource && source.url && (
                            <button
                              onClick={() => onNavigateToSource(source)}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                              title="Go to source"
                            >
                              <ExternalLink className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            </button>
                          )}
                          <button
                            onClick={() => toggleExpanded(source.id)}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            )}
                          </button>
                        </div>
                      </div>
                      
                      {/* Excerpt */}
                      {source.excerpt && (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                          {source.excerpt}
                        </p>
                      )}
                      
                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t dark:border-gray-700 space-y-2">
                          {source.highlightedText && source.highlightedText.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Relevant Passages:
                              </p>
                              <div className="space-y-1">
                                {source.highlightedText.map((text, index) => (
                                  <div
                                    key={index}
                                    className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-gray-700 dark:text-gray-300 border-l-2 border-yellow-400"
                                  >
                                    "{text}"
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {source.section && (
                              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                <Hash className="w-3 h-3" />
                                <span>Section: {source.section}</span>
                              </div>
                            )}
                            {source.pageNumber && (
                              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                <FileText className="w-3 h-3" />
                                <span>Page {source.pageNumber}</span>
                              </div>
                            )}
                            {source.lastModified && (
                              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(source.lastModified).toLocaleDateString()}</span>
                              </div>
                            )}
                            {source.wordCount && (
                              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                <FileText className="w-3 h-3" />
                                <span>{source.wordCount} words</span>
                              </div>
                            )}
                          </div>
                          
                          {source.metadata && Object.keys(source.metadata).length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Additional Info:
                              </p>
                              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                                {Object.entries(source.metadata).map(([key, value]) => (
                                  <div key={key}>
                                    <span className="font-medium">{key}:</span> {String(value)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="px-4 py-3 border-t dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            {sources.filter(s => s.type === 'workspace').length} workspace sources • {' '}
            {sources.filter(s => s.type === 'general').length} general knowledge
          </span>
          <span>
            Avg. confidence: {Math.round(sources.reduce((acc, s) => acc + s.confidence, 0) / sources.length * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
  
  if (embedded) {
    return content;
  }
  
  // Modal version
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-3xl">
        {content}
      </div>
    </div>
  );
};