import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';

// Types
export interface ChatMessage {
  id: string;
  pageId: string;
  role: 'user' | 'assistant' | 'system' | 'clarification' | 'not-found';
  content: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface DataFile {
  id: string;
  databaseId?: string;
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
  syncStatus?: 'synced' | 'syncing' | 'failed' | 'local-only';
  storageUrl?: string | null;
  parquetUrl?: string | null;
  source?: 'indexeddb' | 'cloud' | 'both';
}

// ============= OPTIMIZED ATOM ARCHITECTURE =============

// Use atom families for page-specific data to prevent global updates
export const pageMessagesFamily = atomFamily(
  (pageId: string) => atom<ChatMessage[]>([]),
  (a, b) => a === b // Simple equality for string IDs
);

export const pageDataFilesFamily = atomFamily(
  (pageId: string) => atom<DataFile[]>([]),
  (a, b) => a === b
);

// Global UI state (persisted)
export const isSidebarOpenAtom = atomWithStorage<boolean>('chat-sidebar-open', false);

// Page-specific loading states (non-persisted, lightweight)
export const pageLoadingFamily = atomFamily(
  (_pageId: string) => atom<boolean>(false),
  (a, b) => a === b
);

// Page-specific streaming state
export const pageStreamingMessageFamily = atomFamily(
  (_pageId: string) => atom<string | null>(null),
  (a, b) => a === b
);

// Page-specific draft message
export const pageDraftMessageFamily = atomFamily(
  (_pageId: string) => atom<string>(''),
  (a, b) => a === b
);

// ============= DERIVED ATOMS =============

// Get message count for a page (derived, cached)
export const pageMessageCountFamily = atomFamily(
  (pageId: string) => atom((get) => {
    const messages = get(pageMessagesFamily(pageId));
    return messages.length;
  }),
  (a, b) => a === b
);

// Get file count for a page (derived, cached)
export const pageFileCountFamily = atomFamily(
  (pageId: string) => atom((get) => {
    const files = get(pageDataFilesFamily(pageId));
    return files.length;
  }),
  (a, b) => a === b
);

// ============= WRITE-ONLY ATOMS (Actions) =============

// Add message action (write-only, no subscription)
export const addMessageActionFamily = atomFamily(
  (pageId: string) => atom(
    null,
    (get, set, message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
      const messagesAtom = pageMessagesFamily(pageId);
      const messages = get(messagesAtom);
      const newMessage: ChatMessage = {
        ...message,
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        pageId,
        timestamp: new Date(),
      };
      set(messagesAtom, [...messages, newMessage]);
      return newMessage;
    }
  ),
  (a, b) => a === b
);

// Batch add messages action
export const batchAddMessagesActionFamily = atomFamily(
  (pageId: string) => atom(
    null,
    (get, set, newMessages: Omit<ChatMessage, 'id' | 'timestamp'>[]) => {
      const messagesAtom = pageMessagesFamily(pageId);
      const messages = get(messagesAtom);
      const messagesWithIds = newMessages.map(msg => ({
        ...msg,
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        pageId,
        timestamp: new Date(),
      }));
      set(messagesAtom, [...messages, ...messagesWithIds]);
      return messagesWithIds;
    }
  ),
  (a, b) => a === b
);

// Clear messages action
export const clearMessagesActionFamily = atomFamily(
  (pageId: string) => atom(
    null,
    (_get, set) => {
      set(pageMessagesFamily(pageId), []);
    }
  ),
  (a, b) => a === b
);

// Add file action
export const addFileActionFamily = atomFamily(
  (pageId: string) => atom(
    null,
    (get, set, file: Omit<DataFile, 'id' | 'uploadedAt'>) => {
      const filesAtom = pageDataFilesFamily(pageId);
      const files = get(filesAtom);
      const newFile: DataFile = {
        ...file,
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        pageId,
        uploadedAt: new Date(),
      };
      set(filesAtom, [...files, newFile]);
      return newFile;
    }
  ),
  (a, b) => a === b
);

// Remove file action
export const removeFileActionFamily = atomFamily(
  (pageId: string) => atom(
    null,
    (get, set, fileId: string) => {
      const filesAtom = pageDataFilesFamily(pageId);
      const files = get(filesAtom);
      set(filesAtom, files.filter(f => f.id !== fileId));
    }
  ),
  (a, b) => a === b
);

// Set files action (batch update)
export const setFilesActionFamily = atomFamily(
  (pageId: string) => atom(
    null,
    (_get, set, files: DataFile[]) => {
      set(pageDataFilesFamily(pageId), files);
    }
  ),
  (a, b) => a === b
);

// Update message action
export const updateMessageActionFamily = atomFamily(
  (pageId: string) => atom(
    null,
    (get, set, { messageId, updates }: { messageId: string; updates: Partial<ChatMessage> }) => {
      const messagesAtom = pageMessagesFamily(pageId);
      const messages = get(messagesAtom);
      const messageIndex = messages.findIndex(m => m.id === messageId);

      if (messageIndex === -1) {
        console.error('[updateMessage] Message not found!', {
          messageId,
          pageId,
          availableMessageIds: messages.map(m => m.id),
          totalMessages: messages.length
        });
        return;
      }

      const updatedMessages = [...messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        ...updates,
        // Preserve required fields
        id: updatedMessages[messageIndex].id,
        pageId: updatedMessages[messageIndex].pageId,
        timestamp: updatedMessages[messageIndex].timestamp,
      };

      set(messagesAtom, updatedMessages);
    }
  ),
  (a, b) => a === b
);

// ============= CONNECTION STATUS =============

// Global connection status (not page-specific)
export const connectionStatusAtom = atom<'connected' | 'disconnected' | 'connecting'>('disconnected');

// ============= UTILITY ATOMS =============

// Reset all page data
export const resetPageDataActionFamily = atomFamily(
  (pageId: string) => atom(
    null,
    (_get, set) => {
      set(pageMessagesFamily(pageId), []);
      set(pageDataFilesFamily(pageId), []);
      set(pageLoadingFamily(pageId), false);
      set(pageStreamingMessageFamily(pageId), null);
      set(pageDraftMessageFamily(pageId), '');
    }
  ),
  (a, b) => a === b
);