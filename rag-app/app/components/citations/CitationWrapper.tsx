import React, { useState, useCallback, useMemo } from 'react';
import { ProvenanceBadge, type SourceType } from './ProvenanceBadge';
import { SourceDetailsPanel, type SourceDocument } from './SourceDetailsPanel';
import { ConfidenceIndicator, ConfidenceBar, TrustScore } from './ConfidenceIndicator';
import { useNavigate } from '@remix-run/react';

export interface CitationData {
  sources: SourceDocument[];
  overallConfidence: number;
  isWorkspaceData: boolean;
  retrievalMetrics?: {
    totalDocumentsSearched: number;
    timeMs: number;
    queryEmbeddingSimilarity?: number;
  };
}

export interface CitationWrapperProps {
  citations?: CitationData;
  children: React.ReactNode;
  showInlineBadge?: boolean;
  badgePosition?: 'top' | 'bottom' | 'floating';
  className?: string;
  onSourceClick?: (source: SourceDocument) => void;
}

export const CitationWrapper: React.FC<CitationWrapperProps> = ({
  citations,
  children,
  showInlineBadge = true,
  badgePosition = 'top',
  className = '',
  onSourceClick,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const navigate = useNavigate();
  
  const handleNavigateToSource = useCallback((source: SourceDocument) => {
    if (onSourceClick) {
      onSourceClick(source);
    } else if (source.url) {
      // Navigate to the source URL within the app
      if (source.url.startsWith('/')) {
        navigate(source.url);
      } else {
        // Open external URLs in new tab
        window.open(source.url, '_blank');
      }
    }
  }, [navigate, onSourceClick]);
  
  const sourceTypes = useMemo(() => {
    if (!citations?.sources) return [];
    return citations.sources.map(s => s.type);
  }, [citations]);
  
  const workspaceSourceCount = useMemo(() => {
    if (!citations?.sources) return 0;
    return citations.sources.filter(s => s.type === 'workspace' || s.type === 'document' || s.type === 'database' || s.type === 'page').length;
  }, [citations]);
  
  const hasWorkspaceData = workspaceSourceCount > 0;
  
  if (!citations || !citations.sources || citations.sources.length === 0) {
    return <>{children}</>;
  }
  
  const renderBadge = () => {
    if (!showInlineBadge) return null;
    
    const badge = (
      <div className="flex items-center gap-2">
        <ProvenanceBadge
          sourceCount={citations.sources.length}
          sourceTypes={sourceTypes as SourceType[]}
          confidence={citations.overallConfidence}
          onClick={() => setShowDetails(!showDetails)}
          compact={badgePosition === 'floating'}
        />
        {hasWorkspaceData && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 font-medium">
            Uses Your Data
          </span>
        )}
      </div>
    );
    
    if (badgePosition === 'floating') {
      return (
        <div className="absolute top-2 right-2 z-10">
          {badge}
        </div>
      );
    }
    
    return (
      <div className={`flex items-center justify-between ${badgePosition === 'top' ? 'mb-3' : 'mt-3'}`}>
        {badge}
        <ConfidenceIndicator
          confidence={citations.overallConfidence}
          size="sm"
          inline
          showLabel={false}
        />
      </div>
    );
  };
  
  return (
    <div className={`relative ${className}`}>
      {badgePosition === 'top' && renderBadge()}
      
      <div className="citation-content">
        {children}
      </div>
      
      {badgePosition === 'bottom' && renderBadge()}
      {badgePosition === 'floating' && renderBadge()}
      
      {showDetails && (
        <div className="mt-4">
          <SourceDetailsPanel
            sources={citations.sources}
            isOpen={showDetails}
            onClose={() => setShowDetails(false)}
            onNavigateToSource={handleNavigateToSource}
            embedded={true}
          />
        </div>
      )}
      
      {/* Trust indicator for the entire response */}
      {citations.retrievalMetrics && (
        <div className="mt-3 pt-3 border-t dark:border-gray-800">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              Searched {citations.retrievalMetrics.totalDocumentsSearched} documents in {citations.retrievalMetrics.timeMs}ms
            </span>
            {citations.retrievalMetrics.queryEmbeddingSimilarity && (
              <span>
                Query match: {Math.round(citations.retrievalMetrics.queryEmbeddingSimilarity * 100)}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Hook for managing citation state
export const useCitations = (initialCitations?: CitationData) => {
  const [citations, setCitations] = useState<CitationData | undefined>(initialCitations);
  const [isLoading, setIsLoading] = useState(false);
  
  const updateCitations = useCallback((newCitations: CitationData) => {
    setCitations(newCitations);
  }, []);
  
  const addSource = useCallback((source: SourceDocument) => {
    setCitations(prev => {
      if (!prev) {
        return {
          sources: [source],
          overallConfidence: source.confidence,
          isWorkspaceData: source.type !== 'general',
        };
      }
      
      const newSources = [...prev.sources, source];
      const avgConfidence = newSources.reduce((acc, s) => acc + s.confidence, 0) / newSources.length;
      
      return {
        ...prev,
        sources: newSources,
        overallConfidence: avgConfidence,
        isWorkspaceData: prev.isWorkspaceData || source.type !== 'general',
      };
    });
  }, []);
  
  const removeSource = useCallback((sourceId: string) => {
    setCitations(prev => {
      if (!prev) return prev;
      
      const newSources = prev.sources.filter(s => s.id !== sourceId);
      if (newSources.length === 0) return undefined;
      
      const avgConfidence = newSources.reduce((acc, s) => acc + s.confidence, 0) / newSources.length;
      const hasWorkspaceData = newSources.some(s => s.type !== 'general');
      
      return {
        ...prev,
        sources: newSources,
        overallConfidence: avgConfidence,
        isWorkspaceData: hasWorkspaceData,
      };
    });
  }, []);
  
  return {
    citations,
    isLoading,
    setIsLoading,
    updateCitations,
    addSource,
    removeSource,
  };
};