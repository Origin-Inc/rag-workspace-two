import { useState, useRef, useEffect } from 'react';
import { X, Send, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFetcher } from '@remix-run/react';
import { useChatMessages, useChatDataFiles, useChatSidebar, useChatConnection } from '~/stores/chat-store';
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

export function ChatSidebar({ 
  pageId, 
  onSendMessage,
  onFileUpload,
  className 
}: ChatSidebarProps) {
  const { messages, addMessage, clearMessages } = useChatMessages(pageId);
  const { dataFiles, addDataFile, removeDataFile } = useChatDataFiles(pageId);
  const { isSidebarOpen, setSidebarOpen } = useChatSidebar();
  const { isLoading, setLoading, connectionStatus } = useChatConnection();
  const fetcher = useFetcher();
  
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
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
    // Add file to store
    addDataFile({
      filename: file.name,
      tableName: file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_'),
      schema: [],
      rowCount: 0,
      sizeBytes: file.size,
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
  
  if (!isSidebarOpen) {
    return (
      <button
        onClick={() => setSidebarOpen(true)}
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
          onClick={() => setSidebarOpen(false)}
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
        onSendMessage={handleSendMessage}
        disabled={isLoading}
        placeholder={dataFiles.length === 0 ? "Upload data first..." : "Ask a question about your data..."}
      />
    </div>
  );
}