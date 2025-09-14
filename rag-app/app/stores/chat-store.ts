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

interface ChatState {
  // State
  messages: Map<string, ChatMessage[]>; // pageId -> messages
  dataFiles: Map<string, DataFile[]>; // pageId -> files
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
  
  // Getters
  getMessagesForPage: (pageId: string) => ChatMessage[];
  getDataFilesForPage: (pageId: string) => DataFile[];
  getLatestMessage: (pageId: string) => ChatMessage | undefined;
}

export const useChatStore = create<ChatState>()((set, get) => ({
      // Initial state
      messages: new Map(),
      dataFiles: new Map(),
      activePageId: null,
      isSidebarOpen: false,
      isLoading: false,
      streamingMessageId: null,
      draftMessage: '',
      connectionStatus: 'disconnected',
      
      // Message actions
      addMessage: (pageId, message) => set((state) => {
        const messages = new Map(state.messages);
        const pageMessages = messages.get(pageId) || [];
        const newMessage: ChatMessage = {
          ...message,
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          pageId,
          timestamp: new Date(),
        };
        messages.set(pageId, [...pageMessages, newMessage]);
        return { messages };
      }),
      
      updateMessage: (pageId, messageId, updates) => set((state) => {
        const messages = new Map(state.messages);
        const pageMessages = messages.get(pageId) || [];
        const updatedMessages = pageMessages.map(msg => 
          msg.id === messageId ? { ...msg, ...updates } : msg
        );
        messages.set(pageId, updatedMessages);
        return { messages };
      }),
      
      deleteMessage: (pageId, messageId) => set((state) => {
        const messages = new Map(state.messages);
        const pageMessages = messages.get(pageId) || [];
        messages.set(pageId, pageMessages.filter(msg => msg.id !== messageId));
        return { messages };
      }),
      
      clearMessages: (pageId) => set((state) => {
        const messages = new Map(state.messages);
        messages.delete(pageId);
        return { messages };
      }),
      
      // File actions
      addDataFile: (pageId, file) => set((state) => {
        const dataFiles = new Map(state.dataFiles);
        const pageFiles = dataFiles.get(pageId) || [];
        const newFile: DataFile = {
          ...file,
          id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          pageId,
          uploadedAt: new Date(),
        };
        dataFiles.set(pageId, [...pageFiles, newFile]);
        return { dataFiles };
      }),
      
      removeDataFile: (pageId, fileId) => set((state) => {
        const dataFiles = new Map(state.dataFiles);
        const pageFiles = dataFiles.get(pageId) || [];
        dataFiles.set(pageId, pageFiles.filter(file => file.id !== fileId));
        return { dataFiles };
      }),
      
      clearDataFiles: (pageId) => set((state) => {
        const dataFiles = new Map(state.dataFiles);
        dataFiles.delete(pageId);
        return { dataFiles };
      }),
      
      // UI actions
      setActivePageId: (pageId) => set({ activePageId: pageId }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
      
      // Status actions
      setLoading: (loading) => set({ isLoading: loading }),
      setStreamingMessageId: (messageId) => set({ streamingMessageId: messageId }),
      setDraftMessage: (message) => set({ draftMessage: message }),
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      
      // Getters
      getMessagesForPage: (pageId) => {
        const state = get();
        return state.messages.get(pageId) || [];
      },
      
      getDataFilesForPage: (pageId) => {
        const state = get();
        return state.dataFiles.get(pageId) || [];
      },
      
      getLatestMessage: (pageId) => {
        const state = get();
        const messages = state.messages.get(pageId) || [];
        return messages[messages.length - 1];
      },
}));

// Hooks for specific state slices
export const useChatMessages = (pageId: string) => {
  // Use shallow comparison to prevent re-renders from new array references
  const { messages, addMessage, updateMessage, deleteMessage, clearMessages } = useChatStore(
    (state) => ({
      messages: state.messages.get(pageId) || [],
      addMessage: state.addMessage,
      updateMessage: state.updateMessage,
      deleteMessage: state.deleteMessage,
      clearMessages: state.clearMessages,
    }),
    shallow
  );
  
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
  // Use shallow comparison to prevent re-renders from new array references
  const { dataFiles, addDataFile, removeDataFile, clearDataFiles } = useChatStore(
    (state) => ({
      dataFiles: state.dataFiles.get(pageId) || [],
      addDataFile: state.addDataFile,
      removeDataFile: state.removeDataFile,
      clearDataFiles: state.clearDataFiles,
    }),
    shallow
  );
  
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