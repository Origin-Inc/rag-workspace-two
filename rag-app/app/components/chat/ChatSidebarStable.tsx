import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import { cn } from '~/utils/cn';

interface ChatSidebarStableProps {
  pageId: string;
  workspaceId?: string;
  className?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface DataFile {
  id: string;
  filename: string;
  tableName: string;
  rowCount: number;
  schema?: Array<{
    name: string;
    type: string;
    sampleData?: any[];
  }>;
}

// STABLE VERSION - No Zustand, no complex state management
export function ChatSidebarStable({ 
  pageId, 
  workspaceId,
  className 
}: ChatSidebarStableProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dataFiles, setDataFiles] = useState<DataFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  
  // Load messages on mount - simple, no complex dependencies
  useEffect(() => {
    if (!pageId) return;
    
    let mounted = true;
    
    const loadData = async () => {
      try {
        // Load messages
        const msgResponse = await fetch(`/api/chat/messages/${pageId}`);
        if (msgResponse.ok && mounted) {
          const msgData = await msgResponse.json();
          if (msgData.messages) {
            setMessages(msgData.messages.map((m: any) => ({
              id: m.id || `msg_${Date.now()}_${Math.random()}`,
              role: m.role,
              content: m.content
            })));
          }
        }
        
        // Load files metadata
        const fileResponse = await fetch(`/api/data/files/${pageId}`);
        if (fileResponse.ok && mounted) {
          const fileData = await fileResponse.json();
          if (fileData.dataFiles) {
            setDataFiles(fileData.dataFiles.map((f: any) => ({
              id: f.id,
              filename: f.filename,
              tableName: f.tableName,
              rowCount: f.rowCount,
              schema: f.schema
            })));
            
            // Add info message about files
            if (fileData.dataFiles.length > 0) {
              setMessages(prev => [...prev, {
                id: `system_${Date.now()}`,
                role: 'system',
                content: `Found ${fileData.dataFiles.length} file(s) from previous session. Please re-upload files to enable querying.`
              }]);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    
    loadData();
    
    return () => {
      mounted = false;
    };
  }, [pageId]);
  
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    
    const content = inputValue;
    setInputValue('');
    
    // Add user message
    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content
    };
    setMessages(prev => [...prev, userMessage]);
    
    setIsLoading(true);
    try {
      // Save to database
      await fetch(`/api/chat/messages/${pageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'user',
          content,
        }),
      });
      
      // Process with DuckDB if files are available
      if (dataFiles.length > 0) {
        const { duckDBQuery } = await import('~/services/duckdb/duckdb-query.client');
        
        // Convert our simple files to the format DuckDB expects
        const filesForQuery = dataFiles.map(f => ({
          ...f,
          pageId,
          schema: f.schema || [],
          sizeBytes: 0,
          uploadedAt: new Date()
        }));
        
        const result = await duckDBQuery.processNaturalLanguageQuery(
          content,
          filesForQuery,
          pageId,
          workspaceId
        );
        
        // Build response
        let responseContent = result.sqlGeneration.explanation;
        if (result.queryResult.success && result.queryResult.data) {
          responseContent += '\n\n### Results\n';
          responseContent += duckDBQuery.formatResults(result.queryResult);
        }
        
        const assistantMessage: Message = {
          id: `msg_${Date.now()}_assistant`,
          role: 'assistant',
          content: responseContent
        };
        setMessages(prev => [...prev, assistantMessage]);
        
        // Save assistant message
        await fetch(`/api/chat/messages/${pageId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'assistant',
            content: responseContent,
          }),
        });
      } else {
        // No files available
        const assistantMessage: Message = {
          id: `msg_${Date.now()}_assistant`,
          role: 'assistant',
          content: 'Please upload data files first to start querying.'
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Failed to process message:', error);
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process message'}`
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        role: 'system',
        content: `File "${file.name}" is not supported. Please upload CSV or Excel files.`
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }
    
    setIsLoading(true);
    try {
      // Process file locally
      const { FileProcessingService } = await import('~/services/file-processing.client');
      const { getDuckDB } = await import('~/services/duckdb/duckdb-service.client');
      
      const processed = await FileProcessingService.processFile(file);
      const duckdb = getDuckDB();
      
      if (!duckdb.isReady()) {
        await duckdb.initialize();
      }
      
      await duckdb.createTableFromData(
        processed.tableName,
        processed.data,
        processed.schema
      );
      
      // Convert schema to the format expected
      const schemaForStore = processed.schema.columns.map((col: any) => ({
        name: col.name,
        type: col.type,
        sampleData: processed.data.slice(0, 3).map((row: any) => row[col.name])
      }));
      
      // Add to our simple files list
      const newFile: DataFile = {
        id: `file_${Date.now()}`,
        filename: file.name,
        tableName: processed.tableName,
        rowCount: processed.data.length,
        schema: schemaForStore
      };
      setDataFiles(prev => [...prev, newFile]);
      
      // Save metadata if we have workspace
      if (workspaceId && pageId) {
        try {
          await fetch(`/api/data/files/${pageId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              tableName: processed.tableName,
              schema: schemaForStore,
              rowCount: processed.data.length,
              sizeBytes: file.size,
              storageUrl: null,
            }),
          });
        } catch (error) {
          console.error('Failed to save file metadata:', error);
        }
      }
      
      const successMessage: Message = {
        id: `msg_${Date.now()}_success`,
        role: 'system',
        content: `File "${file.name}" loaded with ${processed.data.length} rows. Ready for querying!`
      };
      setMessages(prev => [...prev, successMessage]);
      
    } catch (error) {
      console.error('Error processing file:', error);
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        role: 'system',
        content: `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-4 bottom-4 bg-blue-600 text-white rounded-full p-3 shadow-lg hover:bg-blue-700 z-40 transition-colors"
        aria-label="Open chat"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
    );
  }
  
  return (
    <div 
      className={cn(
        "fixed right-0 top-0 h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col",
        "transition-transform duration-300 ease-in-out z-50",
        isOpen ? "translate-x-0" : "translate-x-full",
        className
      )}
      style={{ width: '400px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold">Data Chat</h2>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      
      {/* Files */}
      {dataFiles.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data Files</div>
          <div className="space-y-1">
            {dataFiles.map(file => (
              <div key={file.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 dark:text-gray-300">{file.filename}</span>
                <span className="text-gray-500">{file.rowCount} rows</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-sm">Upload CSV or Excel files to start</p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={cn(
              "p-3 rounded-lg text-sm",
              message.role === 'user' ? "bg-blue-50 dark:bg-blue-900/20 ml-auto max-w-[80%]" :
              message.role === 'assistant' ? "bg-gray-50 dark:bg-gray-800 mr-auto max-w-[80%]" :
              "bg-yellow-50 dark:bg-yellow-900/20 text-center italic"
            )}>
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ))
        )}
      </div>
      
      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            disabled={isLoading}
            placeholder={dataFiles.length === 0 ? "Upload data first..." : "Ask about your data..."}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
          />
          
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              disabled={isLoading}
              className="hidden"
            />
            <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
              <Upload className="w-5 h-5" />
            </div>
          </label>
          
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !inputValue.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}