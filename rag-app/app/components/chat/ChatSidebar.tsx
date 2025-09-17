import { useState, useRef, useEffect } from 'react';
import { X, Send, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
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
  onSendMessage?: (message: string) => Promise<void>;
  onFileUpload?: (file: File) => Promise<void>;
  className?: string;
}

export function ChatSidebar({ 
  pageId, 
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]); // Only depend on length, not the array reference
  
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
    // Add placeholder file to store
    const tempFileId = `temp_${Date.now()}`;
    addDataFile({
      id: tempFileId,
      filename: file.name,
      tableName: file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_'),
      schema: { columns: [], rowCount: 0, sampleData: [] },
      rowCount: 0,
      sizeBytes: file.size,
      uploadedAt: new Date(),
    });
    
    // Add info message
    addMessage({
      role: 'system',
      content: `File "${file.name}" uploaded successfully. Processing...`,
    });
    
    // Call parent handler if provided
    if (onFileUpload) {
      setLoading(true);
      try {
        await onFileUpload(file);
        
        // After successful upload, load data into DuckDB
        const { getDuckDB } = await import('~/services/duckdb/duckdb-service.client');
        const duckdb = getDuckDB();
        
        // Initialize DuckDB if not already done
        if (!duckdb.isReady()) {
          await duckdb.initialize();
        }
        
        // Process the file based on type
        const { FileProcessingService } = await import('~/services/file-processing.client');
        const processed = await FileProcessingService.processFile(file);
        
        // Load data into DuckDB
        if (duckdb.isReady() && processed.data && processed.data.length > 0) {
          await duckdb.createTableFromData(
            processed.tableName,
            processed.data,
            processed.schema
          );
          
          // Update the file in store with proper data
          removeDataFile(tempFileId);
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
            content: `File "${file.name}" loaded into table "${processed.tableName}" with ${processed.data.length} rows.`,
          });
        }
      } catch (error) {
        console.error('Error uploading file:', error);
        removeDataFile(tempFileId);
        addMessage({
          role: 'assistant',
          content: `Failed to process file "${file.name}".`,
          metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
      } finally {
        setLoading(false);
      }
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
          disabled={isLoading}
          placeholder={dataFiles.length === 0 ? "Upload data first..." : "Ask a question about your data..."}
        />
      </div>
    </div>
  );
}