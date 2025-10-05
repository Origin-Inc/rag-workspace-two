import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { useChatMessages, useChatDataFiles, useChatState } from '~/hooks/use-chat-atoms';
import { useLayoutStore } from '~/stores/layout-store';
import { ResizeHandle } from '~/components/ui/ResizeHandle';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { FileContextDisplay } from './FileContextDisplay';
import { cn } from '~/utils/cn';
import { duckDBQuery } from '~/services/duckdb/duckdb-query.client';
import { tokenMonitor } from '~/services/token-usage-monitor.client';
import { FuzzyFileMatcherClient } from '~/services/fuzzy-file-matcher.client';
import { FileDisambiguationDialog } from './FileDisambiguationDialog';
import { SmartClarificationPrompt } from './SmartClarificationPrompt';
import type { FileMatchResult } from '~/services/fuzzy-file-matcher.client';
import type { DataFile } from '~/atoms/chat-atoms';
import { QueryAnalyzer } from '~/services/query-analyzer.client';

// Memoized message list component to prevent unnecessary re-renders
const MessageList = memo(({ messages }: { messages: any[] }) => {
  return (
    <>
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          isLoading={false}
        />
      ))}
    </>
  );
});

MessageList.displayName = 'MessageList';

// Confidence thresholds for file matching
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,      // Auto-select with high confidence
  MEDIUM: 0.5,    // Use file but mention uncertainty
  LOW: 0.3,       // Require clarification
  NONE: 0.0       // No match found
};

interface ChatSidebarProps {
  pageId: string;
  workspaceId?: string;
  className?: string;
  skipFileLoad?: boolean;
  delayFileLoad?: number;
}

interface UploadProgress {
  filename: string;
  progress: number;
  status: 'requesting' | 'uploading' | 'confirming' | 'processing' | 'complete' | 'error';
  error?: string;
}

export function ChatSidebarOptimized({ 
  pageId, 
  workspaceId,
  className,
  skipFileLoad = false,
  delayFileLoad = 0
}: ChatSidebarProps) {
  console.log('[ChatSidebarOptimized] Component rendering:', { pageId, workspaceId });
  
  // Use atoms with minimal re-renders
  const { messages, addMessage, clearMessages, batchAddMessages } = useChatMessages(pageId);
  const { dataFiles, addDataFile, removeDataFile, setDataFiles } = useChatDataFiles(pageId);
  const { isLoading, setLoading } = useChatState();
  const { 
    isChatSidebarOpen, 
    setChatSidebarOpen, 
    chatSidebarWidth, 
    setChatSidebarWidth 
  } = useLayoutStore();
  
  // Track render count
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  console.log('[ChatSidebarOptimized] Render count:', renderCountRef.current);
  
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [interactionState, setInteractionState] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(false);
  
  // Memoize file matcher to prevent recreating on every render
  const fileMatcher = useMemo(() => new FuzzyFileMatcherClient(), []);
  
  // Use callback to prevent function recreation
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
    const analysis = QueryAnalyzer.analyzeQuery(content, dataFiles);
    console.log('[ChatSidebarOptimized] Query analysis:', analysis);
    
    // Process based on intent
    if (analysis.intent === 'query-data' && dataFiles.length > 0) {
      await processDataQuery(content, analysis);
    } else {
      await processGeneralQuery(content);
    }
  }, [pageId, dataFiles, addMessage]);
  
  // Process data query with enhanced file matching
  const processDataQuery = useCallback(async (query: string, analysis: any) => {
    setLoading(true);
    
    try {
      // Try to match files
      const matches = await fileMatcher.findBestMatches(
        query, 
        dataFiles,
        { threshold: 0.3 }
      );
      
      console.log('[ChatSidebarOptimized] File matching results:', { 
        query, 
        matchCount: matches.length,
        topMatch: matches[0]
      });
      
      // Process with matched files
      let enrichedFiles = dataFiles;
      
      if (matches.length > 0 && matches[0].score > CONFIDENCE_THRESHOLDS.MEDIUM) {
        // Use the best match
        enrichedFiles = [matches[0].file];
        console.log('[ChatSidebarOptimized] Using matched file:', matches[0].file.filename);
      }
      
      // Fetch actual content from DuckDB
      const filesWithContent = await Promise.all(
        enrichedFiles.slice(0, 3).map(async (file) => {
          try {
            const result = await duckDBQuery.query(
              `SELECT * FROM ${file.tableName} LIMIT 1000`,
              pageId
            );
            
            return {
              ...file,
              content: result.data,
              rowCount: result.rowCount,
            };
          } catch (error) {
            console.error(`Failed to fetch content for ${file.filename}:`, error);
            return file;
          }
        })
      );
      
      // Send to backend with enriched context
      const response = await fetch('/api/chat-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          pageId,
          workspaceId,
          dataFiles: filesWithContent,
          requestId: `req_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to get response');
      
      const data = await response.json();
      
      // Add assistant response
      addMessage({
        role: 'assistant',
        content: data.content,
        metadata: data.metadata,
      });
      
      // Save assistant message
      await fetch(`/api/chat/messages/${pageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: data.content,
          metadata: data.metadata,
        }),
      });
    } catch (error) {
      console.error('Failed to process query:', error);
      addMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [pageId, workspaceId, dataFiles, addMessage, setLoading, fileMatcher]);
  
  // Process general query
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
          dataFiles: [],
          requestId: `req_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to get response');
      
      const data = await response.json();
      
      addMessage({
        role: 'assistant',
        content: data.content,
        metadata: data.metadata,
      });
      
      await fetch(`/api/chat/messages/${pageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: data.content,
          metadata: data.metadata,
        }),
      });
    } catch (error) {
      console.error('Failed to process query:', error);
      addMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [pageId, workspaceId, addMessage, setLoading]);
  
  // Load messages once on mount
  useEffect(() => {
    if (!pageId) return;
    
    let isMounted = true;
    
    const loadChatMessages = async () => {
      try {
        const response = await fetch(`/api/chat/messages/${pageId}`);
        if (!response.ok || !isMounted) return;
        
        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
          batchAddMessages(data.messages);
        }
      } catch (error) {
        console.error('[ChatSidebarOptimized] Failed to load chat messages:', error);
      }
    };
    
    loadChatMessages();
    
    return () => {
      isMounted = false;
    };
  }, [pageId, batchAddMessages]);
  
  // Load files once on mount with batching
  useEffect(() => {
    if (!pageId || skipFileLoad) return;
    
    let isMounted = true;
    
    const restoreFiles = async () => {
      try {
        // Load all files at once from the backend
        const response = await fetch(`/api/data/files/${pageId}`);
        if (!response.ok || !isMounted) return;
        
        const data = await response.json();
        if (data.files && data.files.length > 0) {
          // Batch update all files at once
          setDataFiles(data.files);
          console.log(`[ChatSidebarOptimized] Loaded ${data.files.length} files`);
        }
      } catch (error) {
        console.error('[ChatSidebarOptimized] Failed to load files:', error);
      }
    };
    
    if (delayFileLoad > 0) {
      setTimeout(restoreFiles, delayFileLoad);
    } else {
      restoreFiles();
    }
    
    return () => {
      isMounted = false;
    };
  }, [pageId, skipFileLoad, delayFileLoad, setDataFiles]);
  
  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);
  
  // Handle file upload (simplified)
  const handleFileUpload = useCallback(async (file: File) => {
    console.log('[ChatSidebarOptimized] File upload started:', file.name);
    
    setUploadProgress({
      filename: file.name,
      progress: 0,
      status: 'uploading',
    });
    
    try {
      // Upload logic here (simplified)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('pageId', pageId);
      formData.append('workspaceId', workspaceId || '');
      
      const response = await fetch('/api/data/upload/v2', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();
      
      // Add file to state
      addDataFile(data.file);
      
      setUploadProgress({
        filename: file.name,
        progress: 100,
        status: 'complete',
      });
      
      setTimeout(() => setUploadProgress(null), 2000);
    } catch (error) {
      console.error('[ChatSidebarOptimized] Upload failed:', error);
      setUploadProgress({
        filename: file.name,
        progress: 0,
        status: 'error',
        error: 'Upload failed',
      });
      setTimeout(() => setUploadProgress(null), 3000);
    }
  }, [pageId, workspaceId, addDataFile]);
  
  if (!isChatSidebarOpen) {
    return (
      <button
        onClick={() => setChatSidebarOpen(true)}
        className="fixed right-0 top-1/2 transform -translate-y-1/2 bg-white border-l border-gray-200 p-2 rounded-l-lg shadow-lg hover:shadow-xl transition-shadow z-50"
        aria-label="Open chat"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
    );
  }
  
  return (
    <div 
      className={cn(
        "fixed right-0 top-0 h-full bg-white shadow-lg z-40 flex",
        className
      )}
      style={{ width: chatSidebarWidth }}
    >
      {/* Resize handle */}
      <ResizeHandle
        onDrag={(delta) => {
          const newWidth = Math.max(320, Math.min(800, chatSidebarWidth - delta));
          setChatSidebarWidth(newWidth);
        }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setIsDragging(false)}
        className={cn(
          "absolute left-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500 transition-colors",
          isDragging && "bg-blue-500"
        )}
      />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col ml-1">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Chat Assistant</h3>
          <button
            onClick={() => setChatSidebarOpen(false)}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Close chat"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        
        {/* File context */}
        {dataFiles.length > 0 && (
          <FileContextDisplay
            files={dataFiles}
            onRemoveFile={removeDataFile}
            className="border-b"
          />
        )}
        
        {/* Messages with memoized list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              {dataFiles.length === 0 ? (
                <div>
                  <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>Upload a file to start chatting</p>
                </div>
              ) : (
                <p>Ask me anything about your data!</p>
              )}
            </div>
          ) : (
            <MessageList messages={messages} />
          )}
          
          {isLoading && (
            <div className="flex items-center space-x-2 text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900" />
              <span>Thinking...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Upload progress */}
        {uploadProgress && (
          <div className="px-4 py-2 border-t bg-gray-50">
            <div className="flex items-center justify-between text-sm">
              <span>{uploadProgress.filename}</span>
              <span>{uploadProgress.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
              <div 
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  uploadProgress.status === 'error' ? 'bg-red-600' : 'bg-blue-600'
                )}
                style={{ width: `${uploadProgress.progress}%` }}
              />
            </div>
            {uploadProgress.error && (
              <p className="text-xs text-red-600 mt-1">{uploadProgress.error}</p>
            )}
          </div>
        )}
        
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
        accept=".csv,.xlsx,.xls,.pdf,.txt,.json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}