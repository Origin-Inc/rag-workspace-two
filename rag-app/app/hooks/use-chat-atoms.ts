import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import {
  messagesAtom,
  dataFilesAtom,
  activePageIdAtom,
  isSidebarOpenAtom,
  isLoadingAtom,
  streamingMessageIdAtom,
  draftMessageAtom,
  connectionStatusAtom,
  currentPageMessagesAtom,
  currentPageDataFilesAtom,
  addMessageAtom,
  updateMessageAtom,
  clearMessagesAtom,
  addDataFileAtom,
  removeDataFileAtom,
  clearDataFilesAtom,
  batchAddMessagesAtom,
  batchSetDataFilesAtom,
  resetPageDataAtom,
  type ChatMessage,
  type DataFile,
} from '~/atoms/chat-atoms';

// Hook for messages - provides a Zustand-like interface
export function useChatMessages(pageId?: string) {
  const [messages, setMessages] = useAtom(messagesAtom);
  const currentMessages = useAtomValue(currentPageMessagesAtom);
  const addMessage = useSetAtom(addMessageAtom);
  const updateMessage = useSetAtom(updateMessageAtom);
  const clearMessages = useSetAtom(clearMessagesAtom);
  const batchAddMessages = useSetAtom(batchAddMessagesAtom);
  
  // Get messages for specific page or current page
  const pageMessages = useMemo(() => {
    if (pageId) {
      return messages[pageId] || [];
    }
    return currentMessages;
  }, [messages, currentMessages, pageId]);
  
  // Wrapped actions with pageId binding
  const actions = useMemo(() => ({
    addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
      const targetPageId = pageId || message.pageId;
      if (!targetPageId) {
        console.warn('No pageId provided for addMessage');
        return;
      }
      return addMessage({ pageId: targetPageId, message });
    },
    
    updateMessage: (messageId: string, updates: Partial<ChatMessage>) => {
      const targetPageId = pageId || updates.pageId;
      if (!targetPageId) {
        console.warn('No pageId provided for updateMessage');
        return;
      }
      updateMessage({ pageId: targetPageId, messageId, updates });
    },
    
    clearMessages: () => {
      if (!pageId) {
        console.warn('No pageId provided for clearMessages');
        return;
      }
      clearMessages(pageId);
    },
    
    batchAddMessages: (newMessages: Omit<ChatMessage, 'id' | 'timestamp'>[]) => {
      if (!pageId) {
        console.warn('No pageId provided for batchAddMessages');
        return;
      }
      return batchAddMessages({ pageId, messages: newMessages });
    },
  }), [pageId, addMessage, updateMessage, clearMessages, batchAddMessages]);
  
  return {
    messages: pageMessages,
    ...actions,
  };
}

// Hook for data files - provides a Zustand-like interface
export function useChatDataFiles(pageId?: string) {
  const [dataFiles, setDataFiles] = useAtom(dataFilesAtom);
  const currentFiles = useAtomValue(currentPageDataFilesAtom);
  const addDataFile = useSetAtom(addDataFileAtom);
  const removeDataFile = useSetAtom(removeDataFileAtom);
  const clearDataFiles = useSetAtom(clearDataFilesAtom);
  const batchSetDataFiles = useSetAtom(batchSetDataFilesAtom);
  
  // Get files for specific page or current page
  const pageFiles = useMemo(() => {
    if (pageId) {
      return dataFiles[pageId] || [];
    }
    return currentFiles;
  }, [dataFiles, currentFiles, pageId]);
  
  // Wrapped actions with pageId binding
  const actions = useMemo(() => ({
    addDataFile: (file: Omit<DataFile, 'id' | 'uploadedAt'>) => {
      const targetPageId = pageId || file.pageId;
      if (!targetPageId) {
        console.warn('No pageId provided for addDataFile');
        return;
      }
      return addDataFile({ pageId: targetPageId, file });
    },
    
    removeDataFile: (fileId: string) => {
      if (!pageId) {
        console.warn('No pageId provided for removeDataFile');
        return;
      }
      removeDataFile({ pageId, fileId });
    },
    
    clearDataFiles: () => {
      if (!pageId) {
        console.warn('No pageId provided for clearDataFiles');
        return;
      }
      clearDataFiles(pageId);
    },
    
    setDataFiles: (files: DataFile[]) => {
      if (!pageId) {
        console.warn('No pageId provided for setDataFiles');
        return;
      }
      batchSetDataFiles({ pageId, files });
    },
  }), [pageId, addDataFile, removeDataFile, clearDataFiles, batchSetDataFiles]);
  
  return {
    dataFiles: pageFiles,
    ...actions,
  };
}

// Hook for global chat state
export function useChatState() {
  const [activePageId, setActivePageId] = useAtom(activePageIdAtom);
  const [isSidebarOpen, setIsSidebarOpen] = useAtom(isSidebarOpenAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const [streamingMessageId, setStreamingMessageId] = useAtom(streamingMessageIdAtom);
  const [draftMessage, setDraftMessage] = useAtom(draftMessageAtom);
  const [connectionStatus, setConnectionStatus] = useAtom(connectionStatusAtom);
  const resetPageData = useSetAtom(resetPageDataAtom);
  
  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, [setIsSidebarOpen]);
  
  const setSidebarOpen = useCallback((open: boolean) => {
    setIsSidebarOpen(open);
  }, [setIsSidebarOpen]);
  
  return {
    activePageId,
    setActivePageId,
    isSidebarOpen,
    toggleSidebar,
    setSidebarOpen,
    isLoading,
    setLoading: setIsLoading,
    streamingMessageId,
    setStreamingMessageId,
    draftMessage,
    setDraftMessage,
    connectionStatus,
    setConnectionStatus,
    resetPageData,
  };
}

// Combined hook for full chat functionality (similar to the old Zustand store)
export function useChat(pageId?: string) {
  const messages = useChatMessages(pageId);
  const dataFiles = useChatDataFiles(pageId);
  const state = useChatState();
  
  return {
    ...messages,
    ...dataFiles,
    ...state,
  };
}