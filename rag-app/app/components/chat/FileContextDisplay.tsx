import { useState } from 'react';
import { X, FileText, FileSpreadsheet, File, ChevronRight, Database, Loader2, CloudIcon, CheckCircleIcon, CloudOff, CloudUpload } from 'lucide-react';
import { cn } from '~/utils/cn';
import { useChatDataFiles } from '~/stores/chat-store';
import type { FileSchema } from '~/services/file-processing.client';
import type { SyncStatus } from './CloudSyncIndicator';

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
        return <FileSpreadsheet className="w-4 h-4" />;
      case 'pdf':
        return <FileText className="w-4 h-4" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };
  
  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };
  
  // Truncate filename if too long
  const truncateFilename = (name: string, maxLength: number = 20) => {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop();
    const nameWithoutExt = name.substring(0, name.lastIndexOf('.'));
    const truncated = nameWithoutExt.substring(0, maxLength - 3 - (ext?.length || 0));
    return `${truncated}...${ext ? '.' + ext : ''}`;
  };
  
  const isPDF = file.filename.toLowerCase().endsWith('.pdf');
  const isProcessing = file.extractionStatus === 'processing';
  const hasFailed = file.extractionStatus === 'failed';
  
  // Determine sync status
  const getSyncStatus = (): SyncStatus => {
    if (file.syncStatus) return file.syncStatus;
    if (file.storageUrl || file.parquetUrl) return 'synced';
    return 'local-only';
  };
  
  const syncStatus = getSyncStatus();
  
  // Get sync icon
  const getSyncIcon = () => {
    switch (syncStatus) {
      case 'synced':
        return <CheckCircleIcon className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />;
      case 'syncing':
        return <CloudUpload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-pulse" />;
      case 'error':
        return <CloudOff className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />;
      case 'local-only':
        return <CloudOff className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />;
      default:
        return <CloudIcon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />;
    }
  };
  
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
        "border-2 transition-all duration-200 select-none",
        "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600",
        hasFailed && "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/30",
        "relative group"
      )}
      title={`${file.filename}\nSize: ${formatSize(file.sizeBytes)}${file.rowCount ? `\nRows: ${file.rowCount.toLocaleString()}` : ''}${isPDF && file.pageCount ? `\nPages: ${file.pageCount}` : ''}`}
    >
      {/* File Icon */}
      <span className="flex-shrink-0 text-gray-500 dark:text-gray-400">
        {isProcessing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          getFileIcon()
        )}
      </span>
      
      {/* File Name */}
      <span className={cn(
        "text-sm font-medium",
        "text-gray-700 dark:text-gray-300",
        hasFailed && "text-red-700 dark:text-red-300"
      )}>
        {truncateFilename(file.filename)}
      </span>
      
      {/* File Size/Info Badge */}
      <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
        {formatSize(file.sizeBytes)}
      </span>
      
      {/* Row/Page Count Badge */}
      {(file.rowCount || file.pageCount) && (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
          {file.rowCount ? `${file.rowCount.toLocaleString()} rows` : `${file.pageCount} pages`}
        </span>
      )}
      
      {/* Sync Status Icon */}
      <span className="flex-shrink-0" title={syncStatus === 'synced' ? 'Synced to cloud' : syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'error' ? 'Sync error' : 'Local only'}>
        {getSyncIcon()}
      </span>
      
      {/* Remove Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={cn(
          "flex-shrink-0 ml-1 -mr-1 p-1 rounded-full",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "hover:bg-gray-200 dark:hover:bg-gray-600",
          "focus:outline-none focus:ring-2 focus:ring-blue-500"
        )}
        title="Remove file"
      >
        <X className="w-3 h-3 text-gray-500 dark:text-gray-400" />
      </button>
    </div>
  );
}

interface FileContextDisplayProps {
  pageId: string;
  className?: string;
  maxVisibleFiles?: number;
  onFileRemove?: (fileId: string) => void;
}

export function FileContextDisplay({ 
  pageId, 
  className,
  maxVisibleFiles = 5,
  onFileRemove
}: FileContextDisplayProps) {
  const { dataFiles, removeDataFile } = useChatDataFiles(pageId);
  const [expandedView, setExpandedView] = useState(false);
  
  // Use dataFiles directly from the hook
  const pageFiles = dataFiles || [];
  
  if (pageFiles.length === 0) {
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
      "flex items-center gap-2 p-3",
      "bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700",
      className
    )}>
      {/* File Context Label */}
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mr-2">
        <Database className="w-4 h-4" />
        <span className="font-medium">Context:</span>
      </div>
      
      {/* File Chips Container */}
      <div className="flex-1 flex items-center gap-2 flex-wrap">
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
              "inline-flex items-center gap-1 px-3 py-1.5",
              "text-sm text-blue-600 dark:text-blue-400",
              "hover:text-blue-700 dark:hover:text-blue-300",
              "transition-colors"
            )}
          >
            <span>+{hiddenCount} more</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
        
        {/* Show Less Button */}
        {expandedView && pageFiles.length > maxVisibleFiles && (
          <button
            onClick={() => setExpandedView(false)}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5",
              "text-sm text-gray-600 dark:text-gray-400",
              "hover:text-gray-700 dark:hover:text-gray-300",
              "transition-colors"
            )}
          >
            <span>Show less</span>
          </button>
        )}
      </div>
    </div>
  );
}