import { useState, useRef, useEffect } from 'react';
import { X, Send, Upload, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useFetcher } from '@remix-run/react';
import { useChatMessages, useChatDataFiles, useChatConnection } from '~/stores/chat-store-ultimate-fix';
import { useLayoutStore } from '~/stores/layout-store';
import { ResizeHandle } from '~/components/ui/ResizeHandle';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { FileUploadZone } from './FileUploadZone';
import { FileContextDisplay } from './FileContextDisplay';
import { cn } from '~/utils/cn';

interface ChatSidebarProps {
  pageId: string;
  workspaceId?: string;
  onSendMessage?: (message: string) => Promise<void>;
  onFileUpload?: (file: File) => Promise<void>;
  className?: string;
}

interface UploadProgress {
  filename: string;
  progress: number;
  status: 'requesting' | 'uploading' | 'confirming' | 'processing' | 'complete' | 'error';
  error?: string;
}

export function ChatSidebar({ 
  pageId, 
  workspaceId,
  onSendMessage,
  onFileUpload,
  className 
}: ChatSidebarProps) {
  const { messages, addMessage, clearMessages } = useChatMessages(pageId);
  const { dataFiles, addDataFile, removeDataFile } = useChatDataFiles(pageId);
  const { isLoading, setLoading, connectionStatus } = useChatConnection();
  const { 
    isChatSidebarOpen, 
    setChatSidebarOpen, 
    chatSidebarWidth, 
    setChatSidebarWidth 
  } = useLayoutStore();
  const fetcher = useFetcher();
  
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);
  
  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;
    
    // Add user message
    addMessage({
      role: 'user',
      content,
    });
    
    // Call parent handler if provided
    if (onSendMessage) {
      setLoading(true);
      try {
        await onSendMessage(content);
      } catch (error) {
        console.error('Error sending message:', error);
        addMessage({
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request.',
          metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
      } finally {
        setLoading(false);
      }
    }
  };
  
  const handleFileUpload = async (file: File) => {
    // Start upload progress tracking
    setUploadProgress({
      filename: file.name,
      progress: 0,
      status: 'requesting'
    });

    // Process file client-side for immediate use
    setLoading(true);
    try {
      // If workspaceId provided, upload to server for persistence
      if (workspaceId) {
        // Step 1: Request signed URL
        setUploadProgress(prev => prev ? { ...prev, status: 'requesting', progress: 10 } : null);
        
        const signedUrlResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'request-upload-url',
            workspaceId,
            pageId: pageId || null,
            filename: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            isShared: false
          }),
        });
        
        if (!signedUrlResponse.ok) {
          const error = await signedUrlResponse.json();
          throw new Error(error.error || 'Failed to get upload URL');
        }
        
        const { fileId, uploadUrl, storagePath, expiresIn } = await signedUrlResponse.json();
        
        // Step 2: Upload directly to Supabase Storage
        setUploadProgress(prev => prev ? { ...prev, status: 'uploading', progress: 30 } : null);
        
        const uploadRequest = new XMLHttpRequest();
        
        // Track upload progress
        uploadRequest.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 60) + 30; // 30-90%
            setUploadProgress(prev => prev ? { ...prev, progress: percentComplete } : null);
          }
        });
        
        // Create a promise for the upload
        const uploadPromise = new Promise<void>((resolve, reject) => {
          uploadRequest.addEventListener('load', () => {
            if (uploadRequest.status >= 200 && uploadRequest.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${uploadRequest.status}`));
            }
          });
          
          uploadRequest.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
          });
          
          uploadRequest.addEventListener('abort', () => {
            reject(new Error('Upload cancelled'));
          });
        });
        
        // Start the upload
        uploadRequest.open('PUT', uploadUrl);
        uploadRequest.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        uploadRequest.send(file);
        
        // Wait for upload to complete
        await uploadPromise;
        
        // Step 3: Confirm upload completion
        setUploadProgress(prev => prev ? { ...prev, status: 'confirming', progress: 95 } : null);
        
        const confirmResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'confirm-upload',
            fileId,
            storagePath,
            processImmediately: true
          }),
        });
        
        if (!confirmResponse.ok) {
          const error = await confirmResponse.json();
          throw new Error(error.error || 'Failed to confirm upload');
        }
        
        const result = await confirmResponse.json();
        console.log('File uploaded successfully:', result);
        
        // Update progress to complete
        setUploadProgress(prev => prev ? { ...prev, status: 'complete', progress: 100 } : null);
        
        // Add success message
        addMessage({
          role: 'system',
          content: `File "${file.name}" uploaded successfully. Processing in background...`,
        });
      } else {
        console.log('No workspace ID provided, using local-only storage');
        // Add info message for local-only processing
        addMessage({
          role: 'system',
          content: `File "${file.name}" will be processed locally for this session only.`,
        });
      }
      
      // Process file client-side for immediate use with DuckDB
      const { getDuckDB } = await import('~/services/duckdb/duckdb-service.client');
      const duckdb = getDuckDB();
      
      // Initialize DuckDB if not already done
      if (!duckdb.isReady()) {
        await duckdb.initialize();
      }
      
      // Process the file based on type
      const { FileProcessingService } = await import('~/services/file-processing.client');
      const processed = await FileProcessingService.processFile(file);
      
      // Load data into DuckDB for immediate querying
      if (duckdb.isReady() && processed.data && processed.data.length > 0) {
        await duckdb.createTableFromData(
          processed.tableName,
          processed.data,
          processed.schema
        );
        
        // Add the file to local store
        addDataFile({
          id: processed.tableName,
          filename: file.name,
          tableName: processed.tableName,
          schema: processed.schema,
          rowCount: processed.data.length,
          sizeBytes: file.size,
          uploadedAt: new Date(),
        });
        
        addMessage({
          role: 'system',
          content: `File "${file.name}" loaded with ${processed.data.length} rows. Ready for querying!`,
        });
      }
      
      // Clear upload progress after a delay
      setTimeout(() => setUploadProgress(null), 2000);
      
    } catch (error) {
      console.error('Error processing file:', error);
      setUploadProgress(prev => prev ? { 
        ...prev, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      } : null);
      
      addMessage({
        role: 'assistant',
        content: `Failed to upload file "${file.name}".`,
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      
      // Clear error after delay
      setTimeout(() => setUploadProgress(null), 5000);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx')) {
        await handleFileUpload(file);
      } else {
        addMessage({
          role: 'system',
          content: `File "${file.name}" is not supported. Please upload CSV or Excel files.`,
        });
      }
    }
  };
  
  if (!isChatSidebarOpen) {
    return (
      <button
        onClick={() => setChatSidebarOpen(true)}
        className="fixed right-4 bottom-4 bg-blue-600 text-white rounded-full p-3 shadow-lg hover:bg-blue-700 z-40 transition-colors"
        aria-label="Open chat sidebar"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
    );
  }
  
  return (
    <div 
      className={cn(
        "fixed right-0 top-0 h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl flex",
        "transition-transform duration-300 ease-in-out",
        isChatSidebarOpen ? "translate-x-0" : "translate-x-full",
        className
      )}
      style={{ width: `${chatSidebarWidth}px` }}
    >
      {/* Resize handle */}
      <ResizeHandle
        orientation="vertical"
        onResize={(delta) => setChatSidebarWidth(chatSidebarWidth - delta)}
        className="absolute left-0 top-0 h-full -translate-x-1/2 z-10"
      />
      
      {/* Sidebar content */}
      <div 
        className="flex-1 flex flex-col"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Data Chat</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {connectionStatus === 'connected' ? '🟢 Connected' : 
             connectionStatus === 'connecting' ? '🟡 Connecting...' : '🔴 Disconnected'}
          </p>
        </div>
        <button
          onClick={() => setChatSidebarOpen(false)}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          aria-label="Close sidebar"
        >
          <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
      </div>
      
      {/* File Context Display */}
      {dataFiles.length > 0 && (
        <FileContextDisplay 
          pageId={pageId}
          onFileClick={(fileId) => {
            // Handle file click - could open preview modal or show details
            console.log('File clicked:', fileId);
            addMessage({
              role: 'system',
              content: `Selected file: ${dataFiles.find(f => f.id === fileId)?.filename || fileId}`,
            });
          }}
          onFileRemove={(fileId) => {
            const file = dataFiles.find(f => f.id === fileId);
            if (file) {
              removeDataFile(fileId);
              addMessage({
                role: 'system',
                content: `Removed file: ${file.filename}`,
              });
            }
          }}
        />
      )}
      
      {/* Upload Progress */}
      {uploadProgress && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {uploadProgress.status === 'requesting' && 'Preparing upload...'}
              {uploadProgress.status === 'uploading' && `Uploading ${uploadProgress.filename}...`}
              {uploadProgress.status === 'confirming' && 'Confirming upload...'}
              {uploadProgress.status === 'processing' && 'Processing file...'}
              {uploadProgress.status === 'complete' && 'Upload complete!'}
              {uploadProgress.status === 'error' && `Error: ${uploadProgress.error}`}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {uploadProgress.progress}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
            <div 
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                uploadProgress.status === 'error' ? "bg-red-600" : 
                uploadProgress.status === 'complete' ? "bg-green-600" : "bg-blue-600"
              )}
              style={{ width: `${uploadProgress.progress}%` }}
            />
          </div>
        </div>
      )}
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-gray-900">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p className="text-sm">Upload CSV or Excel files to start analyzing</p>
            <p className="text-xs mt-2">Drag and drop or use the upload button below</p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-50 bg-opacity-90 flex items-center justify-center z-60">
          <div className="text-center">
            <Upload className="w-16 h-16 mx-auto mb-4 text-blue-500" />
            <p className="text-lg font-medium text-blue-700">Drop files here</p>
            <p className="text-sm text-blue-600 mt-1">CSV and Excel files supported</p>
          </div>
        </div>
      )}
      
        {/* File Upload Zone */}
        <FileUploadZone onFileUpload={handleFileUpload} />
      
        {/* Input */}
        <ChatInput 
          pageId={pageId}
          onSendMessage={handleSendMessage}
          disabled={isLoading || uploadProgress !== null}
          placeholder={dataFiles.length === 0 ? "Upload data first..." : "Ask a question about your data..."}
        />
      </div>
    </div>
  );
}