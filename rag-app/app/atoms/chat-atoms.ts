import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export interface ChatMessage {
  id: string;
  pageId: string;
  role: 'user' | 'assistant' | 'system' | 'clarification' | 'not-found';
  content: string;
  metadata?: {
    sql?: string;
    chartType?: string;
    blockId?: string;
    error?: string;
    dataFiles?: string[];
    usedTables?: Array<{
      name: string;
      filename: string;
      fileId?: string;
      columnsUsed?: string[];
      rowsAccessed?: number;
    }>;
    // Task 56.1: New metadata fields for block generation
    queryIntent?: 'data_visualization' | 'general_chat';
    generatedSQL?: string;
    queryResultsSummary?: {
      rowCount: number;
      columns: string[];
      sampleRows: any[];
    };
    generatedChart?: {
      type: string;
      data: any;
      title: string;
      confidence: number;
      description?: string;
    };
    generatedTable?: {
      columns: string[];
      rows: any[];
      title: string;
    };
    queryExecution?: {
      executionTime: number;
      rowsReturned: number;
      timestamp: string;
    };
    // For clarification messages
    clarificationData?: {
      match?: any; // FileMatchResult - optional for smart clarifications
      query: string;
      pendingMessage?: string;
    };
    // For smart clarifications (non-file specific)
    smartClarification?: {
      message: string;
      suggestions?: string[];
    };
    // For not-found messages
    notFoundData?: {
      query: string;
      availableFiles: DataFile[];
      suggestions?: any[]; // FileMatchResult[]
    };
  };
  timestamp: Date;
  isStreaming?: boolean;
}

export interface DataFile {
  id: string;  // Temporary ID for UI tracking
  databaseId?: string;  // UUID from database (when file is persisted to cloud)
  pageId: string;
  filename: string;
  tableName: string;
  schema: Array<{
    name: string;
    type: string;
    sampleData?: any[];
  }>;
  rowCount: number;
  sizeBytes: number;
  uploadedAt: Date;
  // Sync status properties
  syncStatus?: 'synced' | 'syncing' | 'failed' | 'local-only';
  storageUrl?: string | null;
  parquetUrl?: string | null;
  source?: 'indexeddb' | 'cloud' | 'both';
  cloudSyncFailed?: boolean;
  restoreFailed?: boolean;
  updatedAt?: string;
}

// Core atoms - these are the source of truth
export const messagesAtom = atom<Record<string, ChatMessage[]>>({});
export const dataFilesAtom = atom<Record<string, DataFile[]>>({});
export const activePageIdAtom = atom<string | null>(null);
export const isSidebarOpenAtom = atomWithStorage<boolean>('chat-sidebar-open', false);
export const isLoadingAtom = atom<boolean>(false);
export const streamingMessageIdAtom = atom<string | null>(null);
export const draftMessageAtom = atom<string>('');
export const connectionStatusAtom = atom<'connected' | 'disconnected' | 'connecting'>('disconnected');

// Derived atoms for reading page-specific data
export const currentPageMessagesAtom = atom((get) => {
  const pageId = get(activePageIdAtom);
  if (!pageId) return [];
  const messages = get(messagesAtom);
  return messages[pageId] || [];
});

export const currentPageDataFilesAtom = atom((get) => {
  const pageId = get(activePageIdAtom);
  if (!pageId) return [];
  const files = get(dataFilesAtom);
  return files[pageId] || [];
});

// Write atoms for actions
export const addMessageAtom = atom(
  null,
  (get, set, { pageId, message }: { pageId: string; message: Omit<ChatMessage, 'id' | 'timestamp'> }) => {
    const messages = get(messagesAtom);
    const pageMessages = messages[pageId] || [];
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pageId,
      timestamp: new Date(),
    };
    
    set(messagesAtom, {
      ...messages,
      [pageId]: [...pageMessages, newMessage],
    });
    
    return newMessage;
  }
);

export const updateMessageAtom = atom(
  null,
  (get, set, { pageId, messageId, updates }: { pageId: string; messageId: string; updates: Partial<ChatMessage> }) => {
    const messages = get(messagesAtom);
    const pageMessages = messages[pageId];
    if (!pageMessages) return;
    
    const messageIndex = pageMessages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    const updatedMessages = [...pageMessages];
    const existingMessage = updatedMessages[messageIndex];
    if (!existingMessage) return;
    
    updatedMessages[messageIndex] = {
      ...existingMessage,
      ...updates,
      // Ensure required fields are preserved
      id: existingMessage.id,
      pageId: existingMessage.pageId,
      role: updates.role ?? existingMessage.role,
      content: updates.content ?? existingMessage.content,
      timestamp: existingMessage.timestamp,
    } as ChatMessage;
    
    set(messagesAtom, {
      ...messages,
      [pageId]: updatedMessages,
    });
  }
);

export const clearMessagesAtom = atom(
  null,
  (get, set, pageId: string) => {
    const messages = get(messagesAtom);
    set(messagesAtom, {
      ...messages,
      [pageId]: [],
    });
  }
);

export const deleteMessageAtom = atom(
  null,
  (get, set, { pageId, messageId }: { pageId: string; messageId: string }) => {
    const messages = get(messagesAtom);
    const pageMessages = messages[pageId];
    if (!pageMessages) return;
    
    set(messagesAtom, {
      ...messages,
      [pageId]: pageMessages.filter(m => m.id !== messageId),
    });
  }
);

// Batch operations for efficient updates
export const batchAddMessagesAtom = atom(
  null,
  (get, set, { pageId, messages: newMessages }: { pageId: string; messages: Omit<ChatMessage, 'id' | 'timestamp'>[] }) => {
    const allMessages = get(messagesAtom);
    const pageMessages = allMessages[pageId] || [];
    
    const messagesWithIds = newMessages.map(msg => ({
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pageId,
      timestamp: new Date(),
    }));
    
    set(messagesAtom, {
      ...allMessages,
      [pageId]: [...pageMessages, ...messagesWithIds],
    });
    
    return messagesWithIds;
  }
);

// Data file operations
export const addDataFileAtom = atom(
  null,
  (get, set, { pageId, file }: { pageId: string; file: Omit<DataFile, 'id' | 'uploadedAt'> }) => {
    const files = get(dataFilesAtom);
    const pageFiles = files[pageId] || [];
    const newFile: DataFile = {
      ...file,
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      uploadedAt: new Date(),
    };
    
    set(dataFilesAtom, {
      ...files,
      [pageId]: [...pageFiles, newFile],
    });
    
    return newFile;
  }
);

export const removeDataFileAtom = atom(
  null,
  (get, set, { pageId, fileId }: { pageId: string; fileId: string }) => {
    const files = get(dataFilesAtom);
    const pageFiles = files[pageId];
    if (!pageFiles) return;
    
    set(dataFilesAtom, {
      ...files,
      [pageId]: pageFiles.filter(f => f.id !== fileId),
    });
  }
);

export const clearDataFilesAtom = atom(
  null,
  (get, set, pageId: string) => {
    const files = get(dataFilesAtom);
    set(dataFilesAtom, {
      ...files,
      [pageId]: [],
    });
  }
);

// Batch update for data files (for efficient cloud sync)
export const batchSetDataFilesAtom = atom(
  null,
  (get, set, { pageId, files }: { pageId: string; files: DataFile[] }) => {
    const allFiles = get(dataFilesAtom);
    set(dataFilesAtom, {
      ...allFiles,
      [pageId]: files,
    });
  }
);

// Compound operations
export const resetPageDataAtom = atom(
  null,
  (get, set, pageId: string) => {
    // Clear both messages and files in a single update
    const messages = get(messagesAtom);
    const files = get(dataFilesAtom);
    
    set(messagesAtom, {
      ...messages,
      [pageId]: [],
    });
    
    set(dataFilesAtom, {
      ...files,
      [pageId]: [],
    });
  }
);