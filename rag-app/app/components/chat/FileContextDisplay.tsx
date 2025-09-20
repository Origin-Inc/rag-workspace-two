import { useState } from 'react';
import { X, FileText, FileSpreadsheet, File, ChevronRight, Database, Eye, Loader2 } from 'lucide-react';
import { cn } from '~/utils/cn';
import { useChatDataFiles } from '~/stores/chat-store';
import type { FileSchema } from '~/services/file-processing.client';

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
  };
  isActive?: boolean;
  onClick: () => void;
  onRemove: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

function FileChip({ 
  file, 
  isActive = false, 
  onClick, 
  onRemove,
  onDragStart,
  onDragEnd 
}: FileChipProps) {
  const [isHovered, setIsHovered] = useState(false);
  
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
  
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
        "border-2 transition-all duration-200 cursor-pointer select-none",
        isActive ? (
          "bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600"
        ) : (
          "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600",
          "hover:border-blue-300 dark:hover:border-blue-700",
          "hover:bg-gray-50 dark:hover:bg-gray-700"
        ),
        hasFailed && "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/30",
        "relative group"
      )}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={`${file.filename}\nSize: ${formatSize(file.sizeBytes)}${file.rowCount ? `\nRows: ${file.rowCount.toLocaleString()}` : ''}${isPDF && file.pageCount ? `\nPages: ${file.pageCount}` : ''}`}
    >
      {/* File Icon */}
      <span className={cn(
        "flex-shrink-0",
        isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
      )}>
        {isProcessing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          getFileIcon()
        )}
      </span>
      
      {/* File Name */}
      <span className={cn(
        "text-sm font-medium",
        isActive ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300",
        hasFailed && "text-red-700 dark:text-red-300"
      )}>
        {truncateFilename(file.filename)}
      </span>
      
      {/* File Size/Info Badge */}
      <span className={cn(
        "text-xs px-1.5 py-0.5 rounded-full",
        isActive ? (
          "bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300"
        ) : (
          "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
        )
      )}>
        {formatSize(file.sizeBytes)}
      </span>
      
      {/* Row/Page Count Badge */}
      {(file.rowCount || file.pageCount) && (
        <span className={cn(
          "text-xs px-1.5 py-0.5 rounded-full",
          isActive ? (
            "bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300"
          ) : (
            "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
          )
        )}>
          {file.rowCount ? `${file.rowCount.toLocaleString()} rows` : `${file.pageCount} pages`}
        </span>
      )}
      
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
      
      {/* Active Indicator */}
      {isActive && (
        <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
      )}
    </div>
  );
}

interface FileContextDisplayProps {
  pageId: string;
  className?: string;
  maxVisibleFiles?: number;
  onFileClick?: (fileId: string) => void;
  onFileRemove?: (fileId: string) => void;
}

export function FileContextDisplay({ 
  pageId, 
  className,
  maxVisibleFiles = 5,
  onFileClick,
  onFileRemove
}: FileContextDisplayProps) {
  const { dataFiles, removeDataFile } = useChatDataFiles(pageId);
  const [expandedView, setExpandedView] = useState(false);
  const [activeFiles, setActiveFiles] = useState<Set<string>>(new Set());
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  
  // Use dataFiles directly from the hook
  const pageFiles = dataFiles || [];
  
  if (pageFiles.length === 0) {
    return null;
  }
  
  // Determine which files to show
  const visibleFiles = expandedView ? pageFiles : pageFiles.slice(0, maxVisibleFiles);
  const hiddenCount = pageFiles.length - visibleFiles.length;
  
  const handleFileClick = (fileId: string) => {
    // Toggle active state
    setActiveFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
    
    onFileClick?.(fileId);
  };
  
  const handleFileRemove = (fileId: string) => {
    // Call parent handler if provided, otherwise use store method
    if (onFileRemove) {
      onFileRemove(fileId);
    } else {
      removeDataFile(fileId);
    }
    
    setActiveFiles(prev => {
      const next = new Set(prev);
      next.delete(fileId);
      return next;
    });
  };
  
  const handleDragStart = (e: React.DragEvent, fileId: string) => {
    setDraggedFile(fileId);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragEnd = () => {
    setDraggedFile(null);
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  
  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!draggedFile) return;
    
    // Reorder files (would need to implement reordering in store)
    // For now, just visual feedback
    console.log(`Reorder file ${draggedFile} to position ${targetIndex}`);
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
      <div 
        className="flex-1 flex items-center gap-2 flex-wrap"
        onDragOver={handleDragOver}
      >
        {visibleFiles.map((file, index) => (
          <div
            key={file.id}
            onDrop={(e) => handleDrop(e, index)}
          >
            <FileChip
              file={file}
              isActive={activeFiles.has(file.id)}
              onClick={() => handleFileClick(file.id)}
              onRemove={() => handleFileRemove(file.id)}
              onDragStart={(e) => handleDragStart(e, file.id)}
              onDragEnd={handleDragEnd}
            />
          </div>
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
      
      {/* View Details Button */}
      {activeFiles.size > 0 && (
        <button
          className={cn(
            "flex items-center gap-1 px-3 py-1.5",
            "text-sm font-medium text-blue-600 dark:text-blue-400",
            "hover:text-blue-700 dark:hover:text-blue-300",
            "transition-colors"
          )}
          title="View selected file details"
        >
          <Eye className="w-4 h-4" />
          <span>Details</span>
        </button>
      )}
    </div>
  );
}