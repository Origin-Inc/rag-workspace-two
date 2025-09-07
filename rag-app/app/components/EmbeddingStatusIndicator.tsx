import { useEffect, useState } from 'react';
import { useFetcher } from '@remix-run/react';
import { 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  RefreshCw,
  Zap
} from 'lucide-react';
import { cn } from '~/utils/cn';

interface EmbeddingStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  lastProcessedAt?: string;
}

interface EmbeddingStatusIndicatorProps {
  pageId: string;
  className?: string;
  showDetails?: boolean;
  onRetry?: () => void;
}

export function EmbeddingStatusIndicator({
  pageId,
  className,
  showDetails = false,
  onRetry
}: EmbeddingStatusIndicatorProps) {
  const fetcher = useFetcher<{ status: EmbeddingStatus | null }>();
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  
  // Poll for status updates
  useEffect(() => {
    const loadStatus = () => {
      fetcher.load(`/api/embeddings/status/${pageId}`);
    };
    
    loadStatus();
    
    // Poll every 2 seconds while processing
    const interval = setInterval(() => {
      if (status?.status === 'processing' || status?.status === 'pending') {
        loadStatus();
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [pageId, status?.status]);
  
  // Update local status when fetcher data changes
  useEffect(() => {
    if (fetcher.data?.status) {
      setStatus(fetcher.data.status);
    }
  }, [fetcher.data]);
  
  if (!status) {
    return null;
  }
  
  const getStatusIcon = () => {
    switch (status.status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  };
  
  const getStatusLabel = () => {
    switch (status.status) {
      case 'pending':
        return 'Queued for indexing';
      case 'processing':
        return `Indexing... ${status.progress}%`;
      case 'completed':
        return 'Indexed';
      case 'failed':
        return 'Indexing failed';
      default:
        return '';
    }
  };
  
  const getStatusColor = () => {
    switch (status.status) {
      case 'pending':
        return 'bg-gray-100 text-gray-700';
      case 'processing':
        return 'bg-blue-100 text-blue-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };
  
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Status Badge */}
      <div className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        getStatusColor()
      )}>
        {getStatusIcon()}
        <span>{getStatusLabel()}</span>
      </div>
      
      {/* Progress Bar (for processing status) */}
      {status.status === 'processing' && status.progress > 0 && (
        <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 transition-all duration-300 ease-out"
            style={{ width: `${status.progress}%` }}
          />
        </div>
      )}
      
      {/* Details */}
      {showDetails && (
        <>
          {/* Last Processed */}
          {status.lastProcessedAt && status.status === 'completed' && (
            <span className="text-xs text-gray-500">
              {formatDate(status.lastProcessedAt)}
            </span>
          )}
          
          {/* Error Message */}
          {status.status === 'failed' && status.error && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-600 truncate max-w-xs" title={status.error}>
                {status.error}
              </span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Retry indexing"
                >
                  <RefreshCw className="w-3 h-3 text-gray-600" />
                </button>
              )}
            </div>
          )}
        </>
      )}
      
      {/* Quick Index Button (for pending/failed) */}
      {(status.status === 'pending' || status.status === 'failed') && onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Zap className="w-3 h-3" />
          Index Now
        </button>
      )}
    </div>
  );
}

/**
 * Bulk status indicator for multiple pages
 */
interface BulkEmbeddingStatusProps {
  pageIds: string[];
  className?: string;
}

export function BulkEmbeddingStatus({ pageIds, className }: BulkEmbeddingStatusProps) {
  const fetcher = useFetcher<{ statuses: Record<string, EmbeddingStatus> }>();
  const [statuses, setStatuses] = useState<Record<string, EmbeddingStatus>>({});
  
  useEffect(() => {
    if (pageIds.length > 0) {
      fetcher.load(`/api/embeddings/bulk-status?ids=${pageIds.join(',')}`);
    }
  }, [pageIds.join(',')]);
  
  useEffect(() => {
    if (fetcher.data?.statuses) {
      setStatuses(fetcher.data.statuses);
    }
  }, [fetcher.data]);
  
  const counts = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0
  };
  
  Object.values(statuses).forEach(status => {
    counts[status.status]++;
  });
  
  const total = pageIds.length;
  const allCompleted = counts.completed === total;
  const hasFailures = counts.failed > 0;
  const isProcessing = counts.processing > 0;
  
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Overall Status */}
      <div className="flex items-center gap-2">
        {isProcessing ? (
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
        ) : allCompleted ? (
          <CheckCircle className="w-4 h-4 text-green-600" />
        ) : hasFailures ? (
          <AlertCircle className="w-4 h-4 text-red-600" />
        ) : (
          <Clock className="w-4 h-4 text-gray-500" />
        )}
        
        <span className="text-sm font-medium">
          {isProcessing ? 'Indexing...' : allCompleted ? 'All Indexed' : 'Partial Index'}
        </span>
      </div>
      
      {/* Status Breakdown */}
      <div className="flex items-center gap-2 text-xs">
        {counts.completed > 0 && (
          <span className="text-green-600">
            {counts.completed} indexed
          </span>
        )}
        {counts.processing > 0 && (
          <span className="text-blue-600">
            {counts.processing} processing
          </span>
        )}
        {counts.pending > 0 && (
          <span className="text-gray-600">
            {counts.pending} queued
          </span>
        )}
        {counts.failed > 0 && (
          <span className="text-red-600">
            {counts.failed} failed
          </span>
        )}
      </div>
      
      {/* Progress Bar */}
      {total > 0 && (
        <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-green-600 transition-all duration-300 ease-out"
            style={{ width: `${(counts.completed / total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}