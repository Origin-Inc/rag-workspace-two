import { useState, useCallback } from 'react';
import { X, FileText, FileSpreadsheet, File, ChevronRight, Database, Loader2, CloudIcon, CheckCircleIcon, CloudOff, CloudUpload, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '~/utils/cn';
import { useChatDataFiles } from '~/hooks/use-chat-atoms';
import type { FileSchema } from '~/services/file-processing.client';

type SyncStatus = 'synced' | 'syncing' | 'failed' | 'local-only';

interface FileChipProps {
  file: {
    id: string;
    filename: string;
    tableName: string;
    sizeBytes: number;
    rowCount?: number;
    schema?: FileSchema;
    fileType?: string;
    pageCount?: number;
    extractionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
    syncStatus?: SyncStatus;
    storageUrl?: string | null;
    parquetUrl?: string | null;
  };
  onRemove: () => void;
}

function FileChip({
  file,
  onRemove
}: FileChipProps) {

  // Determine file icon based on extension
  const getFileIcon = () => {
    const ext = file.filename.toLowerCase().split('.').pop();
    switch (ext) {
      case 'csv':
      case 'xlsx':
      case 'xls':
        return <FileSpreadsheet className="w-3.5 h-3.5" />;
      case 'pdf':
        return <FileText className="w-3.5 h-3.5" />;
      default:
        return <File className="w-3.5 h-3.5" />;
    }
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  // Truncate filename if too long (shorter for compact display)
  const truncateFilename = (name: string, maxLength: number = 16) => {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop();
    const nameWithoutExt = name.substring(0, name.lastIndexOf('.'));
    const truncated = nameWithoutExt.substring(0, maxLength - 3 - (ext?.length || 0));
    return `${truncated}...${ext ? '.' + ext : ''}`;
  };
  
  const isPDF = file.filename.toLowerCase().endsWith('.pdf');
  const isProcessing = file.extractionStatus === 'processing';
  const hasFailed = file.extractionStatus === 'failed';
  
  // Determine sync status with enhanced logic
  const getSyncStatus = (): SyncStatus => {
    // Use explicit sync status if available
    if (file.syncStatus) return file.syncStatus;
    
    // Check for sync failures
    if (file.cloudSyncFailed || file.restoreFailed) return 'failed';
    
    // Check if file has cloud storage
    if (file.storageUrl || file.parquetUrl) return 'synced';
    
    // Check source to determine status
    if (file.source === 'both') return 'synced';
    if (file.source === 'cloud') return 'synced';
    
    // Default to local-only
    return 'local-only';
  };
  
  const syncStatus = getSyncStatus();
  const [isRetrying, setIsRetrying] = useState(false);
  
  // Handle retry sync
  const handleRetrySync = async () => {
    if (isRetrying) return;
    
    setIsRetrying(true);
    try {
      // Call retry sync API or trigger re-upload
      // This would need to be implemented with the actual sync logic
      console.log(`Retrying sync for file: ${file.filename}`);
      // TODO: Implement actual retry logic here
      // await retryFileSync(file.id);
    } catch (error) {
      console.error('Failed to retry sync:', error);
    } finally {
      setIsRetrying(false);
    }
  };
  
  // Get sync icon with enhanced states
  const getSyncIcon = () => {
    if (isRetrying) {
      return <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin" />;
    }
    
    switch (syncStatus) {
      case 'synced':
        return <CheckCircleIcon className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />;
      case 'syncing':
        return <CloudUpload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-pulse" />;
      case 'failed':
        return (
          <button
            onClick={handleRetrySync}
            className="hover:opacity-70 transition-opacity"
            title="Click to retry sync"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          </button>
        );
      case 'local-only':
        return <CloudOff className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />;
      default:
        return <CloudIcon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />;
    }
  };
  
  // Get sync status text
  const getSyncStatusText = () => {
    if (isRetrying) return 'Retrying sync...';
    
    switch (syncStatus) {
      case 'synced':
        return 'Synced to cloud';
      case 'syncing':
        return 'Syncing...';
      case 'failed':
        if (file.cloudSyncFailed) return 'Cloud sync failed - click to retry';
        if (file.restoreFailed) return 'Restore failed - re-upload file';
        return 'Sync failed - click to retry';
      case 'local-only':
        return 'Saved locally only';
      default:
        return 'Unknown status';
    }
  };
  
  // Build detailed tooltip text
  const tooltipText = [
    file.filename,
    `Size: ${formatSize(file.sizeBytes)}`,
    file.rowCount ? `Rows: ${file.rowCount.toLocaleString()}` : null,
    isPDF && file.pageCount ? `Pages: ${file.pageCount}` : null,
    getSyncStatusText(),
  ].filter(Boolean).join('\n');

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md",
        "transition-all duration-200 select-none group",
        "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30",
        "border border-blue-200 dark:border-blue-800",
        hasFailed && "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800"
      )}
      title={tooltipText}
    >
      {/* File Icon */}
      <span className="flex-shrink-0 text-blue-600 dark:text-blue-400">
        {isProcessing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          getFileIcon()
        )}
      </span>

      {/* File Name - Compact */}
      <span className={cn(
        "text-xs font-medium truncate max-w-[120px]",
        "text-blue-700 dark:text-blue-300",
        hasFailed && "text-red-700 dark:text-red-300"
      )}>
        {truncateFilename(file.filename)}
      </span>

      {/* Remove Button - Shows on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={cn(
          "flex-shrink-0 p-0.5 rounded-sm",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "hover:bg-blue-200 dark:hover:bg-blue-800",
          "focus:outline-none focus:opacity-100"
        )}
        title="Remove file"
      >
        <X className="w-3 h-3 text-blue-600 dark:text-blue-400" />
      </button>
    </div>
  );
}

interface FileContextDisplayProps {
  pageId: string;
  dataFiles: any[]; // Pass dataFiles as prop instead of calling hook again
  className?: string;
  maxVisibleFiles?: number;
  onFileRemove?: (fileId: string) => void;
}

export function FileContextDisplay({
  pageId,
  dataFiles,
  className,
  maxVisibleFiles = 5,
  onFileRemove
}: FileContextDisplayProps) {
  const { removeDataFile } = useChatDataFiles(pageId);
  const [expandedView, setExpandedView] = useState(false);

  // Use dataFiles from props
  const pageFiles = dataFiles || [];

  console.log('[FileContextDisplay] Component rendering:', {
    pageId,
    dataFilesLength: dataFiles?.length,
    pageFilesLength: pageFiles.length,
    files: pageFiles
  });

  if (pageFiles.length === 0) {
    console.log('[FileContextDisplay] No files, returning null');
    return null;
  }
  
  // Determine which files to show
  const visibleFiles = expandedView ? pageFiles : pageFiles.slice(0, maxVisibleFiles);
  const hiddenCount = pageFiles.length - visibleFiles.length;
  
  const handleFileRemove = (fileId: string) => {
    // Call parent handler if provided, otherwise use store method
    if (onFileRemove) {
      onFileRemove(fileId);
    } else {
      removeDataFile(fileId);
    }
  };
  
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 border-t border-gray-200 dark:border-gray-700",
      "bg-theme-bg-primary",
      className
    )}>
      {/* File Context Label - Compact */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Database className="w-3.5 h-3.5" />
        <span className="font-medium">Files:</span>
      </div>

      {/* File Chips Container - Horizontal Scroll */}
      <div className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {visibleFiles.map((file) => (
          <FileChip
            key={file.id}
            file={file}
            onRemove={() => handleFileRemove(file.id)}
          />
        ))}

        {/* Show More Button */}
        {hiddenCount > 0 && !expandedView && (
          <button
            onClick={() => setExpandedView(true)}
            className={cn(
              "inline-flex items-center gap-0.5 px-2 py-1 rounded-md",
              "text-xs text-gray-600 dark:text-gray-400 font-medium",
              "hover:bg-gray-100 dark:hover:bg-gray-800",
              "transition-colors whitespace-nowrap flex-shrink-0"
            )}
          >
            <span>+{hiddenCount}</span>
          </button>
        )}

        {/* Show Less Button */}
        {expandedView && pageFiles.length > maxVisibleFiles && (
          <button
            onClick={() => setExpandedView(false)}
            className={cn(
              "inline-flex items-center px-2 py-1 rounded-md",
              "text-xs text-gray-600 dark:text-gray-400",
              "hover:bg-gray-100 dark:hover:bg-gray-800",
              "transition-colors whitespace-nowrap flex-shrink-0"
            )}
          >
            <span>Less</span>
          </button>
        )}
      </div>
    </div>
  );
}