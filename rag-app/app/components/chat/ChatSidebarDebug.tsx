import { useState, useRef, useEffect } from 'react';
import { X, Send, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFetcher } from '@remix-run/react';
import { useChatMessages, useChatDataFiles, useChatSidebar, useChatConnection } from '~/stores/chat-store-fixed';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { FileUploadZone } from './FileUploadZone';
import { cn } from '~/utils/cn';

interface ChatSidebarProps {
  pageId: string;
  onSendMessage?: (message: string) => Promise<void>;
  onFileUpload?: (file: File) => Promise<void>;
  className?: string;
}

// Debug version with extensive logging
export function ChatSidebar({ 
  pageId, 
  onSendMessage,
  onFileUpload,
  className 
}: ChatSidebarProps) {
  console.log('[ChatSidebar] Render start', { pageId, timestamp: Date.now() });
  
  // Track render count
  const renderCount = useRef(0);
  renderCount.current++;
  console.log('[ChatSidebar] Render count:', renderCount.current);
  
  // Log hook calls
  console.log('[ChatSidebar] Calling useChatMessages hook');
  const { messages, addMessage, clearMessages } = useChatMessages(pageId);
  console.log('[ChatSidebar] Messages from hook:', messages.length);
  
  console.log('[ChatSidebar] Calling useChatDataFiles hook');
  const { dataFiles, addDataFile, removeDataFile } = useChatDataFiles(pageId);
  console.log('[ChatSidebar] DataFiles from hook:', dataFiles.length);
  
  console.log('[ChatSidebar] Calling useChatSidebar hook');
  const { isSidebarOpen, setSidebarOpen } = useChatSidebar();
  console.log('[ChatSidebar] Sidebar open:', isSidebarOpen);
  
  console.log('[ChatSidebar] Calling useChatConnection hook');
  const { isLoading, setLoading, connectionStatus } = useChatConnection();
  console.log('[ChatSidebar] Connection status:', connectionStatus);
  
  const fetcher = useFetcher();
  
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Log effect execution
  useEffect(() => {
    console.log('[ChatSidebar] useEffect for auto-scroll triggered, messages.length:', messages.length);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    return () => {
      console.log('[ChatSidebar] useEffect cleanup');
    };
  }, [messages.length]);
  
  // Monitor for rapid re-renders
  useEffect(() => {
    const timer = setTimeout(() => {
      if (renderCount.current > 50) {
        console.error('[ChatSidebar] CRITICAL: Too many renders!', renderCount.current);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);
  
  const handleSendMessage = async (content: string) => {
    console.log('[ChatSidebar] handleSendMessage called');
    if (!content.trim()) return;
    
    addMessage({
      role: 'user',
      content,
    });
    
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
    console.log('[ChatSidebar] handleFileUpload called');
    addDataFile({
      filename: file.name,
      tableName: file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_'),
      schema: [],
      rowCount: 0,
      sizeBytes: file.size,
    });
    
    addMessage({
      role: 'system',
      content: `File "${file.name}" uploaded successfully. Processing...`,
    });
    
    if (onFileUpload) {
      setLoading(true);
      try {
        await onFileUpload(file);
      } catch (error) {
        console.error('Error uploading file:', error);
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
  
  console.log('[ChatSidebar] Rendering toggle button or sidebar');
  
  if (!isSidebarOpen) {
    return (
      <button
        onClick={() => {
          console.log('[ChatSidebar] Toggle button clicked - opening');
          setSidebarOpen(true);
        }}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-white border-l border-gray-200 rounded-l-lg p-2 shadow-lg hover:bg-gray-50 z-40"
        aria-label="Open chat sidebar"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
    );
  }
  
  return (
    <div 
      className={cn(
        "fixed right-0 top-0 h-full bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col",
        "w-full sm:w-[30%] lg:w-[30%]",
        "transition-transform duration-300 ease-in-out",
        isSidebarOpen ? "translate-x-0" : "translate-x-full",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Data Chat</h2>
          <p className="text-xs text-gray-500">
            {connectionStatus === 'connected' ? '🟢 Connected' : 
             connectionStatus === 'connecting' ? '🟡 Connecting...' : '🔴 Disconnected'}
          </p>
        </div>
        <button
          onClick={() => {
            console.log('[ChatSidebar] Close button clicked');
            setSidebarOpen(false);
          }}
          className="p-1 hover:bg-gray-100 rounded-lg"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      {/* Data Files */}
      {dataFiles.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
          <p className="text-xs font-medium text-gray-600 mb-1">Uploaded Files:</p>
          <div className="space-y-1">
            {dataFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between text-xs">
                <span className="truncate">{file.filename}</span>
                <button
                  onClick={() => removeDataFile(file.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
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
      
      {/* File Upload Zone */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-50 bg-opacity-90 flex items-center justify-center z-60">
          <div className="text-center">
            <Upload className="w-16 h-16 mx-auto text-blue-500 mb-4" />
            <p className="text-lg font-medium text-blue-700">Drop files here</p>
            <p className="text-sm text-blue-600 mt-2">CSV and Excel files only</p>
          </div>
        </div>
      )}
      
      {/* Input Area */}
      <div className="border-t border-gray-200 p-4 space-y-3">
        <FileUploadZone onFileUpload={handleFileUpload} />
        <ChatInput 
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder="Ask about your data..."
        />
      </div>
    </div>
  );
}