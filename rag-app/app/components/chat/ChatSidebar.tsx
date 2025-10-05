import { useState, useRef, useEffect } from 'react';
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
  skipFileLoad?: boolean; // Debug: skip file loading
  delayFileLoad?: number; // Debug: delay file loading by ms
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
  className,
  skipFileLoad = false,
  delayFileLoad = 0
}: ChatSidebarProps) {
  console.log('[ChatSidebar] Component rendering:', { pageId, workspaceId, skipFileLoad, delayFileLoad });
  
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
  console.log('[ChatSidebar] Render count:', renderCountRef.current);
  
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  // Consolidated state for user interactions - only one can be active at a time
  const [interactionState, setInteractionState] = useState<{
    type: 'disambiguation' | 'clarification' | 'not-found' | null;
    matches?: FileMatchResult[];
    match?: FileMatchResult;
    query: string;
    pendingMessage: string;
    suggestions?: FileMatchResult[];
  } | null>(null);
  
  // Helper functions for state management
  const clearInteractionState = () => setInteractionState(null);
  
  const setDisambiguationState = (state: { matches: FileMatchResult[]; query: string; pendingMessage: string } | null) => {
    if (state) {
      setInteractionState({
        type: 'disambiguation',
        matches: state.matches,
        query: state.query,
        pendingMessage: state.pendingMessage
      });
    } else {
      clearInteractionState();
    }
  };
  
  const setClarificationState = (state: {
    type: 'clarification' | 'not-found';
    match?: FileMatchResult;
    query: string;
    pendingMessage: string;
    suggestions?: FileMatchResult[];
  } | null) => {
    if (state) {
      setInteractionState({
        ...state,
        type: state.type
      });
    } else {
      clearInteractionState();
    }
  };
  
  // Getters for backward compatibility
  const disambiguationState = interactionState?.type === 'disambiguation' ? interactionState : null;
  const clarificationState = (interactionState?.type === 'clarification' || interactionState?.type === 'not-found') ? interactionState : null;
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
          // Use batch add to prevent cascading re-renders
          batchAddMessages(data.messages.map((msg: any) => ({
            role: msg.role,
            content: msg.content,
            metadata: msg.metadata,
            pageId,
          })));
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
  
  // Restore persisted tables from cloud storage first, then IndexedDB
  useEffect(() => {
    if (!pageId || skipFileLoad) return;
    
    let isMounted = true;
    
    const restoreTables = async () => {
      try {
        // Initialize DuckDB if needed
        const { getDuckDB } = await import('~/services/duckdb/duckdb-service.client');
        const duckdb = getDuckDB();
        
        if (!duckdb.isReady()) {
          await duckdb.initialize();
        }
        
        // Wait for optional delay (for debugging)
        if (delayFileLoad > 0) {
          await new Promise(resolve => setTimeout(resolve, delayFileLoad));
        }
        
        if (!isMounted) return;
        
        const restoredFilesMap = new Map<string, any>();
        
        // STEP 1: Always load from IndexedDB first (primary persistence)
        try {
          console.log('[ChatSidebar] Loading files from IndexedDB (primary storage)...');
          const restoredFiles = await duckdb.restoreTablesForPage(pageId);
          
          if (restoredFiles.length > 0 && isMounted) {
            console.log(`[ChatSidebar] ✅ Restored ${restoredFiles.length} tables from IndexedDB`);
            restoredFiles.forEach((file: any) => {
              restoredFilesMap.set(file.tableName, {
                filename: file.filename,
                tableName: file.tableName,
                schema: file.schema,
                rowCount: file.rowCount,
                sizeBytes: file.sizeBytes,
                source: 'indexeddb'
              });
            });
          }
        } catch (error) {
          console.error('[ChatSidebar] Failed to restore from IndexedDB:', error);
        }
        
        // STEP 2: Try to enhance with cloud metadata (if available)
        if (workspaceId) {
          try {
            console.log('[ChatSidebar] Checking for cloud metadata...');
            const { DuckDBCloudSyncService } = await import('~/services/duckdb/duckdb-cloud-sync.client');
            const cloudSync = DuckDBCloudSyncService.getInstance();
            
            const cloudFiles = await cloudSync.loadFilesFromCloud(pageId, workspaceId);
            
            if (cloudFiles.length > 0) {
              console.log(`[ChatSidebar] Found ${cloudFiles.length} files in cloud metadata`);
              
              // Merge cloud metadata with IndexedDB data
              cloudFiles.forEach((file) => {
                const existingFile = restoredFilesMap.get(file.tableName);
                if (existingFile) {
                  // Enhance existing file with cloud metadata
                  restoredFilesMap.set(file.tableName, {
                    ...existingFile,
                    databaseId: file.id,
                    parquetUrl: file.parquetUrl,
                    source: 'both'
                  });
                } else if (file.parquetUrl) {
                  // File only in cloud, add it
                  restoredFilesMap.set(file.tableName, {
                    filename: file.filename,
                    tableName: file.tableName,
                    schema: file.schema,
                    rowCount: file.rowCount,
                    sizeBytes: file.sizeBytes,
                    databaseId: file.id,
                    source: 'cloud'
                  });
                }
              });
            }
          } catch (error) {
            console.warn('[ChatSidebar] Cloud metadata not available:', error);
            // Not critical - IndexedDB data is already loaded
          }
        }
        
        // STEP 3: Add all restored files to the store in batch
        if (restoredFilesMap.size > 0 && isMounted) {
          console.log(`[ChatSidebar] Total files restored: ${restoredFilesMap.size}`);
          // Convert Map to array and batch update
          const filesToAdd = Array.from(restoredFilesMap.values()).map(file => ({
            ...file,
            pageId, // Ensure pageId is set
          }));
          
          // Batch update all files at once to prevent re-renders
          setDataFiles(filesToAdd);
          
          filesToAdd.forEach((file) => {
            console.log(`[ChatSidebar] Restored: ${file.filename} (source: ${file.source})`);
          });
        } else {
          console.log('[ChatSidebar] No files to restore');
        }
      } catch (error) {
        console.error('[ChatSidebar] Failed to restore tables:', error);
      }
    };
    
    restoreTables();
    
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, workspaceId, skipFileLoad, delayFileLoad]); // Intentionally omit functions

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);
  
  const handleClarificationResponse = async (action: string, data?: any) => {
    if (!clarificationState) return;
    
    console.log('[ChatSidebar] Handling clarification response:', { action, data });
    
    // Clear clarification state
    const pendingMessage = clarificationState.pendingMessage;
    const query = clarificationState.query;
    setClarificationState(null);
    
    switch (action) {
      case 'respond':
        // User selected a suggestion or provided clarification
        await handleSendMessage(data);
        break;
        
      case 'cancel':
        // User wants to rephrase
        // Just clear the clarification, user will type new message
        break;
        
      case 'confirm':
        // User confirmed the suggested file
        if (clarificationState.match) {
          await processQueryWithFile(pendingMessage, [clarificationState.match.file]);
        }
        break;
        
      case 'reject':
        // User rejected the suggestion - show file browser
        setDisambiguationState({
          matches: dataFiles.map(file => ({
            file,
            score: 0,
            confidence: 0,
            matchType: 'partial' as const,
            matchedTokens: [],
            reason: 'Manual selection'
          })),
          query,
          pendingMessage
        });
        break;
        
      case 'browse':
        // Show all files for selection
        setDisambiguationState({
          matches: dataFiles.map(file => ({
            file,
            score: 0,
            confidence: 0,
            matchType: 'partial' as const,
            matchedTokens: [],
            reason: 'Manual selection'
          })),
          query,
          pendingMessage
        });
        break;
        
      case 'use-all':
        // Query all available files
        await processQueryWithFile(pendingMessage, dataFiles);
        break;
        
      case 'upload':
        // Trigger file upload (will need to implement file input trigger)
        console.log('[ChatSidebar] Upload requested from clarification');
        break;
    }
  };
  
  const handleFileSelect = async (file: DataFile) => {
    if (!clarificationState) return;
    
    console.log('[ChatSidebar] File selected from clarification:', file.filename);
    const pendingMessage = clarificationState.pendingMessage;
    setClarificationState(null);
    
    await processQueryWithFile(pendingMessage, [file]);
  };
  
  const processQueryWithFile = async (content: string, filesToQuery: DataFile[]) => {
    setLoading(true);
    try {
      // Get recent conversation for context
      const conversationHistory = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Check if we should use unified intelligence for this query
      const isPdfFile = filesToQuery.some(f => f.filename.toLowerCase().endsWith('.pdf'));
      const isSemanticQuery = /summarize|explain|describe|what|how|why|tell|about|contain|specific|analyze|insight|understand|mean|overview|detail/i.test(content);
      
      // Use unified intelligence for PDFs or semantic queries
      if (isPdfFile || isSemanticQuery) {
        try {
          console.log('[ChatSidebar] Preparing to fetch PDF content for unified intelligence');
          
          // For PDF files, fetch the actual content from DuckDB
          const enrichedFiles = await Promise.all(
            filesToQuery.map(async (file) => {
              const isPDF = file.filename.toLowerCase().endsWith('.pdf');
              const isCSV = file.filename.toLowerCase().endsWith('.csv');
              const isExcel = file.filename.toLowerCase().endsWith('.xlsx') || file.filename.toLowerCase().endsWith('.xls');
              
              // Fetch content for files that need it
              if (isPDF || isCSV || isExcel) {
                console.log('[ChatSidebar] Fetching content for:', file.filename, 'from table:', file.tableName);
                
                // Query the actual content from DuckDB
                // For PDFs, get all rows since they contain chunks of text
                const rowLimit = isPDF ? 10000 : 500; // Higher limit for PDFs to get all text chunks
                const contentQuery = `SELECT * FROM ${file.tableName} LIMIT ${rowLimit}`;
                try {
                  const { getDuckDB } = await import('~/services/duckdb/duckdb-service.client');
                  const duckdb = getDuckDB();
                  const result = await duckdb.executeQuery(contentQuery);
                  const data = result.toArray();
                  
                  console.log('[ChatSidebar] Content fetched:', {
                    filename: file.filename,
                    type: isPDF ? 'PDF' : (isCSV ? 'CSV' : 'Excel'),
                    rowCount: data?.length || 0,
                    hasData: !!data,
                    sampleRow: data?.[0]
                  });
                  
                  if (isPDF) {
                    // For PDFs, extract text content
                    // Check multiple possible column names for text content
                    const textContent = data?.map((row: any) => {
                      // Try different column names that might contain the text
                      return row.text || row.content || row.chunk_text || row.chunk || 
                             row.text_content || row.page_content || '';
                    }).filter(Boolean) || [];
                    
                    console.log('[ChatSidebar] PDF text extraction:', {
                      filename: file.filename,
                      rowCount: data?.length || 0,
                      extractedChunks: textContent.length,
                      sampleText: textContent[0]?.slice(0, 100),
                      columnNames: data?.[0] ? Object.keys(data[0]) : []
                    });
                    
                    return {
                      ...file,
                      data: data || [],
                      content: textContent
                    };
                  } else {
                    // For CSV/Excel, include limited data to prevent payload size issues
                    // Only send first 100 rows for context to avoid timeout
                    const limitedData = data?.slice(0, 100) || [];
                    
                    // Create a text summary for large datasets
                    const summary = data && data.length > 100 ? 
                      `[Dataset contains ${data.length} total rows, showing first 100 rows]` : '';
                    
                    return {
                      ...file,
                      data: limitedData,
                      sampleData: limitedData,
                      content: limitedData,
                      totalRows: data?.length || 0,
                      summary
                    };
                  }
                } catch (error) {
                  console.error('[ChatSidebar] Failed to fetch content:', error);
                  return file;
                }
              }
              return file;
            })
          );
          
          console.log('[ChatSidebar] Enriched files prepared:', {
            count: enrichedFiles.length,
            hasContent: enrichedFiles.some(f => f.content?.length > 0),
            files: enrichedFiles.map(f => ({
              filename: f.filename,
              contentType: Array.isArray(f.content) ? 'array' : typeof f.content,
              contentLength: Array.isArray(f.content) ? f.content.length : 
                           typeof f.content === 'string' ? f.content.length : 0,
              dataLength: f.data?.length || 0,
              hasSchema: !!f.schema,
              schemaColumns: f.schema?.length || 0
            }))
          });
          
          // Check payload size and warn if too large
          const payloadSize = JSON.stringify(enrichedFiles).length;
          if (payloadSize > 3 * 1024 * 1024) { // 3MB
            console.warn('[ChatSidebar] WARNING: Large payload size:', (payloadSize / 1024 / 1024).toFixed(2), 'MB');
            console.warn('[ChatSidebar] Consider reducing data size to prevent timeouts');
          }
          
          // Call the unified intelligence endpoint
          const response = await fetch('/api/chat-query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: content,
              files: enrichedFiles,
              pageId,
              workspaceId,
              conversationHistory,
            }),
          });
          
          if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
          }
          
          const result = await response.json();
          
          // Track token usage if metadata is available
          if (result.metadata) {
            tokenMonitor.recordUsage({
              query: content,
              model: result.metadata.model || 'gpt-4-turbo-preview',
              contextTokens: result.metadata.contextTokens || 0,
              responseTokens: result.metadata.responseTokens || 0,
              totalTokens: result.metadata.totalTokens || 0,
              truncated: false,
              samplingStrategy: 'unified',
            });
          }
          
          // Add the unified response
          addMessage({
            role: 'assistant',
            content: result.content,
            metadata: {
              ...result.metadata,
              dataFiles: filesToQuery.map(f => f.filename),
            },
          });
          
          // Save to database
          try {
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
            console.error('Failed to save assistant message:', error);
          }
          
          return; // Exit early for unified intelligence path
        } catch (error) {
          console.warn('Unified intelligence failed, falling back to SQL path:', error);
          // Fall through to SQL path if unified fails
        }
      }
      
      // Original SQL-based processing for structured data queries
      const result = await duckDBQuery.processNaturalLanguageQuery(
        content,
        filesToQuery,
        pageId,
        workspaceId,
        conversationHistory
      );
      
      // Track token usage if metadata is available
      if ((result.sqlGeneration as any).metadata) {
        const metadata = (result.sqlGeneration as any).metadata;
        tokenMonitor.recordUsage({
          query: content,
          model: metadata.model || 'gpt-4-turbo-preview',
          contextTokens: metadata.contextTokens || 0,
          responseTokens: metadata.tokensUsed || 0,
          totalTokens: metadata.tokensUsed || 0,
          truncated: false,
          samplingStrategy: 'smart',
        });
      }

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

      // Add assistant response with citations
      addMessage({
        role: 'assistant',
        content: responseContent,
        metadata: {
          sql: result.sqlGeneration.sql,
          error: result.queryResult.error,
          dataFiles: result.sqlGeneration.tables,
          usedTables: result.sqlGeneration.usedTables,
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
              usedTables: result.sqlGeneration.usedTables,
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
  };

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
    
    // Analyze the query to understand user intent
    const queryAnalysis = QueryAnalyzer.analyzeQuery(content, dataFiles);
    console.log('[ChatSidebar] Query analysis:', queryAnalysis);
    
    // Handle clarification if needed
    if (queryAnalysis.clarificationNeeded) {
      const clarification = QueryAnalyzer.generateClarificationPrompt(queryAnalysis);
      
      addMessage({
        role: 'clarification',
        content: '',
        metadata: {
          clarificationData: {
            match: null,
            query: content,
            pendingMessage: content
          },
          // Store the smart clarification data
          smartClarification: {
            message: clarification.message,
            suggestions: clarification.suggestions
          }
        }
      });
      
      setClarificationState({
        type: 'clarification',
        query: content,
        pendingMessage: content
      });
      return;
    }
    
    // Handle different intents
    switch (queryAnalysis.intent) {
      case 'greeting':
        addMessage({
          role: 'assistant',
          content: 'Hello! How can I help you today? I can analyze your data files, answer questions, or help you understand your documents.',
        });
        return;
        
      case 'conversational':
        addMessage({
          role: 'assistant',
          content: "I'm doing great, thank you for asking! I'm here to help you analyze data and documents. What would you like to explore today?",
        });
        return;
        
      case 'off-topic':
        addMessage({
          role: 'assistant',
          content: `I'm specialized in data and document analysis, so I can't help with that topic. However, I can:
• Analyze CSV, Excel, and PDF files
• Generate insights and summaries
• Answer questions about your data
• Create visualizations and statistics

Would you like to upload a file to analyze?`,
        });
        return;
        
      case 'help-request':
        addMessage({
          role: 'assistant',
          content: `I can help you with:
• Analyzing and querying your data files
• Creating summaries and visualizations
• Calculating statistics and aggregations
• Understanding PDF documents
• Answering questions about your data

Just upload a file and ask me anything about it!`,
        });
        return;
        
      case 'general-chat':
        // For truly general chat, check if there are files to work with
        if (dataFiles.length > 0) {
          // Check if the query might be asking about the files
          const mightBeAboutFiles = /what|explain|describe|tell|show|about|contain|in the/i.test(content.toLowerCase());
          
          if (mightBeAboutFiles) {
            // User might be asking about the files in a general way
            const fileType = dataFiles.some(f => f.filename.toLowerCase().endsWith('.pdf')) ? 'document' : 'data';
            addMessage({
              role: 'assistant',
              content: `I see you have ${dataFiles.length} ${fileType} file${dataFiles.length > 1 ? 's' : ''} uploaded. Would you like me to:
• Summarize the content
• Answer specific questions about it
• Extract key information
• Analyze the data

Just let me know what you're looking for!`,
            });
          } else {
            // General chat without file reference
            addMessage({
              role: 'assistant',
              content: 'I can help you analyze your uploaded files. What would you like to know about your data?',
            });
          }
        } else {
          // No files uploaded yet
          addMessage({
            role: 'assistant',
            content: 'I specialize in data and document analysis. Please upload a CSV, Excel, or PDF file to get started!',
          });
        }
        return;
    }
    
    // Check if we have data files to query for data-related intents
    if (queryAnalysis.intent === 'query-data' && dataFiles.length > 0) {
      // Use fuzzy matching to identify which files are being referenced
      const matches = FuzzyFileMatcherClient.matchFiles(
        content,
        dataFiles,
        {
          confidenceThreshold: CONFIDENCE_THRESHOLDS.NONE, // Get all matches
          maxResults: 5,
          includeSemanticMatch: true,
          includeTemporalMatch: true
        }
      );
      
      console.log('[ChatSidebar] File matching results:', {
        query: content,
        matchCount: matches.length,
        topMatch: matches[0] ? {
          file: matches[0].file.filename,
          confidence: matches[0].confidence,
          type: matches[0].matchType
        } : null
      });
      
      // Handle different confidence scenarios
      if (matches.length === 0 || (matches[0] && matches[0].confidence < CONFIDENCE_THRESHOLDS.LOW)) {
        // No match or very low confidence - show not-found prompt
        console.log('[ChatSidebar] No suitable file match found, showing not-found prompt');
        
        addMessage({
          role: 'not-found',
          content: '',
          metadata: {
            notFoundData: {
              query: content,
              availableFiles: dataFiles,
              suggestions: matches.filter(m => m.confidence > CONFIDENCE_THRESHOLDS.NONE)
            }
          }
        });
        
        setClarificationState({
          type: 'not-found',
          suggestions: matches,
          query: content,
          pendingMessage: content
        });
        return;
      }
      
      // Check for low confidence match that needs clarification
      if (matches[0].confidence < CONFIDENCE_THRESHOLDS.MEDIUM) {
        console.log('[ChatSidebar] Low confidence match, requesting clarification');
        
        addMessage({
          role: 'clarification',
          content: '',
          metadata: {
            clarificationData: {
              match: matches[0],
              query: content
            }
          }
        });
        
        setClarificationState({
          type: 'clarification',
          match: matches[0],
          query: content,
          pendingMessage: content
        });
        return;
      }
      
      // If multiple files match with similar confidence, show disambiguation dialog
      if (matches.length > 1 && 
          matches[0].confidence < CONFIDENCE_THRESHOLDS.HIGH && 
          matches[0].confidence - matches[1].confidence < 0.2) {
        setDisambiguationState({
          matches,
          query: content,
          pendingMessage: content
        });
        return;
      }
      
      // Determine which files to query
      let filesToQuery: DataFile[];
      
      if (matches.length > 0) {
        // Use the best match even if confidence is low
        filesToQuery = [matches[0].file];
        console.log('[ChatSidebar] Using fuzzy match:', {
          file: matches[0].file.filename,
          confidence: matches[0].confidence,
          matchType: matches[0].matchType
        });
      } else {
        // No specific file mentioned - use context window manager to be smart
        // For now, use all files but add a warning
        filesToQuery = dataFiles;
        console.log('[ChatSidebar] No specific file match found, using all files');
      }
      
      // Process the query with the selected files
      await processQueryWithFile(content, filesToQuery);
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

    // Check file size limit (100MB for Supabase free tier)
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      addMessage({
        role: 'system',
        content: `⚠️ File too large (${sizeMB}MB). Maximum file size is 100MB. Please use a smaller file or split it into multiple files.`,
      });
      return;
    }

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
      
      // Check if file needs server-side processing (PDFs)
      if (processed.requiresServerProcessing) {
        console.log('[ChatSidebar] File requires server-side processing:', file.name);
        
        // For PDFs, we need to use the server endpoint for processing
        // The file has already been uploaded to Supabase, so we'll process it server-side
        if (workspaceId && pageId && uploadResult?.url) {
          try {
            const formData = new FormData();
            formData.append('file', file);
            
            // Pass the storage URL so server doesn't try to re-upload
            const params = new URLSearchParams({
              pageId,
              workspaceId,
              storageUrl: uploadResult.url
            });
            
            const response = await fetch(`/api/data/upload/v2?${params}`, {
              method: 'POST',
              body: formData,
            });
            
            if (!response.ok) {
              throw new Error('Failed to process PDF on server');
            }
            
            const result = await response.json();
            if (result.success && result.files?.[0]) {
              const processedFile = result.files[0];
              
              // Add to local store
              // Transform schema format if it has columns property
              const schemaForStore = processedFile.schema?.columns 
                ? processedFile.schema.columns.map((col: any) => ({
                    name: col.name,
                    type: col.type,
                    sampleData: col.sampleValues || []
                  }))
                : (processedFile.schema || []);
              
              addDataFile({
                databaseId: processedFile.id,
                filename: processedFile.filename,
                tableName: processedFile.tableName,
                schema: schemaForStore,
                rowCount: processedFile.rowCount || 0,
                sizeBytes: file.size,
              });
              
              // Load PDF data into DuckDB if available
              if (processedFile.data && processedFile.data.length > 0 && duckdb.isReady()) {
                console.log('[ChatSidebar] Loading PDF data into DuckDB:', {
                  tableName: processedFile.tableName,
                  rowCount: processedFile.data.length,
                  isPreview: true  // Server only sends preview data
                });
                
                try {
                  // Load the preview data into DuckDB for immediate querying
                  await duckdb.createTableFromData(
                    processedFile.tableName,
                    processedFile.data,
                    processedFile.schema,
                    pageId
                  );
                  console.log('[ChatSidebar] PDF data loaded into DuckDB successfully');
                } catch (error) {
                  console.error('[ChatSidebar] Failed to load PDF data into DuckDB:', error);
                }
              }
              
              // Show success message with PDF metadata if available
              if (processedFile.pdfMetadata) {
                addMessage({
                  role: 'system',
                  content: `PDF file "${file.name}" uploaded successfully!\n` +
                          `• Pages: ${processedFile.pdfMetadata.totalPages || 'unknown'}\n` +
                          `• Tables extracted: ${processedFile.pdfMetadata.tablesExtracted || 0}\n` +
                          `• Images found: ${processedFile.pdfMetadata.imagesExtracted || 0}`,
                });
              } else {
                addMessage({
                  role: 'system',
                  content: `PDF file "${file.name}" uploaded and processed successfully!`,
                });
              }
              
              // Clear upload progress after successful PDF processing
              setUploadProgress(prev => prev ? { ...prev, status: 'complete', progress: 100 } : null);
              setTimeout(() => {
                if (isMountedRef.current) {
                  setUploadProgress(null);
                }
              }, 2000);
            }
          } catch (error) {
            console.error('[ChatSidebar] Error processing PDF:', error);
            throw error;
          }
        } else {
          throw new Error('PDF processing requires workspace and page IDs');
        }
        return; // Exit early for PDFs
      }
      
      // Load data into DuckDB for immediate querying (CSV/Excel files)
      if (duckdb.isReady() && processed.data && processed.data.length > 0) {
        await duckdb.createTableFromData(
          processed.tableName,
          processed.data,
          processed.schema,
          pageId  // Add pageId for persistence
        );
        
        // Convert FileSchema to the format expected by DataFile
        const schemaForStore = processed.schema.columns.map(col => ({
          name: col.name,
          type: col.type,
          sampleData: processed.schema.sampleData.slice(0, 3).map(row => row[col.name])
        }));
        
        // Add the file to local store
        console.log('[ChatSidebar] Preparing file metadata:', {
          filename: file.name,
          tableName: processed.tableName,
          schemaLength: schemaForStore.length,
          rowCount: processed.data.length,
        });
        
        if (!isMountedRef.current) {
          console.warn('[ChatSidebar] Component unmounted, skipping file operations');
          return;
        }
        
        // We'll add to local store after getting database ID (if saving to cloud)
        // or immediately if not saving to cloud
        let databaseId: string | undefined;
        let cloudSyncStatus: 'pending' | 'success' | 'failed' = 'pending';  // Declare here for proper scope
        
        // Save file metadata to database if we have a workspace
        if (workspaceId && pageId) {
          try {
            const storageUrl = uploadResult?.url || null;
            
            // ALWAYS persist to IndexedDB first (primary persistence layer)
            console.log('[ChatSidebar] 💾 PERSISTING TO INDEXEDDB...');
            try {
              const { DuckDBPersistenceService } = await import('~/services/duckdb/duckdb-persistence.client');
              const persistenceService = DuckDBPersistenceService.getInstance();
              await persistenceService.persistTable(
                processed.tableName,
                pageId,
                schemaForStore,
                processed.data.length,
                file.name  // Pass the original filename
              );
              console.log('[ChatSidebar] ✅ Saved to IndexedDB successfully');
            } catch (error) {
              console.error('[ChatSidebar] ⚠️ Failed to save to IndexedDB:', error);
            }
            
            // Export table to cloud storage (enhancement, not required)
            let parquetUrl = null;
            // cloudSyncStatus already declared in outer scope
            const supabaseUrl = window.ENV?.SUPABASE_URL;
            const supabaseAnonKey = window.ENV?.SUPABASE_ANON_KEY;
            
            // Check for Supabase credentials
            console.log('[ChatSidebar] 📊 CLOUD SYNC CHECK:', {
              hasSupabaseUrl: !!supabaseUrl,
              hasAnonKey: !!supabaseAnonKey,
              workspaceId,
              pageId,
              tableName: processed.tableName
            });
            
            if (supabaseUrl && supabaseAnonKey && workspaceId) {
              // Attempt cloud sync with retry logic
              const maxRetries = 3;
              let retryCount = 0;
              
              while (retryCount < maxRetries && !parquetUrl) {
                try {
                  console.log(`[ChatSidebar] ⬆️ CLOUD SYNC ATTEMPT ${retryCount + 1}/${maxRetries}...`);
                  const { DuckDBExportService } = await import('~/services/duckdb/duckdb-export.client');
                  const exportService = DuckDBExportService.getInstance();
                  
                  parquetUrl = await exportService.exportAndUploadToStorage(
                    processed.tableName,
                    workspaceId,
                    supabaseUrl,
                    supabaseAnonKey
                  );
                  
                  if (parquetUrl) {
                    console.log('[ChatSidebar] ✅ CLOUD SYNC SUCCESSFUL:', {
                      url: parquetUrl,
                      tableName: processed.tableName
                    });
                    cloudSyncStatus = 'success';
                    break;
                  } else {
                    console.warn(`[ChatSidebar] ⚠️ Cloud sync attempt ${retryCount + 1} returned null`);
                  }
                } catch (error) {
                  console.error(`[ChatSidebar] ❌ Cloud sync attempt ${retryCount + 1} failed:`, error);
                  
                  // If auth error, don't retry
                  if (error instanceof Error && 
                      (error.message.includes('401') || 
                       error.message.includes('403') || 
                       error.message.includes('auth'))) {
                    console.warn('[ChatSidebar] 🔐 Authentication issue detected, stopping retries');
                    break;
                  }
                }
                
                retryCount++;
                if (retryCount < maxRetries && !parquetUrl) {
                  // Exponential backoff
                  const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
                  console.log(`[ChatSidebar] ⏳ Retrying in ${delay}ms...`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }
              
              if (!parquetUrl) {
                cloudSyncStatus = 'failed';
                console.warn('[ChatSidebar] ⚠️ Cloud sync failed after all retries');
              }
            } else {
              console.log('[ChatSidebar] ℹ️ Cloud sync not available (missing credentials or workspace)');
              cloudSyncStatus = 'failed';
            }
            
            console.log('[ChatSidebar] 💾 SAVING METADATA TO DATABASE:', {
              filename: file.name,
              tableName: processed.tableName,
              hasStorageUrl: !!storageUrl,
              storageUrl: storageUrl || 'NONE',
              hasParquetUrl: !!parquetUrl,
              parquetUrl: parquetUrl || 'NONE',
              schemaLength: schemaForStore.length,
              rowCount: processed.data.length,
              sizeBytes: file.size
            });
            
            console.log('[ChatSidebar] 📤 Sending metadata to API:', {
              pageId,
              filename: file.name,
              tableName: processed.tableName,
              hasSchema: !!schemaForStore,
              hasParquetUrl: !!parquetUrl,
            });
            
            const response = await fetch(`/api/data/files/${pageId}`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                // Include credentials to ensure auth cookies are sent
                'X-Requested-With': 'XMLHttpRequest'
              },
              credentials: 'include', // Ensure cookies are sent
              body: JSON.stringify({
                filename: file.name,
                tableName: processed.tableName,
                schema: schemaForStore,
                rowCount: processed.data.length,
                sizeBytes: file.size,
                storageUrl,
                parquetUrl,
              }),
            });
            
            const responseText = await response.text();
            console.log('[ChatSidebar] 📥 API Response:', {
              status: response.status,
              ok: response.ok,
              responsePreview: responseText.substring(0, 200)
            });
            
            if (!response.ok) {
              console.error('[ChatSidebar] ❌ FAILED TO SAVE METADATA:', {
                status: response.status,
                statusText: response.statusText,
                errorBody: responseText
              });
              
              // Show user-friendly error for auth issues
              if (response.status === 401 || response.status === 403) {
                console.error('[ChatSidebar] ⚠️ Authentication required - Please ensure you are logged in');
                addSystemMessage(
                  '⚠️ File uploaded to storage but metadata could not be saved. Please ensure you are logged in to persist files across sessions.',
                  'error'
                );
              }
            } else {
              try {
                const savedData = JSON.parse(responseText);
                console.log('[ChatSidebar] ✅ METADATA SAVED SUCCESSFULLY:', {
                  fileId: savedData.dataFile?.id,
                  hasCloudUrl: !!savedData.dataFile?.parquetUrl,
                  tableName: savedData.dataFile?.tableName,
                  response: savedData
                });
                // Save the database ID for the file
                databaseId = savedData.dataFile?.id;
              } catch (parseError) {
                console.error('[ChatSidebar] Failed to parse success response:', parseError);
              }
            }
          } catch (error) {
            console.error('[ChatSidebar] Error saving file metadata:', error);
            cloudSyncStatus = 'failed';  // Mark as failed on error
          }
        } else {
          // No workspace/pageId - files are local only
          cloudSyncStatus = 'failed';
        }
        
        // Now add the file to local store with database ID if available
        try {
          addDataFile({
            filename: file.name,
            tableName: processed.tableName,
            schema: schemaForStore,
            rowCount: processed.data.length,
            sizeBytes: file.size,
            databaseId: databaseId,  // Include database ID if we have one
          });
          console.log('[ChatSidebar] File added to local store:', {
            tableName: processed.tableName,
            hasDatabaseId: !!databaseId,
            databaseId: databaseId
          });
        } catch (error) {
          console.error('[ChatSidebar] Error adding file to local store:', error);
        }
        
        if (!isMountedRef.current) {
          console.warn('[ChatSidebar] Component unmounted, skipping addMessage');
          return;
        }
        
        console.log('[ChatSidebar] About to add system message for file load');
        try {
          // Create message with sync status indicator
          let statusEmoji = '';
          let statusText = '';
          
          if (cloudSyncStatus === 'success') {
            statusEmoji = '☁️';
            statusText = ' (synced to cloud)';
          } else if (cloudSyncStatus === 'failed') {
            statusEmoji = '💾';
            statusText = ' (saved locally)';
          }
          
          addMessage({
            role: 'system',
            content: `${statusEmoji} File "${file.name}" loaded with ${processed.data.length} rows${statusText}. Ready for querying!`,
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
      if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.pdf')) {
        await handleFileUpload(file);
      } else {
        addMessage({
          role: 'system',
          content: `File "${file.name}" is not supported. Please upload CSV, Excel, or PDF files.`,
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
          onFileRemove={async (fileId) => {
            const file = dataFiles.find(f => f.id === fileId);
            if (file) {
              // Remove from local store
              removeDataFile(fileId);
              
              // Remove from database if we have a workspace and database ID
              if (workspaceId && pageId && file.databaseId) {
                try {
                  const response = await fetch(`/api/data/files/${pageId}`, {
                    method: 'DELETE',
                    headers: { 
                      'Content-Type': 'application/json',
                      'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'include', // Ensure auth cookies are sent
                    body: JSON.stringify({ fileId: file.databaseId }),  // Use database ID for API
                  });
                  
                  if (!response.ok) {
                    console.error('[ChatSidebar] Failed to delete file from database');
                  }
                } catch (error) {
                  console.error('[ChatSidebar] Error deleting file:', error);
                }
              } else if (workspaceId && pageId && !file.databaseId) {
                console.log('[ChatSidebar] File has no database ID, skipping cloud deletion');
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
            <p className="text-sm">Upload CSV, Excel, or PDF files to start analyzing</p>
            <p className="text-xs mt-2">Click the + button or drag and drop files here</p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage 
              key={message.id} 
              message={message}
              onClarificationResponse={handleClarificationResponse}
              onFileSelect={handleFileSelect}
            />
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
      
      {/* File Disambiguation Dialog */}
      {disambiguationState && (
        <FileDisambiguationDialog
          matches={disambiguationState.matches}
          query={disambiguationState.query}
          onSelect={async (match) => {
            // Use the selected file and continue processing
            const selectedFile = match.file;
            setDisambiguationState(null);
            setLoading(true);
            
            try {
              const conversationHistory = messages.slice(-10).map(msg => ({
                role: msg.role,
                content: msg.content
              }));
              
              const result = await duckDBQuery.processNaturalLanguageQuery(
                disambiguationState.pendingMessage,
                [selectedFile],
                pageId,
                workspaceId,
                conversationHistory
              );
              
              // Process the result as normal
              if ((result.sqlGeneration as any).metadata) {
                const metadata = (result.sqlGeneration as any).metadata;
                tokenMonitor.recordUsage({
                  query: disambiguationState.pendingMessage,
                  model: metadata.model || 'gpt-4-turbo-preview',
                  contextTokens: metadata.contextTokens || 0,
                  responseTokens: metadata.tokensUsed || 0,
                  totalTokens: metadata.tokensUsed || 0,
                  truncated: false,
                  samplingStrategy: 'smart',
                });
              }
              
              // Build response content
              let responseContent = '';
              if ((result.sqlGeneration as any).dataContext) {
                responseContent += (result.sqlGeneration as any).dataContext + '\n\n';
              }
              responseContent += result.sqlGeneration.explanation;
              if ((result.sqlGeneration as any).insights) {
                responseContent += '\n\n' + (result.sqlGeneration as any).insights;
              }
              
              if (result.queryResult.success) {
                if (result.queryResult.data && result.queryResult.data.length > 0) {
                  responseContent += '\n\n### Results\n';
                  const formattedResults = duckDBQuery.formatResults(result.queryResult);
                  responseContent += formattedResults;
                  if (result.queryResult.executionTime) {
                    responseContent += `\n\n*Query executed in ${result.queryResult.executionTime.toFixed(2)}ms*`;
                  }
                } else {
                  responseContent += '\n\nNo results found for this query.';
                }
              } else {
                responseContent += '\n\n⚠️ **Error:** ' + result.queryResult.error;
              }
              
              // Add assistant response
              addMessage({
                role: 'assistant',
                content: responseContent,
                metadata: {
                  sql: result.sqlGeneration.sql,
                  error: result.queryResult.error,
                  dataFiles: result.sqlGeneration.tables,
                  usedTables: result.sqlGeneration.usedTables,
                },
              });
              
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
          }}
          onCancel={() => {
            setDisambiguationState(null);
            setLoading(false);
          }}
        />
      )}
    </div>
  );
}