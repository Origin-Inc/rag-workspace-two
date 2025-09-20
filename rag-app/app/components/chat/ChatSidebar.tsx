import { useState, useRef, useEffect } from 'react';
import { Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { useChatMessages, useChatDataFiles, useChatConnection } from '~/stores/chat-store-ultimate-fix';
import { useLayoutStore } from '~/stores/layout-store';
import { ResizeHandle } from '~/components/ui/ResizeHandle';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { FileContextDisplay } from './FileContextDisplay';
import { cn } from '~/utils/cn';
import { duckDBQuery } from '~/services/duckdb/duckdb-query.client';

interface ChatSidebarProps {
  pageId: string;
  workspaceId?: string;
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
  className 
}: ChatSidebarProps) {
  console.log('[ChatSidebar] Component rendering:', { pageId, workspaceId });
  
  const { messages, addMessage, clearMessages } = useChatMessages(pageId);
  const { dataFiles, addDataFile, removeDataFile } = useChatDataFiles(pageId);
  const { isLoading, setLoading } = useChatConnection();
  const { 
    isChatSidebarOpen, 
    setChatSidebarOpen, 
    chatSidebarWidth, 
    setChatSidebarWidth 
  } = useLayoutStore();
  
  // Track render count
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  console.log('[ChatSidebar] Render count:', renderCountRef.current);
  
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  
  // Track if component is mounted
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      console.log('[ChatSidebar] Component unmounting');
      isMountedRef.current = false;
    };
  }, []);
  
  // Load chat history ONLY - separate from file loading
  useEffect(() => {
    if (!pageId) return;
    
    let isMounted = true;
    
    const loadChatMessages = async () => {
      try {
        const response = await fetch(`/api/chat/messages/${pageId}`);
        if (!response.ok || !isMounted) return;
        
        const data = await response.json();
        if (data.messages && data.messages.length > 0 && isMounted) {
          // Batch update to prevent multiple renders
          clearMessages();
          data.messages.forEach((msg: any) => {
            addMessage({
              role: msg.role,
              content: msg.content,
              metadata: msg.metadata,
            });
          });
        }
      } catch (error) {
        console.error('[ChatSidebar] Failed to load chat messages:', error);
      }
    };
    
    loadChatMessages();
    
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]); // Intentionally omit functions - they're stable
  
  // Load data files SEPARATELY with flag to prevent re-runs
  useEffect(() => {
    if (!pageId || !workspaceId) return;
    
    // Use ref to track if we've already loaded files for this pageId
    const hasLoadedRef = { current: false };
    
    const loadDataFiles = async () => {
      // Prevent duplicate loads
      if (hasLoadedRef.current) {
        console.log('[ChatSidebar] Files already loaded for this page, skipping');
        return;
      }
      
      hasLoadedRef.current = true;
      
      try {
        const response = await fetch(`/api/data/files/${pageId}`);
        if (!response.ok) return;
        
        const { dataFiles } = await response.json();
        if (!dataFiles || dataFiles.length === 0) return;
        
        console.log('[ChatSidebar] Loading file metadata only (not restoring):', dataFiles.length);
        
        // Only load metadata, don't restore files to prevent errors
        dataFiles.forEach((file: any) => {
          addDataFile({
            filename: file.filename,
            tableName: file.tableName,
            schema: file.schema,
            rowCount: file.rowCount,
            sizeBytes: file.sizeBytes,
          });
        });
        
        // Simple notification without attempting restoration
        addMessage({
          role: 'system',
          content: `Found ${dataFiles.length} file(s) from previous session. Please re-upload files to enable querying.`,
        });
      } catch (error) {
        console.error('[ChatSidebar] Error loading file metadata:', error);
      }
    };
    
    // Delay file loading to prevent race conditions
    const timeoutId = setTimeout(loadDataFiles, 100);
    
    return () => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, workspaceId]); // Intentionally omit functions - they're stable

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

    // Save user message to database
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
    
    // Check if we have data files to query
    if (dataFiles.length > 0) {
      setLoading(true);
      try {
        // Process natural language query
        const result = await duckDBQuery.processNaturalLanguageQuery(
          content,
          dataFiles,
          pageId,
          workspaceId
        );

        // Build a comprehensive response
        let responseContent = '';
        
        // Add data context if available
        if ((result.sqlGeneration as any).dataContext) {
          responseContent += (result.sqlGeneration as any).dataContext + '\n\n';
        }
        
        // Add the main explanation
        responseContent += result.sqlGeneration.explanation;
        
        // Add insights if available
        if ((result.sqlGeneration as any).insights) {
          responseContent += '\n\n' + (result.sqlGeneration as any).insights;
        }
        
        if (result.queryResult.success) {
          if (result.queryResult.data && result.queryResult.data.length > 0) {
            // Add formatted results
            responseContent += '\n\n### Results\n';
            const formattedResults = duckDBQuery.formatResults(result.queryResult);
            responseContent += formattedResults;
            
            // Add execution details in a subtle way
            if (result.queryResult.executionTime) {
              responseContent += `\n\n*Query executed in ${result.queryResult.executionTime.toFixed(2)}ms*`;
            }
          } else {
            responseContent += '\n\nNo results found for this query.';
          }
        } else {
          responseContent += '\n\n⚠️ **Error:** ' + result.queryResult.error;
        }
        
        // Add SQL details in a collapsible section
        if (result.sqlGeneration.sql) {
          responseContent += '\n\n<details>\n<summary>View SQL Query</summary>\n\n```sql\n' + result.sqlGeneration.sql + '\n```\n</details>';
        }

        // Add assistant response
        addMessage({
          role: 'assistant',
          content: responseContent,
          metadata: {
            sql: result.sqlGeneration.sql,
            error: result.queryResult.error,
          },
        });

        // Save assistant message to database
        try {
          await fetch(`/api/chat/messages/${pageId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'assistant',
              content: responseContent,
              metadata: {
                sql: result.sqlGeneration.sql,
                tables: result.sqlGeneration.tables,
                confidence: result.sqlGeneration.confidence,
              },
            }),
          });
        } catch (error) {
          console.error('Failed to save assistant message:', error);
        }
      } catch (error) {
        console.error('Error processing query:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        addMessage({
          role: 'assistant',
          content: `Sorry, I encountered an error processing your query: ${errorMessage}`,
          metadata: { error: errorMessage },
        });
      } finally {
        setLoading(false);
      }
    } else {
      // No data files available
      addMessage({
        role: 'assistant',
        content: 'Please upload some data files first to start querying.',
      });
    }
  };
  
  const handleFileUpload = async (file: File) => {
    console.log('[ChatSidebar] Starting file upload', {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      workspaceId,
      pageId,
      currentDataFilesCount: dataFiles.length,
      currentMessagesCount: messages.length
    });

    // Start upload progress tracking
    setUploadProgress({
      filename: file.name,
      progress: 0,
      status: 'requesting'
    });

    // Process file client-side for immediate use
    setLoading(true);
    let uploadResult: { url?: string; path?: string; error?: string } | undefined;
    
    try {
      // If workspaceId provided, upload to server for persistence
      if (workspaceId) {
        console.log('[ChatSidebar] Using direct client-to-Supabase upload');
        
        // Step 1: Initialize Supabase client if needed
        const { supabaseUpload } = await import('~/services/supabase-upload.client');
        
        // Get Supabase config from window.ENV (should be set by root.tsx)
        const supabaseUrl = window.ENV?.SUPABASE_URL;
        const supabaseAnonKey = window.ENV?.SUPABASE_ANON_KEY;
        
        console.log('[ChatSidebar] Supabase config', {
          hasUrl: !!supabaseUrl,
          hasKey: !!supabaseAnonKey
        });
        
        if (!supabaseUrl || !supabaseAnonKey) {
          console.error('[ChatSidebar] Missing Supabase configuration');
          throw new Error('Supabase configuration not available');
        }
        
        // Initialize the upload client
        await supabaseUpload.initialize(supabaseUrl, supabaseAnonKey);
        
        // Generate storage path
        const timestamp = Date.now();
        const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `uploads/${workspaceId}/${timestamp}_${safeFilename}`;
        
        console.log('[ChatSidebar] Upload path', { storagePath });
        setUploadProgress(prev => prev ? { ...prev, status: 'uploading', progress: 10 } : null);
        
        // Step 2: Upload directly to Supabase
        uploadResult = await supabaseUpload.uploadFile(file, storagePath, {
          bucket: 'user-uploads',
          onProgress: (progress) => {
            console.log(`[ChatSidebar] Upload progress: ${progress}%`);
            setUploadProgress(prev => prev ? { 
              ...prev, 
              progress: Math.min(90, progress * 0.9) // Cap at 90% until confirmation
            } : null);
          },
          upsert: true
        });
        
        if (uploadResult.error) {
          console.error('[ChatSidebar] Upload failed', uploadResult.error);
          throw new Error(uploadResult.error);
        }
        
        console.log('[ChatSidebar] Upload successful', uploadResult);
        setUploadProgress(prev => prev ? { ...prev, status: 'confirming', progress: 95 } : null);
        
        // Step 3: Register the upload with the server
        console.log('[ChatSidebar] Registering upload with server');
        const registerResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'register-upload',
            workspaceId,
            pageId: pageId || null,
            filename: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            storagePath: uploadResult.path,
            storageUrl: uploadResult.url,
            isShared: false
          }),
        });
        
        if (!registerResponse.ok) {
          const error = await registerResponse.json();
          console.error('[ChatSidebar] Failed to register upload', error);
          throw new Error(error.error || 'Failed to register upload');
        }
        
        const result = await registerResponse.json();
        console.log('[ChatSidebar] File registered successfully:', result);
        
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
        
        // Convert FileSchema to the format expected by DataFile
        const schemaForStore = processed.schema.columns.map(col => ({
          name: col.name,
          type: col.type,
          sampleData: processed.schema.sampleData.slice(0, 3).map(row => row[col.name])
        }));
        
        // Add the file to local store
        console.log('[ChatSidebar] About to add file to local store:', {
          filename: file.name,
          tableName: processed.tableName,
          schemaLength: schemaForStore.length,
          rowCount: processed.data.length,
        });
        
        if (!isMountedRef.current) {
          console.warn('[ChatSidebar] Component unmounted, skipping addDataFile');
          return;
        }
        
        try {
          addDataFile({
            filename: file.name,
            tableName: processed.tableName,
            schema: schemaForStore,
            rowCount: processed.data.length,
            sizeBytes: file.size,
          });
          console.log('[ChatSidebar] File added to local store successfully');
        } catch (error) {
          console.error('[ChatSidebar] Error adding file to local store:', error);
        }
        
        // Save file metadata to database if we have a workspace
        if (workspaceId && pageId) {
          try {
            const storageUrl = uploadResult?.url || null;
            const response = await fetch(`/api/data/files/${pageId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: file.name,
                tableName: processed.tableName,
                schema: schemaForStore,
                rowCount: processed.data.length,
                sizeBytes: file.size,
                storageUrl,
              }),
            });
            
            if (!response.ok) {
              console.error('[ChatSidebar] Failed to save file metadata to database');
            } else {
              console.log('[ChatSidebar] File metadata saved to database');
            }
          } catch (error) {
            console.error('[ChatSidebar] Error saving file metadata:', error);
          }
        }
        
        if (!isMountedRef.current) {
          console.warn('[ChatSidebar] Component unmounted, skipping addMessage');
          return;
        }
        
        console.log('[ChatSidebar] About to add system message for file load');
        try {
          addMessage({
            role: 'system',
            content: `File "${file.name}" loaded with ${processed.data.length} rows. Ready for querying!`,
          });
          console.log('[ChatSidebar] System message added successfully');
        } catch (error) {
          console.error('[ChatSidebar] Error adding system message:', error);
        }
      }
      
      // Clear upload progress after a delay
      console.log('[ChatSidebar] Setting timeout to clear upload progress');
      setTimeout(() => {
        if (!isMountedRef.current) {
          console.warn('[ChatSidebar] Component unmounted, skipping setUploadProgress');
          return;
        }
        console.log('[ChatSidebar] Clearing upload progress from timeout');
        setUploadProgress(null);
      }, 2000);
      
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
        "fixed right-0 top-0 h-full bg-theme-bg-primary border-l border-theme-border-primary flex",
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
        className="flex-1 flex flex-col bg-theme-bg-primary overflow-hidden w-full"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-theme-border-primary bg-theme-bg-primary">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Data Chat</h2>
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
          onFileRemove={async (fileId) => {
            const file = dataFiles.find(f => f.id === fileId);
            if (file) {
              // Remove from local store
              removeDataFile(fileId);
              
              // Remove from database if we have a workspace
              if (workspaceId && pageId) {
                try {
                  const response = await fetch(`/api/data/files/${pageId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileId }),
                  });
                  
                  if (!response.ok) {
                    console.error('[ChatSidebar] Failed to delete file from database');
                  }
                } catch (error) {
                  console.error('[ChatSidebar] Error deleting file:', error);
                }
              }
              
              // Remove from DuckDB
              try {
                const { getDuckDB } = await import('~/services/duckdb/duckdb-service.client');
                const duckdb = getDuckDB();
                if (duckdb.isReady()) {
                  await duckdb.dropTable(file.tableName);
                }
              } catch (error) {
                console.error('[ChatSidebar] Error removing table from DuckDB:', error);
              }
              
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 bg-theme-bg-primary">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p className="text-sm">Upload CSV or Excel files to start analyzing</p>
            <p className="text-xs mt-2">Click the + button or drag and drop files here</p>
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
        <div className="absolute inset-0 bg-blue-50 dark:bg-blue-900/20 bg-opacity-90 flex items-center justify-center z-60">
          <div className="text-center">
            <Upload className="w-16 h-16 mx-auto mb-4 text-blue-500" />
            <p className="text-lg font-medium text-blue-700 dark:text-blue-300">Drop files here</p>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">CSV and Excel files supported</p>
          </div>
        </div>
      )}
      
        {/* Input with integrated file upload */}
        <ChatInput 
          pageId={pageId}
          onSendMessage={handleSendMessage}
          onFileUpload={handleFileUpload}
          disabled={isLoading || uploadProgress !== null}
          placeholder={dataFiles.length === 0 ? "Upload data first..." : "Ask a question about your data..."}
        />
      </div>
    </div>
  );
}