import React, { memo, useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useChatMessagesOptimized,
  useChatDataFilesOptimized,
  useChatLoadingOptimized,
} from '~/hooks/use-chat-atoms-optimized';
import { useLayoutStore } from '~/stores/layout-store';
import { ResizeHandle } from '~/components/ui/ResizeHandle';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { FileContextDisplay } from './FileContextDisplay';
import { cn } from '~/utils/cn';
import { QueryAnalyzer } from '~/services/query-analyzer.client';
import { DuckDBQueryService } from '~/services/duckdb/duckdb-query.client';
import type { DataFile } from '~/atoms/chat-atoms-optimized';

/**
 * Helper function to handle Server-Sent Events streaming from API
 */
async function handleStreamingResponse(
  url: string,
  body: any,
  onToken: (token: string) => void,
  onMetadata: (metadata: any) => void,
  onDone: () => void,
  onError: (error: Error) => void
) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (!response.ok || !response.body) {
      throw new Error('Failed to get streaming response');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          const eventMatch = line.match(/event: (\w+)\ndata: (.+)/s);
          if (eventMatch) {
            const [, event, data] = eventMatch;
            const parsedData = JSON.parse(data);

            switch (event) {
              case 'token':
                onToken(parsedData.content || '');
                break;
              case 'metadata':
                onMetadata(parsedData.metadata || {});
                break;
              case 'done':
                onDone();
                return;
              case 'error':
                onError(new Error(parsedData.error || 'Stream error'));
                return;
            }
          }
        }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Unknown streaming error'));
  }
}

// ============= MEMOIZED SUB-COMPONENTS =============

/**
 * Memoized header component - only re-renders when sidebar state changes
 */
const ChatHeader = memo(({ onClose }: { onClose: () => void }) => {
  console.log('[ChatHeader] Rendering');
  return (
    <div className="flex items-center justify-between p-4 border-b border-theme-border-primary bg-theme-bg-primary">
      <div>
        <h2 className="text-lg font-semibold text-theme-text-primary">Data Chat</h2>
      </div>
      <button
        onClick={onClose}
        className="p-1 hover:bg-theme-hover rounded-lg transition-colors"
        aria-label="Close sidebar"
      >
        <ChevronRight className="w-5 h-5 text-theme-text-secondary" />
      </button>
    </div>
  );
});
ChatHeader.displayName = 'ChatHeader';

/**
 * Memoized message list - only re-renders when messages change
 */
const MessageList = memo(({ 
  messages, 
  onClarificationResponse,
  onFileSelect 
}: { 
  messages: any[];
  onClarificationResponse?: (action: string, data?: any) => void;
  onFileSelect?: (file: DataFile) => void;
}) => {
  console.log('[MessageList] Rendering with', messages.length, 'messages');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);
  
  if (messages.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p className="text-sm">Upload CSV or Excel files to start analyzing</p>
        <p className="text-xs mt-2">Click the + button or drag and drop files here</p>
      </div>
    );
  }
  
  return (
    <>
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          onClarificationResponse={onClarificationResponse}
          onFileSelect={onFileSelect}
        />
      ))}
      <div ref={messagesEndRef} />
    </>
  );
});
MessageList.displayName = 'MessageList';

/**
 * Memoized upload progress component
 */
const UploadProgressBar = memo(({ 
  filename, 
  progress, 
  status, 
  error 
}: {
  filename: string;
  progress: number;
  status: string;
  error?: string;
}) => {
  console.log('[UploadProgressBar] Rendering');
  return (
    <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-theme-border-primary">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-theme-text-primary">
          {status === 'uploading' && `Uploading ${filename}...`}
          {status === 'complete' && 'Upload complete!'}
          {status === 'error' && `Error: ${error}`}
        </span>
        <span className="text-xs text-theme-text-secondary">
          {progress}%
        </span>
      </div>
      <div className="w-full bg-theme-bg-secondary rounded-full h-2">
        <div 
          className={cn(
            "h-2 rounded-full transition-all duration-300",
            status === 'error' ? "bg-red-600" : 
            status === 'complete' ? "bg-green-600" : "bg-blue-600"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
});
UploadProgressBar.displayName = 'UploadProgressBar';

/**
 * Memoized drag overlay component
 */
const DragOverlay = memo(() => {
  console.log('[DragOverlay] Rendering');
  return (
    <div className="absolute inset-0 bg-blue-50 dark:bg-blue-900/20 bg-opacity-90 flex items-center justify-center z-60">
      <div className="text-center">
        <Upload className="w-16 h-16 mx-auto mb-4 text-blue-500" />
        <p className="text-lg font-medium text-blue-700 dark:text-blue-300">Drop files here</p>
        <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">CSV, Excel, and PDF files supported</p>
      </div>
    </div>
  );
});
DragOverlay.displayName = 'DragOverlay';

// ============= MAIN COMPONENT =============

interface ChatSidebarPerformantProps {
  pageId: string;
  workspaceId?: string;
  className?: string;
}

function ChatSidebarPerformantBase({ 
  pageId, 
  workspaceId,
  className 
}: ChatSidebarPerformantProps) {
  console.log('[ChatSidebarPerformant] Main component rendering');
  
  // Use optimized hooks
  const { messages, addMessage, batchAddMessages, clearMessages } = useChatMessagesOptimized(pageId);
  const { dataFiles, addDataFile, removeDataFile, setDataFiles } = useChatDataFilesOptimized(pageId);
  const { isLoading, setLoading } = useChatLoadingOptimized(pageId);
  const { 
    isChatSidebarOpen, 
    setChatSidebarOpen, 
    chatSidebarWidth, 
    setChatSidebarWidth 
  } = useLayoutStore();
  
  // Local state for UI-only concerns
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    filename: string;
    progress: number;
    status: string;
    error?: string;
  } | null>(null);
  
  // Refs for stable references
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const dataFilesRef = useRef(dataFiles);
  const messagesRef = useRef(messages);
  
  // Keep refs updated
  useEffect(() => {
    dataFilesRef.current = dataFiles;
  }, [dataFiles]);
  
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  // Track render count for debugging
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  console.log('[ChatSidebarPerformant] Render count:', renderCountRef.current);
  
  // Memoized query analyzer to prevent recreation
  const queryAnalyzer = useMemo(() => QueryAnalyzer, []);
  
  // ============= CALLBACKS =============
  
  /**
   * Handle closing the sidebar
   */
  const handleClose = useCallback(() => {
    setChatSidebarOpen(false);
  }, [setChatSidebarOpen]);
  
  /**
   * Handle sending a message - memoized to prevent recreation
   */
  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    
    // Add user message
    addMessage({
      role: 'user',
      content,
    });
    
    // Save to database
    try {
      await fetch(`/api/chat/messages/${pageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'user',
          content,
        }),
      });
    } catch (error) {
      console.error('Failed to save user message:', error);
    }
    
    // Analyze query intent
    const analysis = queryAnalyzer.analyzeQuery(content, dataFilesRef.current);
    console.log('[ChatSidebarPerformant] Query analysis:', analysis);
    
    // Process based on intent
    if (analysis.intent === 'query-data' && dataFilesRef.current.length > 0) {
      await processDataQuery(content);
    } else {
      await processGeneralQuery(content);
    }
  }, [pageId, addMessage, queryAnalyzer]);
  
  /**
   * Process data query with query-first approach - memoized
   *
   * NEW FLOW (Task 61.1):
   * 1. Execute SQL query locally in DuckDB
   * 2. Get query results (top 20 rows)
   * 3. Send only results to AI (not full dataset)
   * 4. AI analyzes actual data instead of metadata
   */
  const processDataQuery = useCallback(async (query: string) => {
    setLoading(true);

    try {
      const duckdbService = DuckDBQueryService.getInstance();

      // Check if we have structured data files (CSV/Excel)
      const structuredFiles = dataFilesRef.current.filter(
        f => f.type === 'csv' || f.type === 'excel'
      );

      // QUERY-FIRST APPROACH: Execute SQL locally first if we have structured data
      if (structuredFiles.length > 0) {
        console.error('[Query-First] ⚠️ ATTEMPTING LOCAL DUCKDB QUERY', {
          structuredFilesCount: structuredFiles.length,
          files: structuredFiles.map(f => ({
            filename: f.filename,
            type: f.type,
            tableName: f.tableName,
            rowCount: f.rowCount,
            hasSchema: !!f.schema
          })),
          query
        });

        try {
          // Process natural language → SQL → Results
          const queryResult = await duckdbService.processNaturalLanguageQuery(
            query,
            dataFilesRef.current,
            pageId,
            workspaceId
          );

          console.error('[Query-First] ✅ QUERY EXECUTED SUCCESSFULLY', {
            rowCount: queryResult.rowCount,
            executionTime: queryResult.executionTime,
            sql: queryResult.sql,
            columnsCount: queryResult.columns?.length || 0,
            dataRows: queryResult.data?.length || 0,
            firstRow: queryResult.data?.[0]
          });

          // Send query RESULTS to AI with STREAMING for immediate feedback
          let streamedContent = '';
          let metadata: any = {};

          // Add placeholder message for streaming
          addMessage({
            role: 'assistant',
            content: '',
            metadata: { streaming: true },
          });

          await handleStreamingResponse(
            '/api/chat-query',
            {
              query,
              pageId,
              workspaceId,
              // NEW: Send query results instead of full files
              queryResults: {
                data: queryResult.data?.slice(0, 20) || [], // Top 20 rows only
                sql: queryResult.sql,
                columns: queryResult.columns,
                rowCount: queryResult.rowCount,
                executionTime: queryResult.executionTime,
              },
              // Include file metadata for context
              fileMetadata: dataFilesRef.current.map(f => ({
                filename: f.filename,
                type: f.type,
                rowCount: f.rowCount,
                schema: f.schema,
              })),
              conversationHistory: Array.isArray(messagesRef.current) ? messagesRef.current.slice(-10) : [],
            },
            // onToken: Append content as it streams
            (token) => {
              streamedContent += token;
              // Update last message with accumulated content
              const currentMessages = messagesRef.current;
              if (currentMessages.length > 0) {
                const lastMessage = currentMessages[currentMessages.length - 1];
                if (lastMessage.role === 'assistant') {
                  addMessage({
                    role: 'assistant',
                    content: streamedContent,
                    metadata: { ...lastMessage.metadata, streaming: true },
                  });
                }
              }
            },
            // onMetadata: Save metadata for final message
            (meta) => {
              metadata = meta;
            },
            // onDone: Finalize message with complete content
            () => {
              addMessage({
                role: 'assistant',
                content: streamedContent,
                metadata: {
                  ...metadata,
                  queryFirst: true,
                  sql: queryResult.sql,
                  rowsAnalyzed: queryResult.data?.slice(0, 20).length || 0,
                  totalRows: queryResult.rowCount,
                  executionTime: queryResult.executionTime,
                  streaming: false,
                },
              });
            },
            // onError: Fall back to traditional approach
            (error) => {
              console.error('[Streaming] Error, falling back:', error);
              throw error;
            }
          );

          // Save assistant message
          await fetch(`/api/chat/messages/${pageId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'assistant',
              content: result.content,
              metadata: {
                ...result.metadata,
                sql: queryResult.sql,
              },
            }),
          });

          return; // Success - exit early

        } catch (queryError) {
          console.error('[Query-First] ❌ QUERY FAILED - FALLING BACK TO TRADITIONAL', {
            error: queryError instanceof Error ? queryError.message : String(queryError),
            errorStack: queryError instanceof Error ? queryError.stack : undefined,
            errorType: queryError instanceof Error ? queryError.constructor.name : typeof queryError
          });
        }
      }

      // FALLBACK: Traditional approach for non-structured files or if query-first fails
      console.error('[Traditional] ⚠️ USING TRADITIONAL FILE-BASED APPROACH', {
        reason: structuredFiles.length === 0 ? 'No structured files' : 'Query-first failed',
        filesCount: dataFilesRef.current.length,
        files: dataFilesRef.current.map(f => ({
          filename: f.filename,
          type: f.type,
          hasData: !!f.data,
          dataLength: Array.isArray(f.data) ? f.data.length : 0,
          hasContent: !!f.content,
          contentLength: typeof f.content === 'string' ? f.content.length :
                        Array.isArray(f.content) ? f.content.length : 0,
          hasParquetUrl: !!f.parquetUrl
        }))
      });

      const response = await fetch('/api/chat-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          pageId,
          workspaceId,
          files: dataFilesRef.current,
          conversationHistory: Array.isArray(messagesRef.current) ? messagesRef.current.slice(-10) : [],
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const result = await response.json();

      // Add assistant response
      addMessage({
        role: 'assistant',
        content: result.content,
        metadata: result.metadata,
      });

      // Save assistant message
      await fetch(`/api/chat/messages/${pageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: result.content,
          metadata: result.metadata,
        }),
      });
    } catch (error) {
      console.error('Failed to process query:', error);
      addMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request.',
      });
    } finally {
      setLoading(false);
    }
  }, [pageId, workspaceId, addMessage, setLoading]);
  
  /**
   * Process general query - memoized
   */
  const processGeneralQuery = useCallback(async (query: string) => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/chat-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          pageId,
          workspaceId,
          files: [],
        }),
      });
      
      if (!response.ok) throw new Error('Failed to get response');
      
      const result = await response.json();
      
      addMessage({
        role: 'assistant',
        content: result.content,
        metadata: result.metadata,
      });
      
      await fetch(`/api/chat/messages/${pageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: result.content,
          metadata: result.metadata,
        }),
      });
    } catch (error) {
      console.error('Failed to process query:', error);
      addMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error.',
      });
    } finally {
      setLoading(false);
    }
  }, [pageId, workspaceId, addMessage, setLoading]);
  
  /**
   * Handle file upload - memoized
   */
  const handleFileUpload = useCallback(async (file: File) => {
    console.log('[ChatSidebarPerformant] File upload:', file.name);
    
    setUploadProgress({
      filename: file.name,
      progress: 0,
      status: 'uploading',
    });
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // CRITICAL FIX: Add pageId and workspaceId to FormData
      const params = new URLSearchParams({
        pageId: pageId,
        ...(workspaceId && { workspaceId }),
      });
      
      const response = await fetch(`/api/data/upload/v2?${params}`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');

      const result = await response.json();

      if (result.success && result.files?.[0]) {
        const uploadedFile = result.files[0];

        // Check if the file upload had an error
        if (uploadedFile.error) {
          setUploadProgress({
            filename: file.name,
            progress: 0,
            status: 'error',
            error: uploadedFile.error,
          });

          addMessage({
            role: 'system',
            content: `Failed to upload "${file.name}": ${uploadedFile.error}`,
          });

          setTimeout(() => setUploadProgress(null), 3000);
          return;
        }

        // Add file to state (including parquetUrl for server-side data fetching)
        addDataFile({
          databaseId: uploadedFile.id,
          filename: uploadedFile.filename,
          tableName: uploadedFile.tableName,
          schema: uploadedFile.schema || [],
          rowCount: uploadedFile.rowCount || 0,
          sizeBytes: file.size,
          parquetUrl: uploadedFile.parquetUrl, // CRITICAL: Enables server to fetch actual data
        });

        setUploadProgress({
          filename: file.name,
          progress: 100,
          status: 'complete',
        });

        addMessage({
          role: 'system',
          content: `File "${file.name}" uploaded successfully!`,
        });
      }

      setTimeout(() => setUploadProgress(null), 2000);
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadProgress({
        filename: file.name,
        progress: 0,
        status: 'error',
        error: 'Upload failed',
      });
      setTimeout(() => setUploadProgress(null), 3000);
    }
  }, [pageId, workspaceId, addDataFile, addMessage]);
  
  /**
   * Handle file removal - memoized
   */
  const handleFileRemove = useCallback(async (fileId: string) => {
    const file = dataFiles.find(f => f.id === fileId);
    if (!file) return;
    
    // Remove from local state
    removeDataFile(fileId);
    
    // Remove from database if needed
    if (workspaceId && file.databaseId) {
      try {
        await fetch(`/api/data/files/${pageId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: file.databaseId }),
        });
      } catch (error) {
        console.error('Failed to delete file:', error);
      }
    }
    
    addMessage({
      role: 'system',
      content: `Removed file: ${file.filename}`,
    });
  }, [pageId, workspaceId, dataFiles, removeDataFile, addMessage]);
  
  /**
   * Drag and drop handlers - memoized
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (file.name.match(/\.(csv|xlsx?)$/i)) {
        await handleFileUpload(file);
      } else {
        addMessage({
          role: 'system',
          content: `File "${file.name}" is not supported. Please upload CSV or Excel files.`,
        });
      }
    }
  }, [handleFileUpload, addMessage]);
  
  // ============= EFFECTS =============
  
  // Load chat messages on mount
  useEffect(() => {
    let isMounted = true;
    
    const loadMessages = async () => {
      try {
        const response = await fetch(`/api/chat/messages/${pageId}`);
        if (!response.ok || !isMounted) return;
        
        const data = await response.json();
        if (data.messages?.length > 0) {
          batchAddMessages(data.messages);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };
    
    loadMessages();
    
    return () => {
      isMounted = false;
    };
  }, [pageId, batchAddMessages]); // Include stable batchAddMessages callback
  
  // Load files on mount
  useEffect(() => {
    let isMounted = true;
    
    const loadFiles = async () => {
      try {
        const response = await fetch(`/api/data/files/${pageId}`);
        if (!response.ok || !isMounted) return;
        
        const data = await response.json();
        if (data.files?.length > 0) {
          setDataFiles(data.files);
        }
      } catch (error) {
        console.error('Failed to load files:', error);
      }
    };
    
    loadFiles();
    
    return () => {
      isMounted = false;
    };
  }, [pageId, setDataFiles]); // Include stable setDataFiles callback
  
  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // ============= RENDER =============
  
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
        "fixed right-0 top-0 h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex",
        "transition-transform duration-300 ease-in-out",
        isChatSidebarOpen ? "translate-x-0" : "translate-x-full",
        className
      )}
      style={{ width: `${chatSidebarWidth}px` }}
    >
      {/* Resize handle */}
      <ResizeHandle
        orientation="vertical"
        onResize={(delta) => setChatSidebarWidth(Math.max(320, Math.min(600, chatSidebarWidth - delta)))}
        className="absolute left-0 top-0 h-full -translate-x-1/2 z-10"
      />
      
      {/* Sidebar content */}
      <div 
        className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden w-full"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header */}
        <ChatHeader onClose={handleClose} />
        
        {/* File Context Display */}
        {dataFiles.length > 0 && (
          <FileContextDisplay 
            pageId={pageId}
            onFileRemove={handleFileRemove}
          />
        )}
        
        {/* Upload Progress */}
        {uploadProgress && (
          <UploadProgressBar
            filename={uploadProgress.filename}
            progress={uploadProgress.progress}
            status={uploadProgress.status}
            error={uploadProgress.error}
          />
        )}
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 bg-white dark:bg-gray-900">
          <MessageList 
            messages={messages}
            onClarificationResponse={undefined}
            onFileSelect={undefined}
          />
        </div>
        
        {/* Drag Overlay */}
        {isDragging && <DragOverlay />}
        
        {/* Input */}
        <ChatInput 
          pageId={pageId}
          onSendMessage={handleSendMessage}
          onFileUpload={handleFileUpload}
          disabled={isLoading || uploadProgress !== null}
          placeholder={dataFiles.length === 0 ? "Upload data first..." : "Ask a question about your data..."}
        />
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".csv,.xlsx,.xls"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          files.forEach(handleFileUpload);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// Export memoized version with custom comparison
export const ChatSidebarPerformant = memo(ChatSidebarPerformantBase, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.pageId === nextProps.pageId &&
    prevProps.workspaceId === nextProps.workspaceId &&
    prevProps.className === nextProps.className
  );
});