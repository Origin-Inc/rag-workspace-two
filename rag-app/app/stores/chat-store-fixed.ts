import { create } from 'zustand';
import { shallow } from 'zustand/shallow';

export interface ChatMessage {
  id: string;
  pageId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    sql?: string;
    chartType?: string;
    blockId?: string;
    error?: string;
    dataFiles?: string[];
  };
  timestamp: Date;
  isStreaming?: boolean;
}

export interface DataFile {
  id: string;
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
}

// Use plain objects instead of Maps for better compatibility
interface ChatState {
  // State - using objects instead of Maps
  messages: Record<string, ChatMessage[]>; // pageId -> messages
  dataFiles: Record<string, DataFile[]>; // pageId -> files
  activePageId: string | null;
  isSidebarOpen: boolean;
  isLoading: boolean;
  streamingMessageId: string | null;
  draftMessage: string;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  
  // Actions
  addMessage: (pageId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateMessage: (pageId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  deleteMessage: (pageId: string, messageId: string) => void;
  clearMessages: (pageId: string) => void;
  
  addDataFile: (pageId: string, file: Omit<DataFile, 'id' | 'uploadedAt'>) => void;
  removeDataFile: (pageId: string, fileId: string) => void;
  clearDataFiles: (pageId: string) => void;
  
  setActivePageId: (pageId: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  
  setLoading: (loading: boolean) => void;
  setStreamingMessageId: (messageId: string | null) => void;
  setDraftMessage: (message: string) => void;
  setConnectionStatus: (status: 'connected' | 'disconnected' | 'connecting') => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  // Initial state - using plain objects
  messages: {},
  dataFiles: {},
  activePageId: null,
  isSidebarOpen: false,
  isLoading: false,
  streamingMessageId: null,
  draftMessage: '',
  connectionStatus: 'disconnected',
  
  // Message actions - properly handling immutability
  addMessage: (pageId, message) => set((state) => {
    const pageMessages = state.messages[pageId] || [];
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pageId,
      timestamp: new Date(),
    };
    
    return {
      messages: {
        ...state.messages,
        [pageId]: [...pageMessages, newMessage],
      },
    };
  }),
  
  updateMessage: (pageId, messageId, updates) => set((state) => {
    const pageMessages = state.messages[pageId] || [];
    return {
      messages: {
        ...state.messages,
        [pageId]: pageMessages.map(msg => 
          msg.id === messageId ? { ...msg, ...updates } : msg
        ),
      },
    };
  }),
  
  deleteMessage: (pageId, messageId) => set((state) => {
    const pageMessages = state.messages[pageId] || [];
    return {
      messages: {
        ...state.messages,
        [pageId]: pageMessages.filter(msg => msg.id !== messageId),
      },
    };
  }),
  
  clearMessages: (pageId) => set((state) => ({
    messages: {
      ...state.messages,
      [pageId]: [],
    },
  })),
  
  // Data file actions
  addDataFile: (pageId, file) => set((state) => {
    const pageFiles = state.dataFiles[pageId] || [];
    const newFile: DataFile = {
      ...file,
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pageId,
      uploadedAt: new Date(),
    };
    
    return {
      dataFiles: {
        ...state.dataFiles,
        [pageId]: [...pageFiles, newFile],
      },
    };
  }),
  
  removeDataFile: (pageId, fileId) => set((state) => {
    const pageFiles = state.dataFiles[pageId] || [];
    return {
      dataFiles: {
        ...state.dataFiles,
        [pageId]: pageFiles.filter(file => file.id !== fileId),
      },
    };
  }),
  
  clearDataFiles: (pageId) => set((state) => ({
    dataFiles: {
      ...state.dataFiles,
      [pageId]: [],
    },
  })),
  
  // UI state actions
  setActivePageId: (pageId) => set({ activePageId: pageId }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  
  // Status actions
  setLoading: (loading) => set({ isLoading: loading }),
  setStreamingMessageId: (messageId) => set({ streamingMessageId: messageId }),
  setDraftMessage: (message) => set({ draftMessage: message }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
}));

// Hooks with proper selectors to prevent re-renders
export const useChatMessages = (pageId: string) => {
  const messages = useChatStore((state) => state.messages[pageId] || []);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const clearMessages = useChatStore((state) => state.clearMessages);
  
  return {
    messages,
    addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp' | 'pageId'>) => 
      addMessage(pageId, message),
    updateMessage: (messageId: string, updates: Partial<ChatMessage>) => 
      updateMessage(pageId, messageId, updates),
    deleteMessage: (messageId: string) => deleteMessage(pageId, messageId),
    clearMessages: () => clearMessages(pageId),
  };
};

export const useChatDataFiles = (pageId: string) => {
  const dataFiles = useChatStore((state) => state.dataFiles[pageId] || []);
  const addDataFile = useChatStore((state) => state.addDataFile);
  const removeDataFile = useChatStore((state) => state.removeDataFile);
  const clearDataFiles = useChatStore((state) => state.clearDataFiles);
  
  return {
    dataFiles,
    addDataFile: (file: Omit<DataFile, 'id' | 'uploadedAt' | 'pageId'>) => 
      addDataFile(pageId, file),
    removeDataFile: (fileId: string) => removeDataFile(pageId, fileId),
    clearDataFiles: () => clearDataFiles(pageId),
  };
};

export const useChatSidebar = () => {
  const isSidebarOpen = useChatStore((state) => state.isSidebarOpen);
  const toggleSidebar = useChatStore((state) => state.toggleSidebar);
  const setSidebarOpen = useChatStore((state) => state.setSidebarOpen);
  
  return {
    isSidebarOpen,
    toggleSidebar,
    setSidebarOpen,
  };
};

export const useChatConnection = () => {
  const connectionStatus = useChatStore((state) => state.connectionStatus);
  const setConnectionStatus = useChatStore((state) => state.setConnectionStatus);
  const isLoading = useChatStore((state) => state.isLoading);
  const setLoading = useChatStore((state) => state.setLoading);
  
  return {
    connectionStatus,
    setConnectionStatus,
    isLoading,
    setLoading,
  };
};