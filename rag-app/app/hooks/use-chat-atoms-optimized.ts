import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import {
  pageMessagesFamily,
  pageDataFilesFamily,
  pageLoadingFamily,
  pageStreamingMessageFamily,
  pageDraftMessageFamily,
  pageMessageCountFamily,
  pageFileCountFamily,
  addMessageActionFamily,
  batchAddMessagesActionFamily,
  clearMessagesActionFamily,
  updateMessageActionFamily,
  addFileActionFamily,
  removeFileActionFamily,
  setFilesActionFamily,
  resetPageDataActionFamily,
  isSidebarOpenAtom,
  connectionStatusAtom,
  type ChatMessage,
  type DataFile,
} from '~/atoms/chat-atoms-optimized';

// ============= OPTIMIZED HOOKS =============

/**
 * Hook for chat messages - optimized to prevent re-renders
 * Only subscribes to the specific page's messages
 */
export function useChatMessagesOptimized(pageId: string) {
  // Read-only subscriptions
  const messages = useAtomValue(pageMessagesFamily(pageId));
  const messageCount = useAtomValue(pageMessageCountFamily(pageId));
  
  // Write-only actions (no subscriptions, stable references)
  const addMessageAction = useSetAtom(addMessageActionFamily(pageId));
  const batchAddMessagesAction = useSetAtom(batchAddMessagesActionFamily(pageId));
  const clearMessagesAction = useSetAtom(clearMessagesActionFamily(pageId));
  const updateMessageAction = useSetAtom(updateMessageActionFamily(pageId));
  
  // Stable callbacks that never change
  const addMessage = useCallback(
    (message: Omit<ChatMessage, 'id' | 'timestamp' | 'pageId'>) => {
      return addMessageAction({ ...message, pageId });
    },
    [addMessageAction, pageId]
  );
  
  const batchAddMessages = useCallback(
    (messages: Omit<ChatMessage, 'id' | 'timestamp' | 'pageId'>[]) => {
      const messagesWithPageId = messages.map(m => ({ ...m, pageId }));
      return batchAddMessagesAction(messagesWithPageId);
    },
    [batchAddMessagesAction, pageId]
  );
  
  const clearMessages = useCallback(
    () => clearMessagesAction(),
    [clearMessagesAction]
  );
  
  const updateMessage = useCallback(
    (messageId: string, updates: Partial<ChatMessage>) => {
      updateMessageAction({ messageId, updates });
    },
    [updateMessageAction]
  );
  
  return {
    messages,
    messageCount,
    addMessage,
    batchAddMessages,
    clearMessages,
    updateMessage,
  };
}

/**
 * Hook for data files - optimized to prevent re-renders
 * Only subscribes to the specific page's files
 */
export function useChatDataFilesOptimized(pageId: string) {
  // Read-only subscriptions
  const dataFiles = useAtomValue(pageDataFilesFamily(pageId));
  const fileCount = useAtomValue(pageFileCountFamily(pageId));
  
  // Write-only actions (no subscriptions, stable references)
  const addFileAction = useSetAtom(addFileActionFamily(pageId));
  const removeFileAction = useSetAtom(removeFileActionFamily(pageId));
  const setFilesAction = useSetAtom(setFilesActionFamily(pageId));
  
  // Stable callbacks
  const addDataFile = useCallback(
    (file: Omit<DataFile, 'id' | 'uploadedAt' | 'pageId'>) => {
      return addFileAction({ ...file, pageId });
    },
    [addFileAction, pageId]
  );
  
  const removeDataFile = useCallback(
    (fileId: string) => removeFileAction(fileId),
    [removeFileAction]
  );
  
  const setDataFiles = useCallback(
    (files: DataFile[]) => setFilesAction(files),
    [setFilesAction]
  );
  
  return {
    dataFiles,
    fileCount,
    addDataFile,
    removeDataFile,
    setDataFiles,
  };
}

/**
 * Hook for page-specific loading state
 */
export function useChatLoadingOptimized(pageId: string) {
  // Split reading and writing to prevent re-renders
  const isLoading = useAtomValue(pageLoadingFamily(pageId));
  const setLoadingAtom = useSetAtom(pageLoadingFamily(pageId));
  
  const setLoading = useCallback(
    (loading: boolean) => setLoadingAtom(loading),
    [setLoadingAtom]
  );
  
  return { isLoading, setLoading };
}

/**
 * Hook for page-specific streaming state
 */
export function useChatStreamingOptimized(pageId: string) {
  const streamingMessageId = useAtomValue(pageStreamingMessageFamily(pageId));
  const setStreamingMessageIdAtom = useSetAtom(pageStreamingMessageFamily(pageId));
  
  const setStreamingMessageId = useCallback(
    (id: string | null) => setStreamingMessageIdAtom(id),
    [setStreamingMessageIdAtom]
  );
  
  return { streamingMessageId, setStreamingMessageId };
}

/**
 * Hook for page-specific draft message
 */
export function useChatDraftOptimized(pageId: string) {
  const draftMessage = useAtomValue(pageDraftMessageFamily(pageId));
  const setDraftMessageAtom = useSetAtom(pageDraftMessageFamily(pageId));
  
  const setDraftMessage = useCallback(
    (draft: string) => setDraftMessageAtom(draft),
    [setDraftMessageAtom]
  );
  
  return { draftMessage, setDraftMessage };
}

/**
 * Hook for sidebar state (global)
 */
export function useChatSidebarOptimized() {
  const isSidebarOpen = useAtomValue(isSidebarOpenAtom);
  const setSidebarOpenAtom = useSetAtom(isSidebarOpenAtom);
  
  const setSidebarOpen = useCallback(
    (open: boolean) => setSidebarOpenAtom(open),
    [setSidebarOpenAtom]
  );
  
  const toggleSidebar = useCallback(
    () => setSidebarOpenAtom(prev => !prev),
    [setSidebarOpenAtom]
  );
  
  return { isSidebarOpen, setSidebarOpen, toggleSidebar };
}

/**
 * Hook for connection status (global)
 */
export function useConnectionStatusOptimized() {
  const connectionStatus = useAtomValue(connectionStatusAtom);
  const setConnectionStatusAtom = useSetAtom(connectionStatusAtom);
  
  const setConnectionStatus = useCallback(
    (status: 'connected' | 'disconnected' | 'connecting') => setConnectionStatusAtom(status),
    [setConnectionStatusAtom]
  );
  
  return { connectionStatus, setConnectionStatus };
}

/**
 * Hook to reset all page data
 */
export function useResetPageDataOptimized(pageId: string) {
  const resetPageData = useSetAtom(resetPageDataActionFamily(pageId));
  
  return useCallback(
    () => resetPageData(),
    [resetPageData]
  );
}

/**
 * Combined hook for all chat functionality - use sparingly
 * Prefer using individual hooks to minimize re-renders
 */
export function useChatOptimized(pageId: string) {
  const messages = useChatMessagesOptimized(pageId);
  const dataFiles = useChatDataFilesOptimized(pageId);
  const loading = useChatLoadingOptimized(pageId);
  const streaming = useChatStreamingOptimized(pageId);
  const draft = useChatDraftOptimized(pageId);
  const sidebar = useChatSidebarOptimized();
  const connection = useConnectionStatusOptimized();
  const resetPageData = useResetPageDataOptimized(pageId);
  
  return {
    ...messages,
    ...dataFiles,
    ...loading,
    ...streaming,
    ...draft,
    ...sidebar,
    ...connection,
    resetPageData,
  };
}